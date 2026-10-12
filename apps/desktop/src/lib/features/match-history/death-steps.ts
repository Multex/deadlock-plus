import { allPlayers, type MatchDetail, type MatchTeam } from "./detail";
import type { DecodedPaths } from "./paths";
import { DOT_SIZE } from "./player-dot";
import { deathMarkers, mapDots, type DeathEvent, type DeathMarker, type MapDot, type MapPoint } from "./replay";
import type { TimelineEvent, TimelineFilter } from "./timeline";

/** Whose deaths the death map shows: the viewer's own, everyone's, or one player slot. */
export type DeathScope = "mine" | "all" | number;

export type DeathRole = "victim" | "killer";

export function resolveScope(choice: DeathScope | null, ownSlot: number | null): DeathScope {
    if (ownSlot === null) return choice === null || choice === "mine" ? "all" : choice;
    return choice ?? "mine";
}

export function scopeFilter(
    scope: DeathScope,
    ownSlot: number | null,
    role: DeathRole,
    range: { fromS?: number; toS?: number },
): Omit<TimelineFilter, "kinds"> {
    if (scope === "mine") return { slot: ownSlot ?? undefined, role: "victim", ...range };
    return { slot: scope === "all" ? undefined : scope, role, ...range };
}

export interface DeathStep extends DeathMarker {
    /** The recorded killer position, or a spot beside the death when none was recorded. */
    killerSpot: MapPoint;
    killerHeroId: number | null;
    /** A killer outside the roster is taken to be on the other team. */
    killerTeam: MatchTeam;
    /** False when the killer slot is not a player in this match. */
    killerKnown: boolean;
}

const BADGE_OFFSET = DOT_SIZE * 100 * 0.6;

const otherTeam = (team: MatchTeam): MatchTeam => (team === "hidden-king" ? "archmother" : "hidden-king");

export function deathSteps(
    detail: MatchDetail,
    events: readonly TimelineEvent[],
    filter: Omit<TimelineFilter, "kinds">,
    radius: number,
): DeathStep[] {
    const bySlot = new Map(allPlayers(detail).map((p) => [p.slot, p]));
    return deathMarkers(events, filter, radius)
        .sort((a, b) => a.event.timeS - b.event.timeS)
        .map((m) => {
            const killer = bySlot.get(m.event.killerSlot);
            return {
                ...m,
                killerSpot: m.killer ?? { left: m.victim.left + BADGE_OFFSET, top: m.victim.top - BADGE_OFFSET },
                killerHeroId: killer?.heroId ?? null,
                killerTeam: killer?.team ?? otherTeam(m.event.victimTeam),
                killerKnown: killer !== undefined,
            };
        });
}

export function stepIndex(steps: readonly DeathStep[], selected: DeathEvent | null): number {
    return selected === null ? -1 : steps.findIndex((s) => s.event === selected);
}

/** Stops at both ends. With nothing selected, forward starts at the first death and back at the last. */
export function stepTo(steps: readonly DeathStep[], selected: DeathEvent | null, delta: -1 | 1): DeathEvent | null {
    if (steps.length === 0) return null;
    const index = stepIndex(steps, selected);
    const next = index < 0 ? (delta > 0 ? 0 : steps.length - 1) : index + delta;
    return steps[Math.min(steps.length - 1, Math.max(0, next))].event;
}

export type DeathEmphasis = "raised" | "dimmed" | "normal";

/** The pointer wins over keyboard focus. A death that is not drawn is never active. */
export function activeDeath(
    steps: readonly DeathStep[],
    hovered: DeathEvent | null,
    focused: DeathEvent | null,
): DeathEvent | null {
    const drawn = (event: DeathEvent | null) => event !== null && steps.some((s) => s.event === event);
    return drawn(hovered) ? hovered : drawn(focused) ? focused : null;
}

export function deathEmphasis(event: DeathEvent, active: DeathEvent | null): DeathEmphasis {
    if (active === null) return "normal";
    return event === active ? "raised" : "dimmed";
}

export type StepperView =
    | { kind: "empty" }
    | { kind: "idle"; count: number }
    | { kind: "selected"; position: number; count: number; atStart: boolean; atEnd: boolean };

/** `index` is zero-based, negative when no death is selected. */
export function stepperView(index: number, count: number): StepperView {
    if (count <= 0) return { kind: "empty" };
    if (index < 0 || index >= count) return { kind: "idle", count };
    return { kind: "selected", position: index + 1, count, atStart: index === 0, atEnd: index === count - 1 };
}

export type StepperAction = "start" | "prev" | "next" | "clear";

export function stepperAction(key: string, kind: StepperView["kind"]): StepperAction | null {
    if (kind === "idle") return key === "ArrowRight" || key === "Enter" ? "start" : null;
    if (kind !== "selected") return null;
    return key === "ArrowLeft" ? "prev" : key === "ArrowRight" ? "next" : key === "Escape" ? "clear" : null;
}

export interface SceneDot extends MapDot {
    role?: DeathRole;
}

export interface StepScene {
    timeS: number;
    dots: SceneDot[];
    line: { from: MapPoint; to: MapPoint } | null;
}

/** Every player at the moment of one death. The victim is drawn dead on the death spot. */
export function stepScene(decoded: DecodedPaths, step: DeathStep, radius: number): StepScene {
    const { event } = step;
    const dots: SceneDot[] = mapDots(decoded, event.timeS, radius).filter((d) => d.slot !== event.victimSlot);
    dots.push({ slot: event.victimSlot, team: event.victimTeam, alive: false, role: "victim", ...step.victim });

    const tracked = dots.findIndex((d) => d.slot === event.killerSlot);
    let from: MapPoint | null = null;
    if (tracked >= 0) {
        dots[tracked] = { ...dots[tracked], ...step.killer, role: "killer" };
        from = { left: dots[tracked].left, top: dots[tracked].top };
    } else if (step.killer) {
        dots.push({ slot: event.killerSlot, team: step.killerTeam, alive: true, role: "killer", ...step.killer });
        from = step.killer;
    }
    return { timeS: event.timeS, dots, line: from ? { from, to: step.victim } : null };
}

export interface DeathFacts {
    timeS: number;
    victimSlot: number;
    killerSlot: number;
    killerKnown: boolean;
    respawnS?: number;
    /** World coordinates, rounded. */
    position?: { x: number; y: number };
}

export function deathFacts(step: DeathStep): DeathFacts {
    const { event } = step;
    return {
        timeS: event.timeS,
        victimSlot: event.victimSlot,
        killerSlot: event.killerSlot,
        killerKnown: step.killerKnown,
        respawnS: event.respawnS,
        position: event.position && { x: Math.round(event.position.x), y: Math.round(event.position.y) },
    };
}
