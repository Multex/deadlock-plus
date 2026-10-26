import { describe, expect, it } from "vitest";
import { ARRIVE_END, REST_ANGLE, arrival, easeInOut, stickerScale, turnAngles } from "./timeline";

describe("arrival", () => {
    it("starts below the table, out of sight", () => {
        const a = arrival(0);
        expect(a.opacity).toBe(0);
        expect(a.y).toBeGreaterThan(400);
        expect(a.sticker).toBe(0);
    });

    it("ends at rest: on the table, tilted, closed, sticker on, no sweep", () => {
        const a = arrival(ARRIVE_END);
        expect(a).toEqual({ y: 0, rot: REST_ANGLE, opacity: 1, lift1: 0, lift2: 0, glare: -1, sticker: 1 });
        expect(arrival(ARRIVE_END + 5000)).toEqual(a);
    });

    it("lands before the thumb riffles the pages, and lifts the cover more than the page under it", () => {
        expect(arrival(650).y).toBeCloseTo(0, 6);
        const riffle = arrival(930);
        expect(riffle.lift1).toBeLessThan(-40);
        expect(riffle.lift2).toBeLessThan(0);
        expect(riffle.lift1).toBeLessThan(riffle.lift2);
        expect(arrival(1500).lift1).toBe(0);
    });

    it("sweeps the light across the laminate after the riffle, left to right", () => {
        expect(arrival(1300).glare).toBe(-1);
        const early = arrival(1500).glare;
        const late = arrival(2000).glare;
        expect(early).toBeGreaterThanOrEqual(0);
        expect(late).toBeGreaterThan(early);
        expect(arrival(2200).glare).toBe(-1);
    });

    it("pops the sticker last", () => {
        expect(arrival(1890).sticker).toBe(0);
        expect(arrival(2050).sticker).toBeGreaterThan(0);
        expect(arrival(2050).sticker).toBeLessThan(1);
    });

    it("is the same frame for the same time", () => {
        expect(arrival(1234)).toEqual(arrival(1234));
    });
});

describe("stickerScale", () => {
    it("overshoots, then settles at full size", () => {
        expect(stickerScale(0)).toBe(0);
        expect(stickerScale(0.7)).toBeGreaterThan(1.1);
        expect(stickerScale(1)).toBe(1);
    });
});

describe("turnAngles", () => {
    it("keeps the riffle while closed and turns each leaf flat over to the left", () => {
        const a = arrival(930);
        expect(turnAngles(a, 0, 0)).toEqual({ a1: a.lift1, a2: a.lift2 });
        expect(turnAngles(arrival(ARRIVE_END), 1, 0)).toEqual({ a1: -180, a2: 0 });
        expect(turnAngles(arrival(ARRIVE_END), 1, 1)).toEqual({ a1: -180, a2: -180 });
    });
});

describe("easeInOut", () => {
    it("runs 0 to 1 and is symmetric", () => {
        expect(easeInOut(0)).toBe(0);
        expect(easeInOut(1)).toBe(1);
        expect(easeInOut(0.5)).toBeCloseTo(0.5, 6);
        expect(easeInOut(0.25) + easeInOut(0.75)).toBeCloseTo(1, 6);
    });
});
