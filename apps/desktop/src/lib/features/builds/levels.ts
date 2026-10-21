import { loadHeroProgression } from "$lib/features/gamedata/vdata";
import type { AssetLevelInfo } from "@deadlock-plus/deadlock-api";
import type { LevelInfo } from "@deadlock-plus/ipc-types/LevelInfo";

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

/** From a hero's `level_info` in the Deadlock API's hero assets. */
export function createLevelTable(info: Record<string, AssetLevelInfo>): LevelTable {
    return createProgressionTable(
        Object.entries(info).map(([level, row]) => ({
            level: Number(level),
            souls: row.required_gold,
            ap: row.bonus_currencies?.includes("EAbilityPoints") ? 1 : 0,
            unlocks: row.bonus_currencies?.includes("EAbilityUnlocks") ? 1 : 0,
        })),
    );
}

/** From the game's level table, where each level lists what it adds. */
export function createProgressionTable(info: readonly LevelInfo[]): LevelTable {
    const rows = [...info].sort((a, b) => a.level - b.level);
    if (rows.length === 0) throw new Error("level table is empty");

    let ap = 0;
    let unlocks = 0;
    const levels: Level[] = rows.map((row) => {
        ap += row.ap;
        unlocks += row.unlocks;
        return { level: row.level, souls: row.souls, ap, unlocks, apGained: row.ap, unlocksGained: row.unlocks };
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

/** The installed game's level table, else a hero asset's `level_info`; null when neither has levels. */
export async function loadLevelTable(fallback?: Record<string, AssetLevelInfo>): Promise<LevelTable | null> {
    const { levels } = await loadHeroProgression();
    if (levels.length > 0) return createProgressionTable(levels);
    return fallback && Object.keys(fallback).length > 0 ? createLevelTable(fallback) : null;
}
