import { allPlayers, type MatchDetail, type MatchTeam, type PlayerPath } from "./detail";

/** The playable map spans [-WORLD_RADIUS, WORLD_RADIUS] on both world axes. */
export const WORLD_RADIUS = 10752;

export interface PathSample {
    /** Seconds from match start. */
    t: number;
    x: number;
    y: number;
    alive: boolean;
    /** Percent. Absent when the source has no health for this sample. */
    health?: number;
    combatType: number;
    moveType: number;
}

export interface PlayerPathSeries {
    slot: number;
    team: MatchTeam;
    samples: PathSample[];
}

export interface DecodedPaths {
    intervalS: number;
    /** Time of the last sample across all players. */
    durationS: number;
    series: PlayerPathSeries[];
}

export interface PlayerPosition {
    slot: number;
    team: MatchTeam;
    x: number;
    y: number;
    alive: boolean;
    health?: number;
}

function decodeSeries(
    path: PlayerPath,
    team: MatchTeam,
    intervalS: number,
    xRes: number,
    yRes: number,
): PlayerPathSeries {
    const count = Math.min(path.xPos.length, path.yPos.length);
    const samples: PathSample[] = [];
    let lastLive: { x: number; y: number } | null = null;
    let leadingDead = 0;

    for (let i = 0; i < count; i++) {
        const health = i < path.health.length ? path.health[i] : undefined;
        const alive = health === undefined || health > 0;
        const decoded = {
            x: path.xMin + (path.xPos[i] / xRes) * (path.xMax - path.xMin),
            y: path.yMin + (path.yPos[i] / yRes) * (path.yMax - path.yMin),
        };
        // A dead player is recorded at (0, 0), which decodes to the (xMin, yMin) corner; hold the last live spot.
        if (alive) lastLive = decoded;
        const at = alive ? decoded : (lastLive ?? { x: 0, y: 0 });
        if (!alive && lastLive === null) leadingDead++;
        samples.push({
            t: i * intervalS,
            x: at.x,
            y: at.y,
            alive,
            health,
            combatType: path.combatType[i] ?? 0,
            moveType: path.moveType[i] ?? 0,
        });
    }

    if (leadingDead > 0) {
        const first = samples.find((s) => s.alive);
        if (first) {
            for (let i = 0; i < leadingDead; i++) {
                samples[i].x = first.x;
                samples[i].y = first.y;
            }
        }
    }
    return { slot: path.slot, team, samples };
}

/** Null when the match has no recorded paths. Paths with no matching player are dropped. */
export function decodePaths(detail: MatchDetail): DecodedPaths | null {
    const raw = detail.matchPaths;
    if (!raw) return null;
    const teamBySlot = new Map(allPlayers(detail).map((p) => [p.slot, p.team]));
    const series = raw.paths.flatMap((path) => {
        const team = teamBySlot.get(path.slot);
        return team === undefined ? [] : [decodeSeries(path, team, raw.intervalS, raw.xResolution, raw.yResolution)];
    });
    const durationS = series.reduce((max, s) => Math.max(max, s.samples.at(-1)?.t ?? 0), 0);
    return { intervalS: raw.intervalS, durationS, series };
}

/**
 * Linear between the two samples around `t`; clamps outside the recorded range. A pair with a dead
 * sample holds the earlier one, so a death or respawn never slides across the map.
 */
export function positionsAt(decoded: DecodedPaths, t: number): PlayerPosition[] {
    return decoded.series.flatMap((s) => {
        const last = s.samples.length - 1;
        if (last < 0) return [];
        const position = decoded.intervalS > 0 ? t / decoded.intervalS : 0;
        const index = Math.min(last, Math.max(0, Math.floor(position)));
        const from = s.samples[index];
        const to = s.samples[Math.min(last, index + 1)];
        const mix = from.alive && to.alive && index < last ? Math.min(1, Math.max(0, position - index)) : 0;
        return [
            {
                slot: s.slot,
                team: s.team,
                x: from.x + (to.x - from.x) * mix,
                y: from.y + (to.y - from.y) * mix,
                alive: from.alive,
                health: from.health,
            },
        ];
    });
}

/** Assumes image y grows downward while world y grows upward. */
export function worldToMap(x: number, y: number, size: number): { x: number; y: number } {
    const span = WORLD_RADIUS * 2;
    return { x: ((x + WORLD_RADIUS) / span) * size, y: (1 - (y + WORLD_RADIUS) / span) * size };
}
