import type { AssetLevelInfo } from "@deadlock-plus/deadlock-api";

/** Souls every player starts a match with: net worth is the souls threshold plus this. */
export const STARTING_SOULS = 600;

export interface Level {
    level: number;
    /** Souls earned to reach the level. */
    souls: number;
    /** Ability points gained up to and including this level. */
    ap: number;
    /** Ability unlocks gained up to and including this level. */
    unlocks: number;
    apGained: number;
    unlocksGained: number;
}

export interface LevelTable {
    levels: readonly Level[];
    levelAt(souls: number): number;
    apAt(souls: number): number;
    unlocksAt(souls: number): number;
}

export function netWorthFor(threshold: number): number {
    return threshold + STARTING_SOULS;
}

export function createLevelTable(info: Record<string, AssetLevelInfo>): LevelTable {
    const rows = Object.entries(info)
        .map(([level, row]) => ({ level: Number(level), row }))
        .sort((a, b) => a.level - b.level);
    if (rows.length === 0) throw new Error("level table is empty");

    let ap = 0;
    let unlocks = 0;
    const levels: Level[] = rows.map(({ level, row }) => {
        const unlocksGained = row.bonus_currencies?.includes("EAbilityUnlocks") ? 1 : 0;
        const apGained = row.bonus_currencies?.includes("EAbilityPoints") ? 1 : 0;
        ap += apGained;
        unlocks += unlocksGained;
        return { level, souls: row.required_gold, ap, unlocks, apGained, unlocksGained };
    });

    const reached = (souls: number): Level => {
        let found = levels[0]!;
        for (const l of levels) {
            if (l.souls > souls) break;
            found = l;
        }
        return found;
    };

    return {
        levels,
        levelAt: (souls) => reached(souls).level,
        apAt: (souls) => (souls < levels[0]!.souls ? 0 : reached(souls).ap),
        unlocksAt: (souls) => (souls < levels[0]!.souls ? 0 : reached(souls).unlocks),
    };
}
