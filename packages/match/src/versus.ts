import type { MatchRow } from "./list";

/** Fewer same-hero matches than this and an average says too little to mark against. */
export const MIN_VERSUS_SAMPLES = 3;

/** Share of the average inside which a value counts as equal. */
export const VERSUS_TOLERANCE = 0.1;
/** Smallest gap that is ever a difference, so a 1-kill swing on a 3-kill average stays visible but 0.2 does not. */
const MIN_ABSOLUTE_GAP: Record<VersusKey, number> = { kills: 0.5, deaths: 0.5, assists: 0.5, souls: 0 };

export type VersusKey = "kills" | "deaths" | "assists" | "souls";
export type VersusMark = "above" | "below" | "equal";

export const VERSUS_KEYS: readonly VersusKey[] = ["kills", "deaths", "assists", "souls"];

export interface Own {
    heroId: number;
    kills: number;
    deaths: number;
    assists: number;
    souls: number;
    durationS: number;
}

export interface VersusStat {
    /** Souls are a per-minute rate on both sides; the other keys are per-match counts. */
    average: number;
    value: number;
    mark: VersusMark;
}

export interface Versus {
    heroId: number;
    samples: number;
    stats: Record<VersusKey, VersusStat | null>;
}

const comparable = (r: MatchRow) =>
    r.source === "api" && r.outcome !== "unscored" && r.mode !== "custom" && r.mode !== "bot";

const perMinute = (souls: number, durationS: number) => (durationS > 0 ? souls / (durationS / 60) : null);

function markOf(key: VersusKey, value: number, average: number): VersusMark {
    const gap = value - average;
    const band = Math.max(Math.abs(average) * VERSUS_TOLERANCE, MIN_ABSOLUTE_GAP[key]);
    if (Math.abs(gap) <= band) return "equal";
    return gap > 0 ? "above" : "below";
}

/**
 * Compares one player's numbers with their own average on the same hero. Built from list rows only;
 * the match itself, provisional, unscored, custom and bot rows are left out of the average.
 */
export function versusFor(rows: readonly MatchRow[], own: Own, matchId: number): Versus | null {
    const sample = rows.filter((r) => r.heroId === own.heroId && r.matchId !== matchId && comparable(r));
    if (sample.length < MIN_VERSUS_SAMPLES) return null;

    const mean = (pick: (r: MatchRow) => number) => sample.reduce((n, r) => n + pick(r), 0) / sample.length;
    const rates = sample.flatMap((r) => {
        const rate = perMinute(r.souls, r.durationS);
        return rate === null ? [] : [rate];
    });

    const stat = (key: VersusKey, value: number | null, average: number | null): VersusStat | null =>
        value === null || average === null ? null : { average, value, mark: markOf(key, value, average) };

    return {
        heroId: own.heroId,
        samples: sample.length,
        stats: {
            kills: stat(
                "kills",
                own.kills,
                mean((r) => r.kills),
            ),
            deaths: stat(
                "deaths",
                own.deaths,
                mean((r) => r.deaths),
            ),
            assists: stat(
                "assists",
                own.assists,
                mean((r) => r.assists),
            ),
            souls: stat(
                "souls",
                perMinute(own.souls, own.durationS),
                rates.length === 0 ? null : rates.reduce((n, r) => n + r, 0) / rates.length,
            ),
        },
    };
}

/** Whether an above-average value is the good direction for the key. */
export const higherIsBetter = (key: VersusKey) => key !== "deaths";

export interface VersusSummary {
    better: number;
    worse: number;
    even: number;
}

export function summarizeVersus(v: Versus): VersusSummary {
    const out: VersusSummary = { better: 0, worse: 0, even: 0 };
    for (const key of VERSUS_KEYS) {
        const s = v.stats[key];
        if (!s) continue;
        if (s.mark === "equal") out.even++;
        else if ((s.mark === "above") === higherIsBetter(key)) out.better++;
        else out.worse++;
    }
    return out;
}
