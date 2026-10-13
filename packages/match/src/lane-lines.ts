import type { LaneLine } from "@deadlock-plus/ipc-types/LaneLine";
import type { MapItem } from "@deadlock-plus/ipc-types/MapItem";
import type { MatchTeam } from "./detail";
import { mapPercent } from "./replay";

export const LANE_COLORS: Readonly<Record<number, string>> = {
    1: "#FFDF40",
    3: "#2EC7E6",
    4: "#6BB247",
};

export const ENEMY_LANE_COLOR = "#DC4C2F";

const LANE_OBJECTIVES = new Set<MapItem["kind"]>(["guardian", "walker", "base_guardian"]);

export interface LaneTable {
    rows: readonly MapItem[];
    lanes: readonly LaneLine[];
}

export interface LaneStroke {
    key: string;
    team: MatchTeam;
    laneSlot: number;
    markerSlot: number;
    color: string;
    /** SVG `points` in percent of the map, from the map edge past the base towards the guardian. */
    points: string;
}

type Pt = readonly [number, number];

function nearestOnSegment(p: Pt, a: Pt, b: Pt): { t: number; dist: number } {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = dx * dx + dy * dy;
    const t = len === 0 ? 0 : Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len));
    return { t, dist: Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) };
}

function distanceToPath(p: Pt, nodes: readonly Pt[]): number {
    let best = Infinity;
    for (let i = 0; i + 1 < nodes.length; i++) {
        best = Math.min(best, nearestOnSegment(p, nodes[i]!, nodes[i + 1]!).dist);
    }
    return best;
}

const planar = (n: readonly number[]): Pt => [n[0]!, n[1]!];

/**
 * Each lane has four parallel marker splines. The one with the least summed distance to the lane's
 * guardians, walkers and base guardians is the one that runs through the objectives.
 */
function pickMarkers(table: LaneTable): LaneLine[] {
    const objectives = table.rows.filter((r) => LANE_OBJECTIVES.has(r.kind) && r.laneSlot !== null);
    const best = new Map<number, { line: LaneLine; score: number }>();
    for (const line of table.lanes) {
        const nodes = line.nodes.map(planar);
        let score = 0;
        for (const o of objectives) {
            if (o.laneSlot === line.laneSlot) score += distanceToPath([o.x, o.y], nodes);
        }
        const cur = best.get(line.laneSlot);
        if (!cur || score < cur.score || (score === cur.score && line.markerSlot < cur.line.markerSlot)) {
            best.set(line.laneSlot, { line, score });
        }
    }
    return [...best.values()].map((b) => b.line);
}

function clipAt(nodes: readonly Pt[], to: Pt): Pt[] {
    let best = { seg: 0, t: 0, dist: Infinity };
    for (let i = 0; i + 1 < nodes.length; i++) {
        const r = nearestOnSegment(to, nodes[i]!, nodes[i + 1]!);
        if (r.dist < best.dist) best = { seg: i, ...r };
    }
    if (best.seg + 1 >= nodes.length) return [...nodes];
    const a = nodes[best.seg]!;
    const b = nodes[best.seg + 1]!;
    const cut: Pt = [a[0] + (b[0] - a[0]) * best.t, a[1] + (b[1] - a[1]) * best.t];
    return [...nodes.slice(0, best.seg + 1), cut];
}

/** Lane columns sit this fraction of the base-to-base distance either side of the patron. */
const COLUMN_SPACING = 0.022;
/** The spline is cut where it comes within this fraction of the base-to-base distance of the patron. */
const APPROACH_DEPTH = 0.12;
/** The connector settles into its column this fraction of the distance short of the patron. */
const SETTLE_DEPTH = 0.06;
const COLUMN_OFFSET: Readonly<Record<number, number>> = { 1: -1, 3: 0, 4: 1 };
const CONNECTOR_STEPS = 10;

/**
 * In game each lane enters its base as a straight vertical line in a tight column around the
 * patron's x, left lane to the left and right lane to the right, and runs on past the patron to the
 * map edge. The raw spline wanders around the base, so it is cut short of the patron, joined to the
 * column by a smooth connector, and the column is carried out to the edge (in map percent).
 */
function approachBase(
    nodes: readonly Pt[],
    patron: Pt,
    span: number,
    laneSlot: number,
): { world: Pt[]; edgeY: number } {
    const inward = patron[1] <= 0 ? 1 : -1;
    const depth = (p: Pt) => (p[1] - patron[1]) * inward;
    const columnX = patron[0] + (COLUMN_OFFSET[laneSlot] ?? 0) * COLUMN_SPACING * span;
    let cut = nodes.findIndex((p) => depth(p) >= APPROACH_DEPTH * span);
    if (cut < 0) cut = nodes.length - 1;
    const p = nodes[cut]!;
    const settle: Pt = [columnX, patron[1] + inward * Math.min(SETTLE_DEPTH * span, Math.max(depth(p), 0))];
    const next = nodes[cut + 1];
    const tangent: Pt = next ? [p[0] - next[0], p[1] - next[1]] : [settle[0] - p[0], settle[1] - p[1]];
    const tl = Math.hypot(tangent[0], tangent[1]) || 1;
    const h = Math.hypot(settle[0] - p[0], settle[1] - p[1]) * 0.45;
    const c1: Pt = [p[0] + (tangent[0] / tl) * h, p[1] + (tangent[1] / tl) * h];
    const c2: Pt = [settle[0], settle[1] + inward * h];
    const connector: Pt[] = [];
    for (let i = 1; i < CONNECTOR_STEPS; i++) {
        const t = i / CONNECTOR_STEPS;
        const u = 1 - t;
        const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t] as const;
        connector.push([
            w[0] * p[0] + w[1] * c1[0] + w[2] * c2[0] + w[3] * settle[0],
            w[0] * p[1] + w[1] * c1[1] + w[2] * c2[1] + w[3] * settle[1],
        ]);
    }
    return {
        world: [[columnX, settle[1] - inward * span], settle, ...connector.reverse(), ...nodes.slice(cut)],
        edgeY: inward > 0 ? 100 : 0,
    };
}

const teamName = (n: number): MatchTeam => (n === 1 ? "archmother" : "hidden-king");

/**
 * One stroke per lane half, base to guardian: the lane colour for the viewer's team, red-orange for
 * the other. The geometry does not depend on the viewer.
 */
export function laneStrokes(table: LaneTable, viewerTeam: MatchTeam | null, radius: number): LaneStroke[] {
    const viewer = viewerTeam ?? "hidden-king";
    const out: LaneStroke[] = [];
    for (const line of pickMarkers(table)) {
        if (line.startTeam === null) continue;
        const mid = Math.min(Math.max(line.midIndex, 0), line.nodes.length - 1);
        const halves = [
            { num: line.startTeam, nodes: line.nodes.slice(0, mid + 1).map(planar) },
            { num: 1 - line.startTeam, nodes: line.nodes.slice(mid).reverse().map(planar) },
        ];
        for (const half of halves) {
            const guardian = table.rows.find(
                (r) => r.kind === "guardian" && r.team === half.num && r.laneSlot === line.laneSlot,
            );
            const clipped = guardian ? clipAt(half.nodes, [guardian.x, guardian.y]) : half.nodes;
            if (clipped.length < 2) continue;
            const team = teamName(half.num);
            const patron = table.rows.find((r) => r.kind === "patron" && r.team === half.num);
            const other = table.rows.find((r) => r.kind === "patron" && r.team !== half.num);
            const toPercent = (n: Pt) => {
                const p = mapPercent(n[0], n[1], radius);
                return [p.left, p.top] as const;
            };
            let pts: (readonly [number, number])[];
            if (patron && other) {
                const span = Math.hypot(patron.x - other.x, patron.y - other.y);
                const { world, edgeY } = approachBase(clipped, [patron.x, patron.y], span, line.laneSlot);
                const [edgeX] = toPercent(world[0]!);
                pts = [[edgeX, edgeY], ...world.slice(1).map(toPercent)];
            } else {
                pts = clipped.map(toPercent);
            }
            out.push({
                key: `${line.laneSlot}-${team}`,
                team,
                laneSlot: line.laneSlot,
                markerSlot: line.markerSlot,
                color: team === viewer ? (LANE_COLORS[line.laneSlot] ?? ENEMY_LANE_COLOR) : ENEMY_LANE_COLOR,
                points: pts.map(([x, y]) => `${x},${y}`).join(" "),
            });
        }
    }
    return out;
}
