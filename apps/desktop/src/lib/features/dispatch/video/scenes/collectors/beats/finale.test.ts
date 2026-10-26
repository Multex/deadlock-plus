import { describe, expect, it } from "vitest";
import { collectorsSfx } from "../data";
import type { CollectorsBeatId } from "../plan";
import type { Beat } from "../../../beats";
import { chaseTimes } from "./chase";
import { fanSlot } from "./fan";
import { holoTilt } from "./holo";
import { slabTimes, wrapParts } from "./slab";
import type { Ctx } from "../../../kit/types";

const BAR = (60 / 155) * 4;
const beat = (id: CollectorsBeatId, bars: number): Beat<CollectorsBeatId> => ({
    id,
    kind: "collectors",
    bar: 0,
    bars,
    presents: [],
});
const cue = (id: CollectorsBeatId, bars: number, name: string) =>
    collectorsSfx([beat(id, bars)], BAR).find((c) => c.cue === name)!.atSeconds;

describe("chaseTimes", () => {
    for (const bars of [3, 4, 5, 6, 7]) {
        it(`turns the face up just after the holo sound in a ${bars}-bar chase`, () => {
            const t = chaseTimes(bars * BAR, BAR);
            expect(t.reveal).toBeCloseTo(cue("c_chase", bars, "holo_reveal"), 9);
            expect(t.flipStart + t.flipDur / 2).toBeGreaterThanOrEqual(t.reveal - 0.05);
            expect(t.flipStart + t.flipDur / 2).toBeLessThanOrEqual(t.reveal + 0.15);
            expect(t.lift).toBeLessThan(t.flipStart);
            expect(t.stamp).toBeLessThan(bars * BAR - 1);
        });
    }
});

describe("slabTimes", () => {
    for (const bars of [2, 3, 4]) {
        it(`clicks the case shut on the slab sound in a ${bars}-bar slab`, () => {
            const t = slabTimes(bars * BAR, BAR);
            expect(t.click).toBeCloseTo(cue("c_slab", bars, "slab_click"), 9);
            expect(t.seated).toBeLessThanOrEqual(t.click);
        });
    }
});

describe("fanSlot", () => {
    it("is symmetric about the centre card, which stands upright", () => {
        for (const n of [3, 5, 6]) {
            for (let i = 0; i < n; i++) {
                const a = fanSlot(i, n);
                const b = fanSlot(n - 1 - i, n);
                expect(a.rot).toBeCloseTo(-b.rot, 9);
                expect(a.x).toBeCloseTo(-b.x, 9);
                expect(a.y).toBeCloseTo(b.y, 9);
            }
        }
        expect(fanSlot(2, 5).rot).toBe(0);
    });
    it("spreads wider with more cards but never past a quarter turn either side", () => {
        expect(fanSlot(0, 6).rot).toBeLessThan(fanSlot(0, 4).rot);
        for (const n of [2, 4, 8, 12]) expect(Math.abs(fanSlot(0, n).rot)).toBeLessThanOrEqual(Math.PI / 4);
    });
});

describe("holoTilt", () => {
    it("stays in -1 to 1 and keeps moving", () => {
        let moved = 0;
        for (let t = 0; t < 20; t += 0.05) {
            const v = holoTilt(t);
            expect(Math.abs(v)).toBeLessThanOrEqual(1);
            moved += Math.abs(holoTilt(t + 0.05) - v);
        }
        expect(moved).toBeGreaterThan(5);
    });
});

describe("wrapParts", () => {
    const ctx = { measureText: (s: string) => ({ width: s.length * 10 }) } as unknown as Ctx;
    it("breaks at the separators before it breaks words, and never leaves a dot at a line end", () => {
        expect(wrapParts(ctx, "23 matches · Kettle · Season 1", 200)).toEqual(["23 matches · Kettle", "Season 1"]);
        expect(wrapParts(ctx, "Authentic · No. 239522", 150)).toEqual(["Authentic", "No. 239522"]);
        expect(wrapParts(ctx, "Graded for Moth. Season 1, 22 matches.", 220)).toEqual([
            "Graded for Moth.",
            "Season 1, 22 matches.",
        ]);
        expect(wrapParts(ctx, "Short · line", 400)).toEqual(["Short · line"]);
    });
});
