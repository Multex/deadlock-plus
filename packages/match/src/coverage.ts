import type { MatchRow } from "./list";

export interface DetailCoverage {
    withDetails: number[];
    withReplay: number[];
}

export interface CoverageSummary {
    total: number;
    full: number;
    missing: number;
    recent: number;
    replays: number;
    missingIds: number[];
    /** Matches under 21 days old with details and no replay, newest first. */
    replayIds: number[];
}

export type RowCoverageState = "missing" | "recovering" | null;

const RECENT_WINDOW_S = 30 * 86_400;
// The GC stops handing out replay salts 21 days after a match starts.
const REPLAY_RECOVERY_WINDOW_S = 21 * 86_400;

const newestFirst = (rows: Pick<MatchRow, "matchId" | "startTime">[]) =>
    rows.sort((a, b) => b.startTime - a.startTime).map((r) => r.matchId);

export function summarizeCoverage(
    rows: readonly Pick<MatchRow, "matchId" | "startTime">[],
    cov: DetailCoverage,
    nowS: number,
): CoverageSummary {
    const withDetails = new Set(cov.withDetails);
    const withReplay = new Set(cov.withReplay);
    const missing = rows.filter((r) => !withDetails.has(r.matchId));
    const recent = rows.filter((r) => nowS - r.startTime < RECENT_WINDOW_S);
    const noReplay = rows.filter(
        (r) =>
            nowS - r.startTime < REPLAY_RECOVERY_WINDOW_S && withDetails.has(r.matchId) && !withReplay.has(r.matchId),
    );
    return {
        total: rows.length,
        full: rows.length - missing.length,
        missing: missing.length,
        recent: recent.length,
        replays: recent.filter((r) => withReplay.has(r.matchId)).length,
        missingIds: newestFirst(missing),
        replayIds: newestFirst(noReplay),
    };
}

export function rowState(
    id: number,
    cov: DetailCoverage | null,
    queued: ReadonlySet<number> | readonly number[],
): RowCoverageState {
    if (!cov) return null;
    const isQueued = Array.isArray(queued) ? queued.includes(id) : (queued as ReadonlySet<number>).has(id);
    if (isQueued) return "recovering";
    return detailSet(cov).has(id) ? null : "missing";
}

const detailSets = new WeakMap<DetailCoverage, Set<number>>();

function detailSet(cov: DetailCoverage): Set<number> {
    let set = detailSets.get(cov);
    if (!set) {
        set = new Set(cov.withDetails);
        detailSets.set(cov, set);
    }
    return set;
}
