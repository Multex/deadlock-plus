import { describe, expect, it } from "vitest";
import { parseApiDetail } from "./api-detail";
import { WORLD_RADIUS, decodePaths } from "./paths";
import {
    DEFAULT_KINDS,
    TIMELINE_LANES,
    advance,
    deathMarkers,
    eventTeam,
    laneOf,
    mapDots,
    mapPercent,
    markerPercent,
    replayDuration,
    toggleKind,
} from "./replay";
import { buildTimeline, type TimelineEvent } from "./timeline";
import fixture from "./fixtures/api-paths.json";

const detail = parseApiDetail(structuredClone(fixture))!;
const decoded = decodePaths(detail)!;
const events = buildTimeline(detail);

describe("advance", () => {
    it("moves by elapsed time times speed", () => {
        expect(advance(10, 500, 2, 100)).toEqual({ t: 11, ended: false });
    });

    it("stops at the end and reports it", () => {
        expect(advance(99.5, 1000, 1, 100)).toEqual({ t: 100, ended: true });
    });

    it("never goes below zero", () => {
        expect(advance(0, -500, 1, 100).t).toBe(0);
    });
});

describe("mapPercent", () => {
    it("puts the world centre in the middle", () => {
        expect(mapPercent(0, 0, WORLD_RADIUS)).toEqual({ left: 50, top: 50 });
    });

    it("flips y so north is up", () => {
        const p = mapPercent(0, WORLD_RADIUS, WORLD_RADIUS);
        expect(p.top).toBeCloseTo(0, 6);
    });

    it("scales by the art radius", () => {
        const p = mapPercent(WORLD_RADIUS / 2, 0, WORLD_RADIUS * 2);
        expect(p.left).toBeCloseTo(62.5, 6);
    });

    it("keeps out-of-range points off the map edge instead of clamping silently", () => {
        expect(mapPercent(WORLD_RADIUS * 2, 0, WORLD_RADIUS).left).toBeGreaterThan(100);
    });
});

describe("mapDots", () => {
    it("returns one dot per path series", () => {
        const dots = mapDots(decoded, 30, WORLD_RADIUS);
        expect(dots.map((d) => d.slot).sort()).toEqual([2, 6]);
        expect(dots.every((d) => d.left >= 0 && d.left <= 100 && d.top >= 0 && d.top <= 100)).toBe(true);
    });

    it("moves between samples at a continuous time", () => {
        const slot = 6;
        const s = decoded.series.find((x) => x.slot === slot)!;
        const a = mapDots(decoded, 20, WORLD_RADIUS).find((d) => d.slot === slot)!;
        const b = mapDots(decoded, 21, WORLD_RADIUS).find((d) => d.slot === slot)!;
        const mid = mapDots(decoded, 20.5, WORLD_RADIUS).find((d) => d.slot === slot)!;
        expect(s.samples[20].alive && s.samples[21].alive).toBe(true);
        expect(mid.left).toBeCloseTo((a.left + b.left) / 2, 6);
        expect(mid.top).toBeCloseTo((a.top + b.top) / 2, 6);
    });

    it("marks a dead player", () => {
        const dead = decoded.series.find((s) => s.samples.some((x) => !x.alive))!;
        const at = dead.samples.find((x) => !x.alive)!;
        expect(mapDots(decoded, at.t, WORLD_RADIUS).find((d) => d.slot === dead.slot)!.alive).toBe(false);
    });
});

describe("deathMarkers", () => {
    const radius = WORLD_RADIUS;

    it("keeps only deaths that have a position", () => {
        const stripped: TimelineEvent[] = events.map((e) =>
            e.kind === "death" && e.victimSlot === 2 ? { ...e, position: undefined } : e,
        );
        const out = deathMarkers(stripped, {}, radius);
        expect(out.some((m) => m.event.victimSlot === 2)).toBe(false);
        expect(out.some((m) => m.event.victimSlot === 6)).toBe(true);
    });

    it("links the killer position when present", () => {
        const out = deathMarkers(events, { slot: 2 }, radius);
        expect(out).toHaveLength(5);
        expect(out[0].killer).toBeDefined();
        expect(out[0].victim.left).not.toBeNaN();
    });

    it("omits the killer link without a killer position", () => {
        const stripped = events.map((e) => (e.kind === "death" ? { ...e, killerPosition: undefined } : e));
        const out = deathMarkers(stripped, {}, radius);
        expect(out.length).toBeGreaterThan(0);
        expect(out.every((m) => m.killer === undefined)).toBe(true);
    });

    it("filters by an inclusive time range", () => {
        const out = deathMarkers(events, { slot: 2, fromS: 140, toS: 140 }, radius);
        expect(out).toHaveLength(1);
        expect(out[0].event.timeS).toBe(140);
    });

    it("filters by killer", () => {
        const out = deathMarkers(events, { slot: 7, role: "killer" }, radius);
        expect(out.every((m) => m.event.killerSlot === 7)).toBe(true);
    });
});

describe("timeline layout", () => {
    it("places markers proportionally and clamps", () => {
        expect(markerPercent(50, 200)).toBe(25);
        expect(markerPercent(-5, 200)).toBe(0);
        expect(markerPercent(500, 200)).toBe(100);
        expect(markerPercent(5, 0)).toBe(0);
    });

    it("gives every kind exactly one lane", () => {
        const kinds = TIMELINE_LANES.flatMap((l) => l.kinds);
        expect(new Set(kinds).size).toBe(kinds.length);
        for (const e of events) expect(laneOf(e.kind)).toBeDefined();
    });

    it("starts without the noisy item kinds", () => {
        expect(DEFAULT_KINDS).toContain("death");
        expect(DEFAULT_KINDS).toContain("objective");
        expect(DEFAULT_KINDS).not.toContain("item-buy");
    });

    it("toggles a kind without mutating the input", () => {
        const base = ["death"] as const;
        const on = toggleKind(base, "objective");
        expect(on).toEqual(["death", "objective"]);
        expect(toggleKind(on, "death")).toEqual(["objective"]);
        expect(base).toEqual(["death"]);
    });
});

describe("eventTeam", () => {
    it("uses the victim team for deaths and the gainer for swings", () => {
        const death = events.find((e) => e.kind === "death")!;
        expect(eventTeam(death)).toBe(death.kind === "death" ? death.victimTeam : null);
        expect(
            eventTeam({ kind: "swing", timeS: 1, fromS: 0, team: "archmother", leadBefore: 0, leadAfter: -3000 }),
        ).toBe("archmother");
    });

    it("prefers the claimer for the mid boss and may have none", () => {
        expect(eventTeam({ kind: "mid-boss", timeS: 1, killedBy: "hidden-king", claimedBy: "archmother" })).toBe(
            "archmother",
        );
        expect(eventTeam({ kind: "mid-boss", timeS: 1 })).toBeNull();
    });
});

describe("replayDuration", () => {
    it("is the longest of the recorded paths, the match and the events", () => {
        expect(replayDuration(detail, decoded, events)).toBe(Math.max(detail.durationS, decoded.durationS));
    });

    it("works without paths", () => {
        expect(replayDuration(detail, null, events)).toBe(detail.durationS);
    });

    it("stretches to a late event", () => {
        const late: TimelineEvent = { kind: "mid-boss", timeS: 99999 };
        expect(replayDuration(detail, null, [late])).toBe(99999);
    });
});
