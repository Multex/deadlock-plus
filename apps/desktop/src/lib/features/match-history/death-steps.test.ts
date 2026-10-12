import { describe, expect, it } from "vitest";
import { parseApiDetail } from "./api-detail";
import {
    activeDeath,
    deathEmphasis,
    deathFacts,
    deathSteps,
    resolveScope,
    scopeFilter,
    stepIndex,
    stepperAction,
    stepperView,
    stepScene,
    stepTo,
    type DeathStep,
} from "./death-steps";
import { playerBySlot } from "./detail";
import { WORLD_RADIUS, decodePaths } from "./paths";
import { DOT_SIZE } from "./player-dot";
import { mapDots, mapPercent } from "./replay";
import { buildTimeline, type TimelineEvent } from "./timeline";
import fixture from "./fixtures/api-paths.json";

const detail = parseApiDetail(structuredClone(fixture))!;
const decoded = decodePaths(detail)!;
const events = buildTimeline(detail);
const OWN = 2;
const OTHER = 6;
const ownTeam = playerBySlot(detail, OWN)!.team;
const otherTeam = playerBySlot(detail, OTHER)!.team;

const stepsFor = (slot?: number) => deathSteps(detail, events, { slot }, WORLD_RADIUS);

describe("resolveScope", () => {
    it("defaults to the viewer's own deaths when the viewer is in the match", () => {
        expect(resolveScope(null, OWN)).toBe("mine");
    });

    it("defaults to every death when the viewer is not in the match", () => {
        expect(resolveScope(null, null)).toBe("all");
    });

    it("drops the own-deaths choice when the viewer is not in the match", () => {
        expect(resolveScope("mine", null)).toBe("all");
    });

    it("keeps an explicit choice", () => {
        expect(resolveScope("all", OWN)).toBe("all");
        expect(resolveScope(6, OWN)).toBe(6);
        expect(resolveScope(6, null)).toBe(6);
    });
});

describe("scopeFilter", () => {
    const range = { fromS: 10, toS: 90 };

    it("selects the viewer as victim for own deaths, whatever the role", () => {
        expect(scopeFilter("mine", OWN, "killer", range)).toEqual({ slot: OWN, role: "victim", ...range });
    });

    it("selects no player for every death", () => {
        expect(scopeFilter("all", OWN, "killer", range)).toEqual({ slot: undefined, role: "killer", ...range });
    });

    it("selects the picked player in the picked role", () => {
        expect(scopeFilter(6, OWN, "killer", range)).toEqual({ slot: 6, role: "killer", ...range });
    });
});

describe("deathSteps", () => {
    it("lists only the selected player's deaths, in time order", () => {
        const steps = stepsFor(OWN);
        expect(steps.map((s) => s.event.timeS)).toEqual([140, 232, 519, 580, 650]);
        expect(steps.every((s) => s.event.victimSlot === OWN)).toBe(true);
    });

    it("orders by time even when the events are not", () => {
        const steps = deathSteps(detail, [...events].reverse(), {}, WORLD_RADIUS);
        const times = steps.map((s) => s.event.timeS);
        expect(times).toEqual([...times].sort((a, b) => a - b));
        expect(times).toHaveLength(9);
    });

    it("respects the time range", () => {
        const steps = deathSteps(detail, events, { slot: OWN, fromS: 200, toS: 600 }, WORLD_RADIUS);
        expect(steps.map((s) => s.event.timeS)).toEqual([232, 519, 580]);
    });

    it("looks the killer up in the roster", () => {
        const step = stepsFor(OTHER).find((s) => s.event.timeS === 719)!;
        expect(step.killerKnown).toBe(true);
        expect(step.killerHeroId).toBe(playerBySlot(detail, OWN)!.heroId);
        expect(step.killerTeam).toBe(ownTeam);
    });

    it("treats a killer outside the roster as an enemy of the victim", () => {
        const step = stepsFor(OWN)[0];
        expect(step.killerKnown).toBe(false);
        expect(step.killerHeroId).toBeNull();
        expect(step.killerTeam).not.toBe(ownTeam);
    });

    it("puts the killer at the recorded killer position", () => {
        const step = stepsFor(OWN)[0];
        const pos = step.event.killerPosition!;
        expect(step.killerSpot).toEqual(mapPercent(pos.x, pos.y, WORLD_RADIUS));
        expect(step.killerSpot).toEqual(step.killer);
    });

    it("puts the killer beside the death when no killer position was recorded", () => {
        const bare = events.map((e) => (e.kind === "death" ? { ...e, killerPosition: undefined } : e));
        const step = deathSteps(detail, bare, { slot: OWN }, WORLD_RADIUS)[0];
        expect(step.killer).toBeUndefined();
        expect(step.killerSpot.left).toBeGreaterThan(step.victim.left);
        expect(step.killerSpot.top).toBeLessThan(step.victim.top);
        expect(step.killerSpot.left - step.victim.left).toBeLessThan(DOT_SIZE * 100);
    });

    it("skips a death with no recorded position", () => {
        const bare = events.map((e) => (e.kind === "death" && e.timeS === 140 ? { ...e, position: undefined } : e));
        expect(deathSteps(detail, bare, { slot: OWN }, WORLD_RADIUS)).toHaveLength(4);
    });
});

describe("stepping", () => {
    const steps = stepsFor(OWN);
    const at = (i: number) => steps[i].event;

    it("finds the selected death", () => {
        expect(stepIndex(steps, at(2))).toBe(2);
        expect(stepIndex(steps, null)).toBe(-1);
        expect(stepIndex(steps, stepsFor(OTHER)[0].event)).toBe(-1);
    });

    it("starts at the first death going forward and the last going back", () => {
        expect(stepTo(steps, null, 1)).toBe(at(0));
        expect(stepTo(steps, null, -1)).toBe(at(4));
    });

    it("moves one death at a time", () => {
        expect(stepTo(steps, at(1), 1)).toBe(at(2));
        expect(stepTo(steps, at(1), -1)).toBe(at(0));
    });

    it("stops at both ends", () => {
        expect(stepTo(steps, at(4), 1)).toBe(at(4));
        expect(stepTo(steps, at(0), -1)).toBe(at(0));
    });

    it("restarts from the nearest end when the selection is outside the list", () => {
        expect(stepTo(steps, stepsFor(OTHER)[0].event, 1)).toBe(at(0));
    });

    it("has nothing to step to in an empty list", () => {
        expect(stepTo([], null, 1)).toBeNull();
    });
});

describe("stepperView", () => {
    it("has no controls when there are no deaths", () => {
        expect(stepperView(-1, 0)).toEqual({ kind: "empty" });
        expect(stepperView(0, 0)).toEqual({ kind: "empty" });
    });

    it("shows a plain count, never an index, while no death is selected", () => {
        expect(stepperView(-1, 11)).toEqual({ kind: "idle", count: 11 });
    });

    it("is idle when the index is past the list", () => {
        expect(stepperView(11, 11)).toEqual({ kind: "idle", count: 11 });
    });

    it("counts from one once a death is selected", () => {
        expect(stepperView(2, 11)).toEqual({ kind: "selected", position: 3, count: 11, atStart: false, atEnd: false });
    });

    it("marks both ends", () => {
        expect(stepperView(0, 11)).toMatchObject({ atStart: true, atEnd: false });
        expect(stepperView(10, 11)).toMatchObject({ atStart: false, atEnd: true });
        expect(stepperView(0, 1)).toMatchObject({ atStart: true, atEnd: true });
    });
});

describe("stepperAction", () => {
    it("starts stepping with Right or Enter while idle", () => {
        expect(stepperAction("ArrowRight", "idle")).toBe("start");
        expect(stepperAction("Enter", "idle")).toBe("start");
    });

    it("ignores every other key while idle", () => {
        expect(stepperAction("ArrowLeft", "idle")).toBeNull();
        expect(stepperAction("Escape", "idle")).toBeNull();
        expect(stepperAction("a", "idle")).toBeNull();
    });

    it("steps with the horizontal arrows and leaves with Escape once a death is selected", () => {
        expect(stepperAction("ArrowLeft", "selected")).toBe("prev");
        expect(stepperAction("ArrowRight", "selected")).toBe("next");
        expect(stepperAction("Escape", "selected")).toBe("clear");
    });

    it("leaves Enter to the focused button once a death is selected", () => {
        expect(stepperAction("Enter", "selected")).toBeNull();
        expect(stepperAction("ArrowUp", "selected")).toBeNull();
    });

    it("does nothing when there are no deaths", () => {
        expect(stepperAction("ArrowRight", "empty")).toBeNull();
        expect(stepperAction("Enter", "empty")).toBeNull();
    });
});

describe("stepScene", () => {
    it("draws every tracked player at the moment of death", () => {
        const step = stepsFor(OWN)[0];
        const scene = stepScene(decoded, step, WORLD_RADIUS);
        const plain = mapDots(decoded, step.event.timeS, WORLD_RADIUS);
        expect(scene.timeS).toBe(140);
        for (const dot of plain) expect(scene.dots.some((d) => d.slot === dot.slot)).toBe(true);
        const bystander = scene.dots.find((d) => d.slot === OTHER)!;
        expect(bystander).toEqual(plain.find((d) => d.slot === OTHER));
    });

    it("shows the victim dead, on the death spot", () => {
        const step = stepsFor(OWN)[0];
        const victim = stepScene(decoded, step, WORLD_RADIUS).dots.find((d) => d.slot === OWN)!;
        expect(victim).toMatchObject({ role: "victim", alive: false, team: ownTeam, ...step.victim });
    });

    it("adds a killer that has no recorded path, at the killer position", () => {
        const step = stepsFor(OWN)[0];
        const scene = stepScene(decoded, step, WORLD_RADIUS);
        const killer = scene.dots.find((d) => d.slot === step.event.killerSlot)!;
        expect(killer).toMatchObject({ role: "killer", alive: true, team: otherTeam, ...step.killer });
        expect(scene.dots).toHaveLength(decoded.series.length + 1);
    });

    it("moves a tracked killer to the recorded killer position", () => {
        const step = stepsFor(OTHER).find((s) => s.event.timeS === 719)!;
        const scene = stepScene(decoded, step, WORLD_RADIUS);
        expect(scene.dots).toHaveLength(decoded.series.length);
        expect(scene.dots.find((d) => d.slot === OWN)).toMatchObject({ role: "killer", ...step.killer });
        expect(scene.dots.filter((d) => d.role === undefined)).toHaveLength(decoded.series.length - 2);
    });

    it("draws a line from the killer to the victim", () => {
        const step = stepsFor(OWN)[0];
        expect(stepScene(decoded, step, WORLD_RADIUS).line).toEqual({ from: step.killer, to: step.victim });
    });

    it("draws no line when the killer was not located", () => {
        const bare: TimelineEvent[] = events.map((e) => (e.kind === "death" ? { ...e, killerPosition: undefined } : e));
        const step = deathSteps(detail, bare, { slot: OWN }, WORLD_RADIUS)[0];
        const scene = stepScene(decoded, step, WORLD_RADIUS);
        expect(scene.line).toBeNull();
        expect(scene.dots.some((d) => d.role === "killer")).toBe(false);
    });

    it("uses the path position for a tracked killer with no recorded killer position", () => {
        const bare: TimelineEvent[] = events.map((e) => (e.kind === "death" ? { ...e, killerPosition: undefined } : e));
        const step = deathSteps(detail, bare, { slot: OTHER }, WORLD_RADIUS).find((s) => s.event.timeS === 719)!;
        const scene = stepScene(decoded, step, WORLD_RADIUS);
        const killer = scene.dots.find((d) => d.slot === OWN)!;
        const tracked = mapDots(decoded, 719, WORLD_RADIUS).find((d) => d.slot === OWN)!;
        expect(killer).toMatchObject({ role: "killer", left: tracked.left, top: tracked.top });
        expect(scene.line).toEqual({ from: { left: tracked.left, top: tracked.top }, to: step.victim });
    });
});

describe("deathFacts", () => {
    it("carries the time, killer, respawn and position of a death", () => {
        const step: DeathStep = stepsFor(OWN)[0];
        const pos = step.event.position!;
        expect(deathFacts(step)).toEqual({
            timeS: 140,
            victimSlot: OWN,
            killerSlot: 7,
            killerKnown: false,
            respawnS: 25,
            position: { x: Math.round(pos.x), y: Math.round(pos.y) },
        });
    });

    it("leaves the respawn out when it was not recorded", () => {
        const step = stepsFor(OWN)[0];
        const facts = deathFacts({ ...step, event: { ...step.event, respawnS: undefined } });
        expect(facts.respawnS).toBeUndefined();
    });
});

describe("activeDeath", () => {
    const steps = stepsFor();
    const [a, b] = steps.map((s) => s.event);

    it("is nothing without a pointer or focus on a death", () => {
        expect(activeDeath(steps, null, null)).toBeNull();
    });

    it("is the death under the pointer", () => {
        expect(activeDeath(steps, a, null)).toBe(a);
    });

    it("is the focused death when the pointer is on none", () => {
        expect(activeDeath(steps, null, b)).toBe(b);
    });

    it("prefers the pointer over focus", () => {
        expect(activeDeath(steps, a, b)).toBe(a);
    });

    it("ignores a death that is not drawn", () => {
        const own = stepsFor(OWN);
        const foreign = steps.find((s) => s.event.victimSlot !== OWN)!.event;
        expect(activeDeath(own, foreign, null)).toBeNull();
        expect(activeDeath(own, foreign, own[0].event)).toBe(own[0].event);
        expect(activeDeath([], a, b)).toBeNull();
    });
});

describe("deathEmphasis", () => {
    const [a, b] = stepsFor().map((s) => s.event);

    it("leaves every death as it is when none is active", () => {
        expect(deathEmphasis(a, null)).toBe("normal");
        expect(deathEmphasis(b, null)).toBe("normal");
    });

    it("raises the active death and dims every other one", () => {
        expect(deathEmphasis(a, a)).toBe("raised");
        expect(deathEmphasis(b, a)).toBe("dimmed");
    });
});
