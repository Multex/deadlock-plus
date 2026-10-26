import { errorText } from "$lib/core/errors";
import { ApiBusy } from "$lib/features/api-health/api-busy.svelte";
import { stats, type StatsStatus } from "$lib/features/stats/stats.svelte";
import type { Match } from "@deadlock-plus/stats/stats";
import { resolveDetail } from "./api";
import { allPlayers, type MatchDetail } from "@deadlock-plus/match/detail";
import { DEFAULT_FILTERS, filterRows, type RowFilters } from "@deadlock-plus/match/filters";
import { buildRows, type MatchRow } from "@deadlock-plus/match/list";
import { withNames } from "@deadlock-plus/match/names";
import { playerNames } from "./names";
import { paginate, type Page } from "@deadlock-plus/match/pagination";
import { groupBySession, paginateSessions, type SessionGroup } from "@deadlock-plus/match/sessions";
import { shouldSuggestBreak, type Bucket, type Session } from "@deadlock-plus/stats/sessions";
import { buildFindings, type Finding } from "$lib/features/stats/insights";
import { settings } from "$lib/features/settings/settings.svelte";
import { LOSS_STREAK, modeSessions } from "./break-reminder";

export { LOSS_STREAK };

export type DetailStatus = "idle" | "loading" | "ready" | "unavailable" | "error";

export interface HistoryDeps {
    source: {
        readonly matches: Match[];
        readonly status: StatsStatus;
        readonly error: string | null;
        load(accountId: number, force?: boolean): Promise<void>;
    };
    resolveDetail(matchId: number): Promise<MatchDetail | null>;
    resolveNames(accountIds: number[]): Promise<ReadonlyMap<number, string>>;
    now(): number;
    breakHint(): boolean;
}

export class MatchHistoryStore {
    filters = $state.raw<RowFilters>({ ...DEFAULT_FILTERS });
    page = $state(1);
    detailMatchId = $state<number | null>(null);
    detailStatus = $state<DetailStatus>("idle");
    detail = $state.raw<MatchDetail | null>(null);
    detailError = $state<string | null>(null);
    /** Set while the API turns the open match away as busy; it opens again on its own. */
    readonly detailBusy = new ApiBusy(() =>
        this.detailMatchId === null ? undefined : this.openDetail(this.detailMatchId),
    );

    private token = 0;
    private rowsFor: Match[] | null = null;
    private rowsCache: MatchRow[] = [];

    constructor(private deps: HistoryDeps) {}

    get status(): StatsStatus {
        return this.deps.source.status;
    }

    get error(): string | null {
        return this.deps.source.error;
    }

    /** Newest first. The stats store already merges captured matches that the API has not returned yet. */
    get rows(): MatchRow[] {
        const matches = this.deps.source.matches;
        if (this.rowsFor !== matches) {
            this.rowsFor = matches;
            this.rowsCache = buildRows(matches, []);
        }
        return this.rowsCache;
    }

    get filtered(): MatchRow[] {
        return filterRows(this.rows, this.filters, this.nowS);
    }

    get view(): Page<MatchRow> {
        return paginate(this.filtered, this.page);
    }

    get sessionView(): Page<SessionGroup> {
        return paginateSessions(groupBySession(this.filtered, this.rows, this.nowS), this.page);
    }

    get insights(): { baseline: Bucket; findings: Finding[] } {
        return buildFindings(this.modeSessions, -new Date(this.deps.now()).getTimezoneOffset());
    }

    get suggestBreak(): boolean {
        return this.deps.breakHint() && shouldSuggestBreak(this.modeSessions, LOSS_STREAK, this.nowS);
    }

    private get nowS(): number {
        return Math.floor(this.deps.now() / 1000);
    }

    // Findings and the break hint follow only the mode filter: a hero or outcome filter would
    // cut sessions apart and skew the streaks they read.
    private get modeSessions(): Session[] {
        return modeSessions(this.deps.source.matches, this.filters);
    }

    load(accountId: number, force = false): Promise<void> {
        return this.deps.source.load(accountId, force);
    }

    setFilters(patch: Partial<RowFilters>) {
        this.filters = { ...this.filters, ...patch };
        this.page = 1;
    }

    resetFilters() {
        this.filters = { ...DEFAULT_FILTERS };
        this.page = 1;
    }

    setPage(page: number) {
        this.page = page;
    }

    /** One match, on demand. `null` means there is no detail source for it (captured data only) or it failed. */
    async openDetail(matchId: number): Promise<MatchDetail | null> {
        const token = ++this.token;
        const current = () => token === this.token;
        this.detailMatchId = matchId;
        this.detailStatus = "loading";
        this.detail = null;
        this.detailError = null;

        let parsed: MatchDetail | null;
        try {
            parsed = await this.deps.resolveDetail(matchId);
        } catch (e) {
            if (current()) {
                this.detailBusy.handle(e);
                this.detailStatus = "error";
                this.detailError = errorText(e);
            }
            return null;
        }
        if (!current()) return null;
        this.detailBusy.clear();
        if (parsed === null) {
            this.detailStatus = "unavailable";
            return null;
        }
        this.detail = parsed;
        this.detailStatus = "ready";

        try {
            const names = await this.deps.resolveNames(allPlayers(parsed).map((p) => p.accountId));
            if (!current()) return null;
            this.detail = withNames(parsed, names);
        } catch {
            // Unnamed players show the localised fallback.
        }
        return this.detail;
    }

    closeDetail() {
        this.token++;
        this.detailBusy.clear();
        this.detailMatchId = null;
        this.detailStatus = "idle";
        this.detail = null;
        this.detailError = null;
    }
}

export const matchHistory = new MatchHistoryStore({
    source: stats,
    resolveDetail,
    resolveNames: (ids) => playerNames.resolve(ids),
    now: () => Date.now(),
    breakHint: () => settings.breakHint,
});
