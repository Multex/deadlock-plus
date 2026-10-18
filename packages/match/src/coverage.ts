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
}

export type RowCoverageState = "missing" | "recovering" | null;

const RECENT_WINDOW_S = 30 * 86_400;

export function summarizeCoverage(
    rows: readonly Pick<MatchRow, "matchId" | "startTime">[],
    cov: DetailCoverage,
    nowS: number,
): CoverageSummary {
    const withDetails = new Set(cov.withDetails);
    const withReplay = new Set(cov.withReplay);
    const missing = rows.filter((r) => !withDetails.has(r.matchId));
    const recent = rows.filter((r) => nowS - r.startTime < RECENT_WINDOW_S);
    return {
        total: rows.length,
        full: rows.length - missing.length,
        missing: missing.length,
        recent: recent.length,
        replays: recent.filter((r) => withReplay.has(r.matchId)).length,
        missingIds: missing.sort((a, b) => b.startTime - a.startTime).map((r) => r.matchId),
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
