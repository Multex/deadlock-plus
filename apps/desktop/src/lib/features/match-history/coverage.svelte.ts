import { untrack } from "svelte";
import type { DetailCoverage } from "@deadlock-plus/ipc-types/DetailCoverage";
import type { OwnRecovery } from "@deadlock-plus/ipc-types/OwnRecovery";
import { summarizeCoverage, type CoverageSummary } from "@deadlock-plus/match/coverage";
import type { MatchRow, RowMode } from "@deadlock-plus/match/list";
import { matchDetailCoverage } from "$lib/features/gc/api";
import { gcStatus } from "$lib/features/gc/status.svelte";
import { matchHistory } from "./history.svelte";

export type CoverageRow = Pick<MatchRow, "matchId" | "startTime" | "mode">;

const COVERED_MODES: ReadonlySet<RowMode> = new Set(["ranked", "unranked", "streetBrawl"]);

/**
 * The Deadlock API only lists matchmade matches by default, so private lobby, bot, Hero Labs, tutorial
 * and server test matches would read as missing forever and be asked about on every pass.
 */
export const coverageApplies = (mode: RowMode): boolean => COVERED_MODES.has(mode);
export type RunState = Pick<OwnRecovery, "running" | "paused" | "done" | "total" | "queued">;

export interface CoverageDeps {
    fetch(matchIds: number[]): Promise<DetailCoverage>;
    rows(): readonly CoverageRow[];
    recovery(): RunState | null;
    nowS(): number;
    later(ms: number, run: () => void): void;
}

interface Known {
    details: boolean;
    replay: boolean;
}

const NONE: ReadonlySet<number> = new Set();

/** Seconds the app's own API budget asks a refused call to wait, or null for any other failure. */
function retryInS(error: unknown): number | null {
    const raw = (error as { params?: { retry_in_s?: unknown } } | null)?.params?.retry_in_s;
    const secs = Number(raw);
    return raw !== undefined && Number.isFinite(secs) ? Math.max(1, secs) : null;
}
// The GC stops handing out replay salts 21 days after a match starts, so a run cannot add an older replay.
const REPLAY_RECOVERY_WINDOW_S = 21 * 86_400;

/**
 * Which of the player's matches the Deadlock API has full details and replays for. Every install shares
 * one API quota, so each match is asked about once per session: new matches as they show up, and a
 * run's matches when it ends. A failed call hides the strip until the next of those, which asks again.
 */
export class MatchCoverage {
    coverage = $state.raw<DetailCoverage | null>(null);

    private known = $state.raw<ReadonlyMap<number, Known>>(new Map());
    private asked = new Set<number>();
    private failed = new Set<number>();
    private stripReady = false;
    private inflight = new Set<number>();
    private rechecked = new Set<number>();
    private latest = new Map<number, number>();
    private token = 0;
    private retryPending = false;

    private wasRunning = false;
    private runIds = new Set<number>();
    private runTotal = 0;

    private queuedFor: readonly number[] | null = null;
    private queuedSet: ReadonlySet<number> = NONE;

    constructor(private deps: CoverageDeps) {}

    get summary(): CoverageSummary | null {
        const rows = this.rows();
        if (!this.coverage || rows.length === 0) return null;
        return summarizeCoverage(rows, this.coverage, this.deps.nowS());
    }

    /** Matches still waiting in the current run, paused or not. */
    get queued(): ReadonlySet<number> {
        const run = this.active();
        if (!run) return NONE;
        if (this.queuedFor !== run.queued) {
            this.queuedFor = run.queued;
            this.queuedSet = new Set(run.queued);
        }
        return this.queuedSet;
    }

    get run(): { done: number; total: number; paused: boolean } | null {
        const run = this.active();
        return run && { done: run.done, total: run.total, paused: run.paused };
    }

    /** False for a history match outside matchmaking; an unlisted match is assumed to count. */
    applies(matchId: number): boolean {
        const row = this.deps.rows().find((r) => r.matchId === matchId);
        return !row || coverageApplies(row.mode);
    }

    /** One match's coverage, or null until it is known. */
    forMatch(matchId: number): DetailCoverage | null {
        const k = this.known.get(matchId);
        if (!k) return null;
        return { withDetails: k.details ? [matchId] : [], withReplay: k.replay ? [matchId] : [] };
    }

    /**
     * Asks about one match unless the answer is known or already on its way. `hasDetails` says the
     * match has details now, so a stored answer without them is stale.
     */
    load(matchId: number, opts: { hasDetails?: boolean } = {}): void {
        untrack(() => {
            if (this.inflight.has(matchId) || !this.applies(matchId)) return;
            const k = this.known.get(matchId);
            if (k) {
                // Once per match: the API can lag behind the detail the app already shows.
                if (k.details || !opts.hasDetails || this.rechecked.has(matchId)) return;
                this.rechecked.add(matchId);
            }
            this.ask([matchId], false);
        });
    }

    /** Call from an effect: reads the rows and the run state, and asks the API when either calls for it. */
    sync(): void {
        this.trackRun();
        const rows = this.rows();
        if (rows.length === 0) return;
        untrack(() => this.askNew(rows));
    }

    private askNew(rows: CoverageRow[]): void {
        const ids: number[] = [];
        for (const r of rows) {
            if (this.asked.has(r.matchId)) continue;
            this.asked.add(r.matchId);
            if (!this.known.has(r.matchId) && !this.inflight.has(r.matchId)) ids.push(r.matchId);
        }
        if (ids.length > 0) {
            const retry = [...this.failed].filter((id) => !ids.includes(id));
            this.ask([...ids, ...retry], true);
        } else if (!this.stripReady) {
            this.stripReady = true;
            this.publish();
        }
    }

    /** Call from an effect: when a recovery run stops, asks about the matches it could have changed. */
    trackRun(): void {
        const run = this.deps.recovery();
        const running = run?.running ?? false;
        if (run && (running || run.paused)) {
            for (const id of run.queued) this.runIds.add(id);
            this.runTotal = run.total;
        }
        const ended = this.wasRunning && !running;
        this.wasRunning = running;
        if (!ended) return;

        untrack(() => {
            const ids = new Set(this.runIds);
            // Seen only part of the run (it started while nothing watched): fall back to every match it could touch.
            if (ids.size < this.runTotal) for (const id of this.couldChange()) ids.add(id);
            for (const id of this.failed) ids.add(id);
            this.runIds.clear();
            this.runTotal = 0;
            if (ids.size > 0) this.ask([...ids], true);
        });
    }

    private couldChange(): number[] {
        const nowS = this.deps.nowS();
        return this.rows()
            .filter((r) => {
                const k = this.known.get(r.matchId);
                if (!k?.details) return true;
                return !k.replay && nowS - r.startTime < REPLAY_RECOVERY_WINDOW_S;
            })
            .map((r) => r.matchId);
    }

    private ask(ids: number[], strip: boolean): void {
        const token = ++this.token;
        for (const id of ids) {
            this.latest.set(id, token);
            this.inflight.add(id);
        }
        const answered = () => ids.filter((id) => this.latest.get(id) === token);
        this.deps.fetch(ids).then(
            (cov) => {
                const details = new Set(cov.withDetails);
                const replay = new Set(cov.withReplay);
                const known = new Map(this.known);
                for (const id of answered()) {
                    this.inflight.delete(id);
                    this.failed.delete(id);
                    // The API never drops a match's details; replays expire.
                    known.set(id, { details: details.has(id) || !!known.get(id)?.details, replay: replay.has(id) });
                }
                this.known = known;
                if (strip) this.stripReady = true;
                this.publish();
            },
            (e: unknown) => {
                const failed = answered();
                for (const id of failed) {
                    this.inflight.delete(id);
                    if (this.asked.has(id)) this.failed.add(id);
                }
                if (this.failed.size > 0) this.coverage = null;
                console.warn("match coverage failed", e);
                const secs = retryInS(e);
                if (secs !== null) this.retryLater(secs, failed);
            },
        );
    }

    private retryLater(secs: number, ids: number[]): void {
        const detailIds = new Set(ids.filter((id) => !this.asked.has(id)));
        if (this.retryPending && detailIds.size === 0) return;
        this.retryPending = true;
        this.deps.later(secs * 1000, () => {
            this.retryPending = false;
            const fresh = [...detailIds].filter((id) => !this.known.has(id));
            const retry = [...new Set([...this.failed, ...fresh])].filter((id) => !this.inflight.has(id));
            if (retry.length > 0) this.ask(retry, this.failed.size > 0);
        });
    }

    private publish(): void {
        if (!this.stripReady || this.failed.size > 0) return;
        const withDetails: number[] = [];
        const withReplay: number[] = [];
        for (const [id, k] of this.known) {
            if (k.details) withDetails.push(id);
            if (k.replay) withReplay.push(id);
        }
        this.coverage = { withDetails, withReplay };
    }

    private rows(): CoverageRow[] {
        return this.deps.rows().filter((r) => coverageApplies(r.mode));
    }

    private active(): RunState | null {
        const run = this.deps.recovery();
        return run && (run.running || run.paused) ? run : null;
    }
}

export const matchCoverage = new MatchCoverage({
    fetch: matchDetailCoverage,
    rows: () => matchHistory.rows,
    recovery: () => gcStatus.status?.ownRecovery ?? null,
    nowS: () => Math.floor(Date.now() / 1000),
    later: (ms, run) => void setTimeout(run, ms),
});
