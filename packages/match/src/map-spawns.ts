import type { MapItem } from "@deadlock-plus/ipc-types/MapItem";
import type { MatchTeam, MidBossEvent } from "./detail";

/** First spawn per camp tier, from the game's spawn rules. Clears after that are estimated from player movement in `camp-clears.ts`. */
export const CAMP_FIRST_SPAWN_S = {
    camp_weak: 120,
    camp_medium: 300,
    camp_strong: 480,
    camp_vault: 480,
} as const satisfies Partial<Record<MapItem["kind"], number>>;

/** Inferred from recorded matches: the spawn rules gate the first spawn on game rules, not on a delay. */
export const MID_BOSS_FIRST_SPAWN_S = 600;
export const MID_BOSS_RESPAWN_S = 420;
export const MID_BOSS_RESPAWN_CHANGE_S = -60;
export const MID_BOSS_RESPAWN_MIN_S = 300;
export const MID_BOSS_FADE_IN_S = 5;
export const MID_BOSS_CLAIM_MARKER_S = 20;

export function campSpawned(kind: MapItem["kind"], time: number): boolean {
    const first = (CAMP_FIRST_SPAWN_S as Partial<Record<MapItem["kind"], number>>)[kind];
    return first === undefined || time >= first;
}

/** Estimated respawn delay after the kill at `killIndex` (0 is the first kill of the match). */
export function midBossRespawnS(killIndex: number): number {
    return Math.max(MID_BOSS_RESPAWN_S + MID_BOSS_RESPAWN_CHANGE_S * killIndex, MID_BOSS_RESPAWN_MIN_S);
}

const killTimes = (kills: readonly MidBossEvent[]): MidBossEvent[] =>
    kills.filter((k) => k.destroyedS > 0).sort((a, b) => a.destroyedS - b.destroyedS);

/** 0 while the mid boss is down, 1 while it is up, a ramp over the last seconds before an estimated respawn. */
export function midBossOpacity(kills: readonly MidBossEvent[], time: number): number {
    const sorted = killTimes(kills);
    const last = sorted.findLastIndex((k) => k.destroyedS <= time);
    if (last < 0) return time >= MID_BOSS_FIRST_SPAWN_S ? 1 : 0;
    const spawn = sorted[last]!.destroyedS + midBossRespawnS(last);
    return Math.min(Math.max((time - (spawn - MID_BOSS_FADE_IN_S)) / MID_BOSS_FADE_IN_S, 0), 1);
}

/** The team that took the mid boss, for a short window after each kill. Claimed wins over killed. */
export function midBossClaimAt(kills: readonly MidBossEvent[], time: number): MatchTeam | null {
    const kill = killTimes(kills).findLast((k) => k.destroyedS <= time);
    if (!kill || time >= kill.destroyedS + MID_BOSS_CLAIM_MARKER_S) return null;
    return kill.claimedBy ?? kill.killedBy ?? null;
}
