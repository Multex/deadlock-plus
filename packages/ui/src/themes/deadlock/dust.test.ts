import { describe, expect, it } from "vitest";

import { seeded } from "../../theme-decor-random";
import { WAKE_RADIUS, beam, createMotes, moteCount, stepMotes, type Mote } from "./dust";

const W = 1000;
const H = 800;
const mote = (over: Partial<Mote> = {}): Mote => ({ x: 500, y: 400, vx: 0, vy: 0, depth: 0.5, phase: 0, ...over });

describe("moteCount", () => {
    it("scales with the panel and stays within bounds", () => {
        expect(moteCount(1000, 800)).toBeGreaterThan(moteCount(600, 400));
        expect(moteCount(100, 100)).toBe(70);
        expect(moteCount(5000, 3000)).toBe(180);
    });
});

describe("createMotes", () => {
    it("lays out the same motes for the same seed, all inside the panel", () => {
        const a = createMotes(80, W, H, seeded(3));
        const b = createMotes(80, W, H, seeded(3));

        expect(a).toEqual(b);
        expect(a.every((m) => m.x >= 0 && m.x <= W && m.y >= 0 && m.y <= H)).toBe(true);
    });
});

describe("stepMotes", () => {
    it("drifts slowly in still air", () => {
        const motes = [mote()];
        for (let i = 0; i < 120; i++) stepMotes(motes, 1 / 60, i / 60, W, H, null);

        expect(Math.hypot(motes[0]!.vx, motes[0]!.vy)).toBeLessThan(25);
    });

    it("pushes motes near the cursor along with it", () => {
        const motes = [mote({ x: 520, y: 400 })];

        stepMotes(motes, 1 / 60, 0, W, H, { x: 500, y: 400, vx: 900, vy: 0 });

        expect(motes[0]!.vx).toBeGreaterThan(40);
    });

    it("does nothing while the cursor rests, so it never leaves a hole in the dust", () => {
        const resting = [mote({ x: 520, y: 400 })];
        const calm = [mote({ x: 520, y: 400 })];

        stepMotes(resting, 1 / 60, 0, W, H, { x: 500, y: 400, vx: 0, vy: 0 });
        stepMotes(calm, 1 / 60, 0, W, H, null);

        expect(resting).toEqual(calm);
    });

    it("reports whether any mote is stirred, so calm air can be drawn less often", () => {
        const calm = [mote(), mote({ x: 100 })];
        const stirred = [mote(), mote({ x: 100, vx: 300 })];

        expect(stepMotes(calm, 1 / 60, 0, W, H, null)).toBe(false);
        expect(stepMotes(stirred, 1 / 60, 0, W, H, null)).toBe(true);
    });

    it("leaves motes outside the wake alone", () => {
        const near = [mote({ x: 500 + WAKE_RADIUS + 20, y: 400 })];
        const calm = [mote({ x: 500 + WAKE_RADIUS + 20, y: 400 })];

        stepMotes(near, 1 / 60, 0, W, H, { x: 500, y: 400, vx: 900, vy: 0 });
        stepMotes(calm, 1 / 60, 0, W, H, null);

        expect(near).toEqual(calm);
    });

    it("settles back down after the cursor stops", () => {
        const motes = [mote({ vx: 400, vy: -300 })];
        for (let i = 0; i < 300; i++) stepMotes(motes, 1 / 60, i / 60, W, H, null);

        expect(Math.hypot(motes[0]!.vx, motes[0]!.vy)).toBeLessThan(25);
    });

    it("wraps a mote that leaves one edge round to the other", () => {
        const motes = [mote({ x: W + 3, y: -3 })];

        stepMotes(motes, 1 / 60, 0, W, H, null);

        expect(motes[0]!.x).toBeLessThan(10);
        expect(motes[0]!.y).toBeGreaterThan(H - 10);
    });

    it("treats a long stall as one short step, so nothing jumps", () => {
        const stalled = [mote({ vx: 100 })];
        const short = [mote({ vx: 100 })];

        stepMotes(stalled, 5, 0, W, H, null);
        stepMotes(short, 0.05, 0, W, H, null);

        expect(stalled).toEqual(short);
    });
});

describe("beam", () => {
    it("is brightest under the lamp at the top centre and dim in the far corners", () => {
        expect(beam(W / 2, 40, W, H)).toBeGreaterThan(0.8);
        expect(beam(20, H - 20, W, H)).toBeLessThan(0.15);
    });
});
