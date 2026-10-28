import { describe, expect, it } from "vitest";
import { FLECKS, TEAR_MS, cubicBezier, flecksAt, tearFrame } from "./tear";

describe("cubicBezier", () => {
    it("is the identity for a linear curve", () => {
        expect(cubicBezier(0, 0, 1, 1)(0.3)).toBeCloseTo(0.3, 4);
    });

    it("pins both ends and can overshoot past 1 in between", () => {
        const back = cubicBezier(0.3, 1.5, 0.5, 1);
        expect(back(0)).toBe(0);
        expect(back(1)).toBe(1);
        expect(Math.max(...[0.3, 0.4, 0.5, 0.6].map(back))).toBeGreaterThan(1);
    });

    it("matches the CSS ease-in-out midpoint", () => {
        expect(cubicBezier(0.42, 0, 0.58, 1)(0.5)).toBeCloseTo(0.5, 4);
        expect(cubicBezier(0.42, 0, 0.58, 1)(0.25)).toBeCloseTo(0.1291, 3);
    });
});

describe("tearFrame", () => {
    it("starts with the bag whole and the cover in its slot", () => {
        const f = tearFrame(0);
        expect(f.strip).toMatchObject({ x: 0, y: 0, rotate: 0, opacity: 1 });
        expect(f.body).toMatchObject({ x: 0, y: 0, rotate: 0, opacity: 1 });
        expect(f.rip.scaleX).toBe(0);
        expect(f.slot).toEqual({ y: 0, scale: 1 });
        expect(f.plate.opacity).toBe(0);
        expect(f.plate.scale).toBeCloseTo(2.2);
        expect(f.flash).toBeNull();
        expect(f.settle).toBe(0);
        expect(f.done).toBe(false);
    });

    it("runs the rip the full width before the strip flies off", () => {
        expect(tearFrame(120 + 0.64 * 900).rip).toEqual({ scaleX: 1, opacity: 1 });
        expect(tearFrame(1020).rip.opacity).toBeCloseTo(0);
    });

    it("throws the strip up and right until it is gone", () => {
        const mid = tearFrame(0.6 * 1100).strip;
        expect(mid).toMatchObject({ x: 12, y: -16, rotate: -6, opacity: 1 });
        expect(tearFrame(1100).strip).toMatchObject({ x: 420, y: -560, rotate: 40, opacity: 0 });
    });

    it("drops the bag body away", () => {
        expect(tearFrame(800).body.y).toBe(0);
        expect(tearFrame(1570).body).toMatchObject({ x: 30, y: 1150, rotate: 5, opacity: 0.7 });
    });

    it("lifts the cover past its rest and settles it 30px up", () => {
        expect(tearFrame(850 + 0.6 * 600).slot).toEqual({ y: -38, scale: 1.012 });
        expect(tearFrame(1450).slot).toEqual({ y: -30, scale: 1 });
        expect(tearFrame(TEAR_MS).slot).toEqual({ y: -30, scale: 1 });
    });

    it("sweeps the foil flash once across the cover", () => {
        expect(tearFrame(1349).flash).toBeNull();
        expect(tearFrame(1350).flash).toBeCloseTo(-120);
        expect(tearFrame(1675).flash!).toBeGreaterThan(-120);
        expect(tearFrame(2001).flash).toBeNull();
    });

    it("thunks the copy-number plate down last", () => {
        expect(tearFrame(1749).plate.opacity).toBe(0);
        const end = tearFrame(1750 + 420).plate;
        expect(end).toMatchObject({ opacity: 1, rotate: -2 });
        expect(end.scale).toBeCloseTo(1);
    });

    it("hands the scale from the bag to the cover over the last 400ms and then ends", () => {
        expect(tearFrame(1900).settle).toBe(0);
        expect(tearFrame(2100).settle).toBeCloseTo(0.5, 1);
        expect(tearFrame(TEAR_MS)).toMatchObject({ settle: 1, done: true });
    });

    it("gives the same frame for the same time", () => {
        expect(tearFrame(1234)).toEqual(tearFrame(1234));
    });
});

describe("flecksAt", () => {
    it("shows no fleck before the rip reaches it or after the burst", () => {
        expect(flecksAt(0).every((f) => f.opacity === 0)).toBe(true);
        expect(flecksAt(2000).every((f) => f.opacity === 0)).toBe(true);
    });

    it("throws each fleck from the tear line along its own path", () => {
        const first = FLECKS[0];
        const f = flecksAt(first.delay + 350)[0];
        expect(f.opacity).toBeGreaterThan(0);
        expect(f.opacity).toBeLessThan(1);
        expect(f.y).toBeLessThan(first.y);
        expect(f.x).not.toBe(first.x);
    });

    it("spreads the flecks along the whole tear, left first", () => {
        expect(FLECKS.length).toBeGreaterThanOrEqual(20);
        expect(FLECKS[0].delay).toBeLessThan(FLECKS.at(-1)!.delay);
        expect(Math.max(...FLECKS.map((f) => f.x))).toBeGreaterThan(700);
        expect(flecksAt(700)).toEqual(flecksAt(700));
    });
});
