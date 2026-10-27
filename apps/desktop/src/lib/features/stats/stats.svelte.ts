import { untrack } from "svelte";
import { deadlockApi } from "$lib/core/deadlock-api";
import { t } from "$lib/core/i18n.svelte";
import { kvGet, kvSet } from "$lib/core/kv";
import { ApiBusy } from "$lib/features/api-health/api-busy.svelte";
import { nextRequestIn } from "$lib/features/api-health/busy";
import { onGameArtChanged } from "$lib/features/gamedata/art-refresh";
import { DeadlockApiError } from "@deadlock-plus/deadlock-api";
import { parseStatsCache, toStatsCache, type StatsSnapshot } from "@deadlock-plus/stats/cache";
import { apiForm, loadApiRanks, withLocalArt } from "$lib/features/ranks/ranks";
import { parseRankInfo, type RankInfo, type RankTier } from "@deadlock-plus/stats/rank";
import { getPostgameMatches, onPostgameMatch, reconcilePostgameMatches, type ProvisionalMatch } from "./postgame-api";
import { forAccount, mergeProvisional } from "@deadlock-plus/stats/provisional";
import { createReconcileSchedule } from "@deadlock-plus/stats/reconcile-schedule";
import { parseHistory, type Match } from "@deadlock-plus/stats/stats";

const CACHE_STORE = "stats-cache";
const STALE_MS = 5 * 60 * 1000;

export type StatsStatus = "idle" | "loading" | "ready" | "error";

class StatsStore {
    status = $state<StatsStatus>("idle");
    private apiMatches = $state<Match[]>([]);
    private provisional = $state<ProvisionalMatch[]>([]);
    matches = $derived<Match[]>(mergeProvisional(this.apiMatches, this.provisional));
    ranks = $state<RankTier[]>([]);
    rankInfo = $state<RankInfo | null>(null);
    error = $state<string | null>(null);
    /** Set while the data shown is a saved copy from this time (ms) because the API could not be reached. */
    cachedAt = $state<number | null>(null);
    /** Set while the API turns the history away as busy; it loads again on its own. */
    readonly busy = new ApiBusy(() => (this.wanted === null ? undefined : this.load(this.wanted, true)));
    private account: number | null = null;
    private wanted: number | null = null;
    private loadedFor: number | null = null;
    private loadedAt = 0;
    private listening = false;
    private schedule = createReconcileSchedule({
        run: () => this.quietRefresh(),
        pending: () => this.provisional.length > 0,
    });

    /**
     * Pages call this from an effect. Nothing read here may become that effect's dependency: the status
     * changes when a load ends, and an effect that depended on it would start the next load at once.
     */
    load(accountId: number, force = false): Promise<void> {
        return untrack(() => this.request(accountId, force));
    }

    /** One load at a time. An account asked for while another is loading gets its turn when that load ends. */
    private async request(accountId: number, force: boolean) {
        this.wanted = accountId;
        if (this.status === "loading") return;
        await this.fetch(accountId, force);
        if (this.wanted !== accountId) await this.request(this.wanted, false);
    }

    private async fetch(accountId: number, force: boolean) {
        this.switchAccount(accountId);
        const fresh = this.loadedFor === accountId && Date.now() - this.loadedAt < STALE_MS;
        if (fresh && !force) return;
        // While the API is busy only the planned retry, a refresh or Try now asks again.
        if (this.busy.active && !force) return;

        this.status = "loading";
        this.error = null;
        void this.listenForCaptures();
        try {
            const [history, apiRanks, rank] = await Promise.all([
                // It rejects only when the request never got an answer; a bad status comes back as a value.
                deadlockApi.playerMatchHistory(accountId).catch(() => {
                    throw new Error(t("errors.common.network"));
                }),
                loadApiRanks(),
                deadlockApi.playerRank(accountId).catch(() => null),
            ]);
            // A rate-limited response still carries the stored history in its body.
            const matches = parseHistory(history.body);
            if (!history.ok && matches.length === 0)
                throw new DeadlockApiError(history.status, nextRequestIn(history.body));
            // Art is read once the slow requests are done, so a game update meanwhile cannot leave old paths.
            const ranks = await withLocalArt(apiRanks);

            this.apply({ matches, ranks, rankInfo: parseRankInfo(rank) });
            this.busy.clear();
            this.cachedAt = null;
            void this.save(accountId);
            this.loadedFor = accountId;
            this.loadedAt = Date.now();
            this.status = "ready";
            await this.syncProvisional(matches.map((m) => m.matchId));
            this.schedule.arrived();
        } catch (e) {
            this.busy.handle(e);
            const cached = await this.readCache(accountId);
            if (cached) {
                this.apply(cached);
                void withLocalArt(cached.ranks).then((r) => {
                    if (this.loadedFor === accountId) this.ranks = r;
                });
                this.cachedAt = cached.at;
                this.loadedFor = accountId;
                this.loadedAt = Date.now();
                this.status = "ready";
                await this.syncProvisional(null);
                this.schedule.arrived();
                return;
            }
            // Matches captured on this PC still show while the API is down.
            await this.syncProvisional(null);
            this.error =
                e instanceof DeadlockApiError
                    ? t("stats.api_error", { status: e.status })
                    : e instanceof Error
                      ? e.message
                      : String(e);
            this.status = "error";
        }
    }

    /** Points the rank badges at the current game build's art. */
    async relinkArt() {
        if (this.ranks.length === 0) return;
        const accountId = this.loadedFor;
        const ranks = await withLocalArt(this.ranks);
        if (this.loadedFor === accountId) this.ranks = ranks;
    }

    private switchAccount(accountId: number) {
        if (this.account === accountId) return;
        this.account = accountId;
        this.busy.clear();
        this.provisional = [];
        this.schedule.stop();
    }

    private apply({ matches, ranks, rankInfo }: StatsSnapshot) {
        this.apiMatches = matches;
        this.ranks = ranks;
        this.rankInfo = rankInfo;
    }

    private async syncProvisional(apiMatchIds: number[] | null) {
        const accountId = this.account;
        if (accountId === null) return;
        try {
            if (apiMatchIds) await reconcilePostgameMatches(accountId, apiMatchIds);
            const stored = forAccount(await getPostgameMatches(accountId), accountId);
            if (this.account === accountId) this.provisional = stored;
        } catch {
            // Capture is off or unavailable: the API history stands alone.
        }
    }

    private async quietRefresh() {
        if (this.loadedFor === null || this.status === "loading") return;
        const accountId = this.loadedFor;
        const history = await deadlockApi.playerMatchHistory(accountId);
        const matches = parseHistory(history.body);
        if (matches.length === 0 || this.loadedFor !== accountId) return;
        this.apiMatches = matches;
        this.cachedAt = null;
        void this.save(accountId);
        await this.syncProvisional(matches.map((m) => m.matchId));
    }

    private async listenForCaptures() {
        if (this.listening) return;
        this.listening = true;
        try {
            await onPostgameMatch((record) => {
                if (this.account === null || record.accountId !== this.account) return;
                this.provisional = [...this.provisional.filter((m) => m.matchId !== record.matchId), record];
                this.schedule.arrived();
            });
            window.addEventListener("focus", () => this.schedule.focused());
        } catch {
            this.listening = false;
        }
    }

    private async save(accountId: number) {
        try {
            const snapshot = { matches: this.apiMatches, ranks: apiForm(this.ranks), rankInfo: this.rankInfo };
            await kvSet(CACHE_STORE, "snapshot", toStatsCache(accountId, Date.now(), snapshot));
        } catch {
            // Best-effort: without it there is just nothing to show offline.
        }
    }

    private async readCache(accountId: number) {
        try {
            return parseStatsCache(await kvGet(CACHE_STORE, "snapshot"), accountId);
        } catch {
            return null;
        }
    }
}

export const stats = new StatsStore();

onGameArtChanged(() => stats.relinkArt());
