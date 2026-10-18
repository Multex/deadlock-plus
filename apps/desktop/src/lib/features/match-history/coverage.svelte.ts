import type { DetailCoverage } from "@deadlock-plus/ipc-types/DetailCoverage";
import type { OwnRecovery } from "@deadlock-plus/ipc-types/OwnRecovery";
import { summarizeCoverage, type CoverageSummary } from "@deadlock-plus/match/coverage";
import type { MatchRow } from "@deadlock-plus/match/list";
import { matchDetailCoverage } from "$lib/features/gc/api";
import { gcStatus } from "$lib/features/gc/status.svelte";
import { matchHistory } from "./history.svelte";

export type CoverageRow = Pick<MatchRow, "matchId" | "startTime">;
export type RunState = Pick<OwnRecovery, "running" | "paused" | "done" | "total" | "queued">;

export interface CoverageDeps {
    fetch(matchIds: number[]): Promise<DetailCoverage>;
    rows(): readonly CoverageRow[];
    recovery(): RunState | null;
    nowS(): number;
}

const NONE: ReadonlySet<number> = new Set();

/**
 * Which of the player's matches the Deadlock API has full details and replays for. Asked once per
 * session for the matches seen so far; asked again when a new match shows up or a recovery run ends.
 * Coverage is extra: a failed call hides it until one of those happens.
 */
export class MatchCoverage {
    coverage = $state.raw<DetailCoverage | null>(null);

    private asked: Set<number> | null = null;
    private wasRunning = false;
    private token = 0;
    private queuedFor: readonly number[] | null = null;
    private queuedSet: ReadonlySet<number> = NONE;

    constructor(private deps: CoverageDeps) {}

    get summary(): CoverageSummary | null {
        const rows = this.deps.rows();
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

    /** Call from an effect: reads the rows and the run state, and asks the API when either calls for it. */
    sync(): void {
        const rows = this.deps.rows();
        const running = this.deps.recovery()?.running ?? false;
        const runEnded = this.wasRunning && !running;
        this.wasRunning = running;
        if (rows.length === 0) return;

        const asked = this.asked;
        if (!runEnded && asked && rows.every((r) => asked.has(r.matchId))) return;

        const ids = rows.map((r) => r.matchId);
        this.asked = new Set(ids);
        const token = ++this.token;
        this.deps.fetch(ids).then(
            (cov) => {
                if (token === this.token) this.coverage = cov;
            },
            (e: unknown) => {
                if (token !== this.token) return;
                this.coverage = null;
                console.warn("match coverage failed", e);
            },
        );
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
});
