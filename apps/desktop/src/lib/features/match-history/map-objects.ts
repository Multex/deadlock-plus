import { teleporterIconSvg } from "$lib/features/gamedata/map-icons";
import type { MapItem } from "$lib/generated/types/MapItem";
import type { MinimapIcon } from "$lib/generated/types/MinimapIcon";
import type { MatchObjective, MatchTeam, MidBossEvent } from "./detail";
import { ENEMY_LANE_COLOR, LANE_COLORS } from "./lane-lines";
import {
    campInfo,
    destroyTimes,
    highlightOpacity,
    midBossInfo,
    objectiveInfo,
    rowEntries,
    type MapObjectInfo,
} from "./map-object-info";
import { MID_BOSS_CLAIM_MARKER_S, campSpawned, midBossClaimAt, midBossOpacity } from "./map-spawns";
import { mapPercent } from "./replay";

export type MapObjectIcons = Partial<Record<MinimapIcon, string>>;

export const MAP_OBJECT_STEMS: readonly MinimapIcon[] = [
    "boss_health",
    "boss_health_fill",
    "boss_health_t2",
    "boss_health_fill_t2",
    "boss_health_final",
    "boss_health_final_fill",
    "super_neutral_marker",
    "neutral_small",
    "neutral_medium",
    "neutral_large",
    "neutral_vault",
    "minimap_shop",
];

/** The game's minimap stacking order; the dot values match `player-dot.ts`. */
export const MAP_OBJECT_Z = {
    teleporter: 1,
    neutral: 2,
    midBoss: 4,
    enemyDot: 13,
    friendlyDot: 14,
    objective: 15,
    localDot: 18,
    // The killers stand on the mid boss spot for the whole marker window, so the marker goes over their dots.
    midBossClaim: 19,
} as const;

/** Hover targets stay under every player dot, so an object never takes a dot's hover. */
const HIT_Z_MAX = 12;

/** Hover target side as a fraction of the icon side; the art has empty margins and camps sit close together. */
export const MAP_OBJECT_HIT_SCALE = 0.7;

const ALLY_TINT = "#FFEFD7";

const CAMP_SIZE = 30 / 560;

/** Icon side as a fraction of the map side, so markers scale with the displayed map. */
export const MAP_OBJECT_SIZE = {
    guardian: 0.088,
    baseGuardian: 0.069,
    walker: 0.138,
    shrine: 0.09,
    patron: 0.173,
    midBoss: 0.15,
    midBossClaim: 0.075,
    camp: CAMP_SIZE,
    shop: 0.035,
    // The game draws a 16 px teleporter disc where a camp icon box is 24 px.
    teleporter: (CAMP_SIZE * 16) / 24,
} as const;

export function teleporterDataUri(): string {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(teleporterIconSvg())}`;
}

const TELEPORTER_SRC = teleporterDataUri();

interface Look {
    /** Untinted art under the tinted fill, when the game draws one. */
    frame?: MinimapIcon;
    fill: MinimapIcon;
    size: number;
    tinted: boolean;
}

const LOOKS: Partial<Record<MapItem["kind"], Look>> = {
    guardian: { frame: "boss_health", fill: "boss_health_fill", size: MAP_OBJECT_SIZE.guardian, tinted: true },
    base_guardian: { frame: "boss_health", fill: "boss_health_fill", size: MAP_OBJECT_SIZE.baseGuardian, tinted: true },
    walker: { frame: "boss_health_t2", fill: "boss_health_fill_t2", size: MAP_OBJECT_SIZE.walker, tinted: true },
    shrine: { frame: "boss_health_t2", fill: "boss_health_fill_t2", size: MAP_OBJECT_SIZE.shrine, tinted: true },
    patron: { frame: "boss_health_final", fill: "boss_health_final_fill", size: MAP_OBJECT_SIZE.patron, tinted: true },
    mid_boss: { fill: "super_neutral_marker", size: MAP_OBJECT_SIZE.midBoss, tinted: false },
    camp_weak: { fill: "neutral_small", size: MAP_OBJECT_SIZE.camp, tinted: false },
    camp_medium: { fill: "neutral_medium", size: MAP_OBJECT_SIZE.camp, tinted: false },
    camp_strong: { fill: "neutral_large", size: MAP_OBJECT_SIZE.camp, tinted: false },
    camp_vault: { fill: "neutral_vault", size: MAP_OBJECT_SIZE.camp, tinted: false },
    shop: { fill: "minimap_shop", size: MAP_OBJECT_SIZE.shop, tinted: false },
};

const LANE_KINDS = new Set<MapItem["kind"]>(["guardian", "walker", "base_guardian"]);
const CAMP_KINDS = new Set<MapItem["kind"]>(["camp_weak", "camp_medium", "camp_strong", "camp_vault"]);

export interface MapObjectPart {
    src: string;
    /** Mask colour; null draws the art as it is. */
    tint: string | null;
    /** CSS clip-path for the layer; used to show one half of a pair diamond. */
    clip?: string;
}

/** Layers of one object can share art (the two halves of a pair diamond), so the key includes the position. */
export const layerKey = (part: MapObjectPart, index: number): string => `${index}:${part.clip ?? ""}:${part.src}`;

export interface MapObject {
    key: string;
    kind: MapItem["kind"];
    left: number;
    top: number;
    /** Fraction of the map side. */
    size: number;
    /** Bottom to top. */
    parts: MapObjectPart[];
    z: number;
    /** Mirrored top to bottom; the Hidden King patron is the Archmother art upside down. */
    flipY: boolean;
    /** Mirrored left to right; the teleporter art faces right and the game turns it around on the right half. */
    flipX?: true;
    /** Set only while the object fades in. */
    opacity?: number;
    /** Shown from spawn rules, not from a recorded event. */
    estimated?: true;
    /**
     * A destroyed objective or a mid boss kill inside its highlight window: the object fades under a ring.
     * The icon is dimmed too unless `solid` is set.
     */
    highlight?: { opacity: number; color: string; solid?: true };
    /** Tooltip facts; objects without them take no hover. */
    info?: MapObjectInfo;
}

export const hitZ = (object: Pick<MapObject, "z">): number => Math.min(object.z, HIT_Z_MAX);

/** CSS `scale` for the object's layers: both mirrors in one value, so neither overrides the other. */
export function layerScale(object: Pick<MapObject, "flipX" | "flipY">): string | undefined {
    if (!object.flipX && !object.flipY) return undefined;
    return `${object.flipX ? -1 : 1} ${object.flipY ? -1 : 1}`;
}

export interface MapObjectsInput {
    rows: readonly MapItem[];
    objectives: readonly MatchObjective[];
    /** Team of the viewing player; null when they are not in the match. */
    viewerTeam: MatchTeam | null;
    time: number;
    radius: number;
    icons: MapObjectIcons;
    showCamps: boolean;
    midBoss: readonly MidBossEvent[];
}

const teamOf = (n: number): MatchTeam => (n === 1 ? "archmother" : "hidden-king");

/** Rows without an objective id (shrines) or without a match entry cannot die. */
export function isObjectiveDead(row: MapItem, objectives: readonly MatchObjective[], time: number): boolean {
    return destroyTimes(rowEntries(row, objectives)).some((s) => s <= time);
}

function tintOf(row: MapItem, viewerTeam: MatchTeam): string {
    const friendly = row.team !== null && teamOf(row.team) === viewerTeam;
    if (!friendly) return ENEMY_LANE_COLOR;
    return (LANE_KINDS.has(row.kind) && row.laneSlot !== null ? LANE_COLORS[row.laneSlot] : undefined) ?? ALLY_TINT;
}

/**
 * Base guardians stand in pairs and the minimap draws one diamond per pair. Pairs are the closest
 * rows within a team; the result holds row indices, lower first.
 */
export function pairBaseGuardians(rows: readonly MapItem[]): [number, number][] {
    const candidates: { a: number; b: number; d: number }[] = [];
    rows.forEach((a, i) => {
        if (a.kind !== "base_guardian" || a.team === null) return;
        for (let j = i + 1; j < rows.length; j++) {
            const b = rows[j]!;
            if (b.kind !== "base_guardian" || b.team !== a.team) continue;
            candidates.push({ a: i, b: j, d: Math.hypot(a.x - b.x, a.y - b.y) });
        }
    });
    candidates.sort((p, q) => p.d - q.d);
    const used = new Set<number>();
    const pairs: [number, number][] = [];
    for (const c of candidates) {
        if (used.has(c.a) || used.has(c.b)) continue;
        used.add(c.a);
        used.add(c.b);
        pairs.push([c.a, c.b]);
    }
    return pairs.sort((p, q) => p[0] - q[0]);
}

/**
 * A lane shop belongs to the nearest guardian of its own team and goes away with it; shops without a
 * team belong to none. Position decides, not the lane slot: the shop rows of the Archmother side carry
 * the mirrored slot. The result maps a shop's row index to its guardian's row index.
 */
export function shopGuardians(rows: readonly MapItem[]): Map<number, number> {
    const owners = new Map<number, number>();
    rows.forEach((shop, i) => {
        if (shop.kind !== "shop" || shop.team === null) return;
        let nearest = Infinity;
        rows.forEach((guardian, j) => {
            if (guardian.kind !== "guardian" || guardian.team !== shop.team) return;
            const d = Math.hypot(shop.x - guardian.x, shop.y - guardian.y);
            if (d >= nearest) return;
            nearest = d;
            owners.set(i, j);
        });
    });
    return owners;
}

const HALF_CLIP = { left: "inset(0 50% 0 0)", right: "inset(0 0 0 50%)" } as const;

/** Both guardians of a pair share one objective id, so the n-th destroy time belongs to the n-th half. */
function pairHalvesDead(row: MapItem, objectives: readonly MatchObjective[], time: number): [boolean, boolean] {
    const times = destroyTimes(rowEntries(row, objectives));
    return [times[0] !== undefined && times[0] <= time, times[1] !== undefined && times[1] <= time];
}

export function mapObjects(input: MapObjectsInput): MapObject[] {
    const viewer = input.viewerTeam ?? "hidden-king";
    const out: MapObject[] = [];
    const cores: MapObject[] = [];
    const mates = new Map<number, number>();
    for (const [a, b] of pairBaseGuardians(input.rows)) {
        mates.set(a, b);
        mates.set(b, a);
    }
    const owners = shopGuardians(input.rows);
    input.rows.forEach((row, index) => {
        if (row.kind === "teleporter") {
            const p = mapPercent(row.x, row.y, input.radius);
            out.push({
                key: `${index}`,
                kind: row.kind,
                left: p.left,
                top: p.top,
                size: MAP_OBJECT_SIZE.teleporter,
                parts: [{ src: TELEPORTER_SRC, tint: null }],
                z: MAP_OBJECT_Z.teleporter,
                flipY: false,
                ...(row.x > 0 ? { flipX: true as const } : {}),
                info: { type: "teleporter" },
            });
            return;
        }

        const look = LOOKS[row.kind];
        if (!look) return;
        if (CAMP_KINDS.has(row.kind) && !input.showCamps) return;

        const fill = input.icons[look.fill];
        const frame = look.frame ? input.icons[look.frame] : undefined;
        if (!fill || (look.frame && !frame)) return;

        const mate = mates.get(index);
        if (mate !== undefined) {
            if (mate < index) return;
            const second = input.rows[mate]!;
            const [leftDead, rightDead] = pairHalvesDead(row, input.objectives, input.time);
            const info = objectiveInfo(row, input.objectives, input.time, 2);
            const fade = leftDead && rightDead ? highlightOpacity(info.destroyedS ?? Infinity, input.time) : 1;
            if (fade <= 0) return;
            const fallen = leftDead && rightDead;
            const mid = mapPercent((row.x + second.x) / 2, (row.y + second.y) / 2, input.radius);
            const tint = tintOf(row, viewer);
            out.push({
                key: `${index}-${mate}`,
                kind: row.kind,
                left: mid.left,
                top: mid.top,
                size: look.size,
                parts: [
                    { src: frame!, tint: null },
                    ...(leftDead && !fallen ? [] : [{ src: fill, tint, clip: HALF_CLIP.left }]),
                    ...(rightDead && !fallen ? [] : [{ src: fill, tint, clip: HALF_CLIP.right }]),
                ],
                z: MAP_OBJECT_Z.objective,
                flipY: false,
                ...(fallen ? { highlight: { opacity: fade, color: tint } } : {}),
                info,
            });
            return;
        }

        const p = mapPercent(row.x, row.y, input.radius);
        const base = { key: `${index}`, kind: row.kind, left: p.left, top: p.top, size: look.size, flipY: false };

        if (row.kind === "mid_boss") {
            const claim = midBossClaimAt(input.midBoss, input.time);
            if (claim) {
                const info = midBossInfo(input.midBoss, input.time);
                const tint = claim === viewer ? ALLY_TINT : ENEMY_LANE_COLOR;
                const fade = highlightOpacity(
                    info.lastKill?.destroyedS ?? Infinity,
                    input.time,
                    MID_BOSS_CLAIM_MARKER_S,
                );
                out.push({
                    ...base,
                    key: `${index}-claim`,
                    size: MAP_OBJECT_SIZE.midBossClaim,
                    parts: [{ src: fill, tint }],
                    z: MAP_OBJECT_Z.midBossClaim,
                    ...(fade > 0 ? { highlight: { opacity: fade, color: tint, solid: true } } : {}),
                    info,
                });
            }
            const opacity = midBossOpacity(input.midBoss, input.time);
            if (opacity <= 0) return;
            out.push({
                ...base,
                parts: [{ src: fill, tint: null }],
                z: MAP_OBJECT_Z.midBoss,
                estimated: true,
                ...(opacity < 1 ? { opacity } : {}),
                info: midBossInfo(input.midBoss, input.time),
            });
            return;
        }

        if (!look.tinted) {
            if (!campSpawned(row.kind, input.time)) return;
            const owner = owners.get(index);
            if (owner !== undefined && isObjectiveDead(input.rows[owner]!, input.objectives, input.time)) return;
            out.push({
                ...base,
                parts: [{ src: fill, tint: null }],
                z: MAP_OBJECT_Z.neutral,
                info: row.kind === "shop" ? { type: "shop" } : (campInfo(row.kind) ?? undefined),
            });
            return;
        }

        const info = objectiveInfo(row, input.objectives, input.time);
        const fallen = info.destroyedS !== undefined;
        const fade = fallen ? highlightOpacity(info.destroyedS!, input.time) : 1;
        if (fade <= 0) return;
        const tint = tintOf(row, viewer);
        out.push({
            ...base,
            parts: [
                { src: frame!, tint: null },
                { src: fill, tint },
            ],
            z: MAP_OBJECT_Z.objective,
            flipY: row.kind === "patron" && row.team === 0,
            ...(fallen ? { highlight: { opacity: fade, color: tint } } : {}),
            info,
        });
        if (fallen) return;

        const guardianFrame = input.icons[LOOKS.guardian!.frame!];
        const guardianFill = input.icons[LOOKS.guardian!.fill];
        if (row.kind === "patron" && guardianFrame && guardianFill) {
            // The game draws a guardian diamond centred on the patron's flat edge, which is the row position.
            // It follows the patron's tint and is drawn after every other object so it stays on top.
            cores.push({
                ...base,
                key: `${index}-core`,
                kind: "guardian",
                size: MAP_OBJECT_SIZE.guardian,
                parts: [
                    { src: guardianFrame, tint: null },
                    { src: guardianFill, tint: tintOf({ ...row, kind: "guardian", laneSlot: null }, viewer) },
                ],
                z: MAP_OBJECT_Z.objective,
            });
        }
    });
    return [...out, ...cores];
}
