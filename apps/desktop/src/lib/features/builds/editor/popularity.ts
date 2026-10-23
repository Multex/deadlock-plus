import type { AnalyticsFilter, HeroStatsRow, ItemStats, ItemStatsFilter } from "@deadlock-plus/deadlock-api";
import type { PhaseStat } from "@deadlock-plus/game-ui/hero";
import type { PopularItems } from "@deadlock-plus/ipc-types/PopularItems";

export const PHASES = ["early", "mid", "late"] as const;
export type Phase = (typeof PHASES)[number];

/**
 * Buy-time windows per phase, in seconds. The game's own cuts are convars
 * (`citadel_popular_items_{earlygame,midgame}_endtime`) whose values ship in no file we read, so these
 * are ours: early before 10 minutes, mid before 25, late after.
 */
export const PHASE_WINDOWS: Record<Phase, Pick<ItemStatsFilter, "minBoughtAtS" | "maxBoughtAtS">> = {
    early: { maxBoughtAtS: 599 },
    mid: { minBoughtAtS: 600, maxBoughtAtS: 1499 },
    late: { minBoughtAtS: 1500 },
};

/** Both endpoints default to the last 30 days, so leaving the time out keeps their samples the same. */
export const HERO_MATCHES_FILTER: AnalyticsFilter = { gameMode: "normal" };

export function phaseFilter(heroId: number, phase: Phase): ItemStatsFilter {
    return { heroIds: [heroId], ...HERO_MATCHES_FILTER, ...PHASE_WINDOWS[phase] };
}

export function heroMatches(rows: readonly HeroStatsRow[], heroId: number): number {
    return rows.find((r) => r.hero_id === heroId)?.matches ?? 0;
}

export interface ItemPopularity {
    /** Share of the hero's matches that bought the item in the phase, 0-100. */
    pickPct: number;
    /** Share of those matches won, 0-100. */
    winPct: number;
    matches: number;
}

export type PhaseStats = Record<Phase, Map<number, ItemPopularity>>;

export function phaseStats(rows: readonly ItemStats[], heroMatchCount: number): Map<number, ItemPopularity> {
    const stats = new Map<number, ItemPopularity>();
    if (heroMatchCount <= 0) return stats;
    for (const row of rows) {
        if (row.matches <= 0) continue;
        stats.set(row.item_id, {
            pickPct: Math.min(100, (row.matches / heroMatchCount) * 100),
            winPct: (row.wins / row.matches) * 100,
            matches: row.matches,
        });
    }
    return stats;
}

/** The item's pick and win % in each phase deadlock-api has it in; empty without API data. */
export function phaseStatsFor(api: PhaseStats | null, itemId: number): PhaseStat[] {
    if (api === null) return [];
    return PHASES.flatMap((phase) => {
        const s = api[phase].get(itemId);
        return s ? [{ phase, pickPercent: s.pickPct, winPercent: s.winPct }] : [];
    });
}

export interface GamePopular {
    phase: Phase;
    pickPct: number;
}

const GAME_PHASE_KEYS = { early: "earlyGame", mid: "midGame", late: "lateGame" } as const;

/** The items on the hero's Popular page in the game, each with the phases it is listed in. */
export function gamePopular(popular: PopularItems | null): Map<number, GamePopular[]> {
    const byItem = new Map<number, GamePopular[]>();
    if (popular === null) return byItem;
    for (const phase of PHASES) {
        for (const item of popular[GAME_PHASE_KEYS[phase]]) {
            const list = byItem.get(item.id) ?? [];
            list.push({ phase, pickPct: item.pickPct });
            byItem.set(item.id, list);
        }
    }
    return byItem;
}

/** Pick % in `phase`: the API's when it answered, else the game's for its Popular items. */
export function pickScore(
    phase: Phase,
    api: PhaseStats | null,
    game: ReadonlyMap<number, readonly GamePopular[]>,
): (itemId: number) => number | undefined {
    if (api !== null) return (id) => api[phase].get(id)?.pickPct;
    return (id) => game.get(id)?.find((g) => g.phase === phase)?.pickPct;
}
