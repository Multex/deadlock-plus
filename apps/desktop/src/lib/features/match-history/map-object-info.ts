import type { MapItem } from "$lib/generated/types/MapItem";
import { laneForObjectiveSlot, type Lane } from "./deep-dive/lanes";
import type { ObjectiveKind } from "./deep-dive/names";
import type { MatchObjective, MatchTeam, MidBossEvent } from "./detail";

/** Match seconds a destroyed objective stays marked on the map. */
export const OBJECTIVE_HIGHLIGHT_S = 10;

/** The API reports some never-fought objectives as destroyed at one second. */
const PLACEHOLDER_DESTROY_MAX_S = 1;

export const rowTeam = (row: MapItem): MatchTeam | null =>
    row.team === null ? null : row.team === 1 ? "archmother" : "hidden-king";

/** 1 at the destroy time, falling to 0 at the end of the highlight window; 0 before it. */
export function highlightOpacity(destroyedS: number, time: number, windowS = OBJECTIVE_HIGHLIGHT_S): number {
    const elapsed = time - destroyedS;
    if (elapsed < 0 || elapsed >= windowS) return 0;
    return 1 - elapsed / windowS;
}

/** The match entries of a table row, with placeholder destroy times removed. Shrines have none. */
export function rowEntries(row: MapItem, objectives: readonly MatchObjective[]): MatchObjective[] {
    const team = rowTeam(row);
    if (row.objectiveId === null || team === null) return [];
    return objectives
        .filter((o) => o.objectiveId === row.objectiveId && o.team === team)
        .map((o) => {
            if (o.destroyedS === undefined || o.destroyedS > PLACEHOLDER_DESTROY_MAX_S) return o;
            const { destroyedS: _placeholder, ...rest } = o;
            return rest;
        });
}

export const destroyTimes = (entries: readonly MatchObjective[]): number[] =>
    entries.flatMap((o) => (o.destroyedS === undefined ? [] : [o.destroyedS])).sort((a, b) => a - b);

export interface DamageSplit {
    gun: number;
    spirit: number;
    trooper: number;
    total: number;
    /** Fractions of the total. */
    shares: { gun: number; spirit: number; trooper: number };
}

type Damage = Pick<MatchObjective, "playerDamage" | "spiritDamage" | "creepDamage">;

/** The match reports spirit damage as a part of player damage, so gun damage is the rest of it. */
export function damageSplit(entries: readonly Damage[]): DamageSplit | null {
    let gun = 0;
    let spirit = 0;
    let trooper = 0;
    for (const o of entries) {
        gun += Math.max(o.playerDamage - o.spiritDamage, 0);
        spirit += o.spiritDamage;
        trooper += o.creepDamage;
    }
    const total = gun + spirit + trooper;
    if (total <= 0) return null;
    return {
        gun,
        spirit,
        trooper,
        total,
        shares: { gun: gun / total, spirit: spirit / total, trooper: trooper / total },
    };
}

export interface ObjectiveInfo {
    type: "objective";
    kind: ObjectiveKind;
    team: MatchTeam;
    lane?: Lane;
    /** Set once the objective is down at the replay time. */
    destroyedS?: number;
    /** Totals for the whole match; the match has no damage over time. */
    damage: DamageSplit | null;
}

export type CampTier = "weak" | "medium" | "strong" | "vault";

export interface CampInfo {
    type: "camp";
    tier: CampTier;
}

export interface MidBossInfo {
    type: "mid-boss";
    lastKill?: MidBossEvent;
}

export interface ShopInfo {
    type: "shop";
}

export interface TeleporterInfo {
    type: "teleporter";
}

export type MapObjectInfo = ObjectiveInfo | CampInfo | MidBossInfo | ShopInfo | TeleporterInfo;

/** Camps, shops and teleporters only carry a name, and there are too many of them to step through with Tab. */
export const takesTab = (info: MapObjectInfo): boolean =>
    info.type !== "camp" && info.type !== "shop" && info.type !== "teleporter";

const OBJECTIVE_KINDS: Partial<Record<MapItem["kind"], ObjectiveKind>> = {
    guardian: "guardian",
    walker: "walker",
    base_guardian: "base_guardian",
    shrine: "shrine",
    patron: "patron",
};

const LANE_KINDS = new Set<ObjectiveKind>(["guardian", "walker", "base_guardian"]);

/** `count` is how many match entries stand behind the drawn object: two for a base guardian pair. */
export function objectiveInfo(
    row: MapItem,
    objectives: readonly MatchObjective[],
    time: number,
    count = 1,
): ObjectiveInfo {
    const kind = OBJECTIVE_KINDS[row.kind] ?? "unknown";
    const entries = rowEntries(row, objectives);
    const last = destroyTimes(entries)[count - 1];
    const lane = LANE_KINDS.has(kind) ? laneForObjectiveSlot(row.laneSlot ?? undefined) : undefined;
    return {
        type: "objective",
        kind,
        team: rowTeam(row) ?? "hidden-king",
        ...(lane ? { lane } : {}),
        ...(last !== undefined && last <= time ? { destroyedS: last } : {}),
        damage: damageSplit(entries),
    };
}

const CAMP_TIERS: Partial<Record<MapItem["kind"], CampTier>> = {
    camp_weak: "weak",
    camp_medium: "medium",
    camp_strong: "strong",
    camp_vault: "vault",
};

export function campInfo(kind: MapItem["kind"]): CampInfo | null {
    const tier = CAMP_TIERS[kind];
    return tier ? { type: "camp", tier } : null;
}

export function midBossInfo(kills: readonly MidBossEvent[], time: number): MidBossInfo {
    const lastKill = kills
        .filter((k) => k.destroyedS > 0 && k.destroyedS <= time)
        .sort((a, b) => a.destroyedS - b.destroyedS)
        .at(-1);
    return { type: "mid-boss", ...(lastKill ? { lastKill } : {}) };
}
