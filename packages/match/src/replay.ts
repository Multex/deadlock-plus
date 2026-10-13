import type { MatchDetail, MatchTeam, Position } from "./detail";
import { WORLD_RADIUS, positionsAt, worldToMap, type DecodedPaths } from "./paths";
import { filterTimeline, type TimelineEvent, type TimelineFilter, type TimelineKind } from "./timeline";

export const SPEEDS = [1, 2, 4] as const;
export type ReplaySpeed = (typeof SPEEDS)[number];

export type DeathEvent = Extract<TimelineEvent, { kind: "death" }>;

export type LaneId = "death" | "objective" | "mid-boss" | "item" | "swing";

export const TIMELINE_LANES: readonly { id: LaneId; kinds: readonly TimelineKind[] }[] = [
    { id: "death", kinds: ["death"] },
    { id: "objective", kinds: ["objective"] },
    { id: "mid-boss", kinds: ["mid-boss"] },
    { id: "swing", kinds: ["swing"] },
    { id: "item", kinds: ["item-buy", "item-sell"] },
];

/** Item buys and sells are off until asked for: a full match has hundreds of them. */
export const DEFAULT_KINDS: readonly TimelineKind[] = ["death", "objective", "mid-boss", "swing"];

export function laneOf(kind: TimelineKind): LaneId {
    return TIMELINE_LANES.find((l) => l.kinds.includes(kind))!.id;
}

export function toggleKind(kinds: readonly TimelineKind[], kind: TimelineKind): TimelineKind[] {
    return kinds.includes(kind) ? kinds.filter((k) => k !== kind) : [...kinds, kind];
}

export function replayDuration(
    detail: MatchDetail,
    decoded: DecodedPaths | null,
    events: readonly TimelineEvent[],
): number {
    return events.reduce((max, e) => Math.max(max, e.timeS), Math.max(detail.durationS, decoded?.durationS ?? 0));
}

export function advance(t: number, dtMs: number, speed: number, duration: number): { t: number; ended: boolean } {
    const next = Math.max(0, t + (dtMs / 1000) * speed);
    return next >= duration ? { t: duration, ended: true } : { t: next, ended: false };
}

export function markerPercent(timeS: number, duration: number): number {
    if (duration <= 0) return 0;
    return Math.min(100, Math.max(0, (timeS / duration) * 100));
}

export interface MapPoint {
    /** Percent of the map width. */
    left: number;
    /** Percent of the map height. */
    top: number;
}

/** `radius` is the world distance from the map centre to the image edge. */
export function mapPercent(x: number, y: number, radius: number): MapPoint {
    const p = worldToMap(x, y, 100);
    const scale = WORLD_RADIUS / radius;
    return { left: 50 + (p.x - 50) * scale, top: 50 + (p.y - 50) * scale };
}

export interface MapDot extends MapPoint {
    slot: number;
    team: MatchTeam;
    alive: boolean;
}

export function mapDots(decoded: DecodedPaths, t: number, radius: number): MapDot[] {
    return positionsAt(decoded, t).map((p) => ({
        slot: p.slot,
        team: p.team,
        alive: p.alive,
        ...mapPercent(p.x, p.y, radius),
    }));
}

export interface DeathMarker {
    event: DeathEvent;
    victim: MapPoint;
    killer?: MapPoint;
}

const point = (p: Position, radius: number) => mapPercent(p.x, p.y, radius);

export function deathMarkers(
    events: readonly TimelineEvent[],
    filter: Omit<TimelineFilter, "kinds">,
    radius: number,
): DeathMarker[] {
    const out: DeathMarker[] = [];
    for (const e of filterTimeline(events, { ...filter, kinds: ["death"] })) {
        if (e.kind !== "death" || !e.position) continue;
        out.push({
            event: e,
            victim: point(e.position, radius),
            killer: e.killerPosition ? point(e.killerPosition, radius) : undefined,
        });
    }
    return out;
}

export function eventTeam(e: TimelineEvent): MatchTeam | null {
    switch (e.kind) {
        case "death":
            return e.victimTeam;
        case "mid-boss":
            return e.claimedBy ?? e.killedBy ?? null;
        default:
            return e.team;
    }
}
