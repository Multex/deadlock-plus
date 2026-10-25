import { describe, expect, it } from "vitest";

import { seeded } from "../../theme-decor-random";
import { CONSTELLATION_REACH, constellationAlpha, createSky, stepSky, type Sky } from "./sky";

const W = 1200;
const H = 800;
const STEP = 1 / 30;

const run = (sky: Sky, seconds: number, pointer: Parameters<typeof stepSky>[4] = null, random = seeded(9)) => {
    let busy = false;
    for (let t = 0; t < seconds; t += STEP) busy = stepSky(sky, STEP, W, H, pointer, random);
    return busy;
};

describe("createSky", () => {
    it("lays out the same sky for the same seed, inside the panel", () => {
        const a = createSky(W, H, seeded(1));

        expect(a).toEqual(createSky(W, H, seeded(1)));
        expect(a.flakes.length).toBeGreaterThanOrEqual(30);
        expect(a.stars.length).toBeGreaterThan(5);
        expect([...a.flakes, ...a.stars].every((b) => b.x >= 0 && b.x <= W && b.y >= 0 && b.y <= H)).toBe(true);
    });
});

describe("snow", () => {
    it("falls, and wraps back to the top", () => {
        const sky = createSky(W, H, seeded(2));
        const flake = sky.flakes[0]!;
        flake.y = H + 6.5;

        stepSky(sky, STEP, W, H, null, seeded(3));

        expect(flake.y).toBeLessThan(10);
    });

    it("swirls away from a moving cursor and ignores a resting one", () => {
        const moving = createSky(W, H, seeded(4));
        const resting = createSky(W, H, seeded(4));
        for (const sky of [moving, resting]) Object.assign(sky.flakes[0]!, { x: 610, y: 400, vx: 0, vy: 20 });

        stepSky(moving, STEP, W, H, { x: 600, y: 400, vx: 900, vy: 0 }, seeded(5));
        stepSky(resting, STEP, W, H, { x: 600, y: 400, vx: 0, vy: 0 }, seeded(5));

        expect(moving.flakes[0]!.vx).toBeGreaterThan(30);
        expect(Math.abs(resting.flakes[0]!.vx)).toBeLessThan(10);
    });
});

describe("stars", () => {
    it("drift slowly across the panel and wrap at its edges", () => {
        const sky = createSky(W, H, seeded(6));
        run(sky, 30);

        expect(sky.stars.every((s) => Math.hypot(s.vx, s.vy) < 20)).toBe(true);
        expect(sky.stars.every((s) => s.x >= -40 && s.x <= W + 40 && s.y >= -40 && s.y <= H + 40)).toBe(true);
    });

    it("leave a glitter trail that fades out, never more than the pool holds", () => {
        const sky = createSky(W, H, seeded(7));
        run(sky, 6);

        expect(sky.glitter.length).toBeGreaterThan(sky.stars.length);
        expect(sky.glitter.length).toBeLessThanOrEqual(90);
        expect(sky.glitter.every((g) => g.age < g.life)).toBe(true);
    });
});

describe("cursor sparkles", () => {
    it("trail a moving cursor and fade away once it rests", () => {
        const sky = createSky(W, H, seeded(8));

        run(sky, 0.5, { x: 600, y: 400, vx: 800, vy: 200 });
        expect(sky.sparks.length).toBeGreaterThan(5);
        expect(sky.sparks.length).toBeLessThanOrEqual(80);

        run(sky, 2, { x: 600, y: 400, vx: 0, vy: 0 });
        expect(sky.sparks).toEqual([]);
    });

    it("keep the scene at full frame rate only while they live", () => {
        const sky = createSky(W, H, seeded(10));

        expect(run(sky, 0.2, { x: 600, y: 400, vx: 800, vy: 0 })).toBe(true);
        expect(run(sky, 3)).toBe(false);
    });
});

describe("constellations", () => {
    it("form now and then between nearby stars, fading in and out", () => {
        const sky = createSky(W, H, seeded(11));
        let seen = false;
        for (let t = 0; t < 40 && !seen; t += STEP) {
            stepSky(sky, STEP, W, H, null, seeded(12 + Math.floor(t)));
            const c = sky.constellation;
            if (c && constellationAlpha(c, sky.time) > 0.5) {
                seen = true;
                for (const [a, b] of c.links) {
                    const [s, e] = [sky.stars[a]!, sky.stars[b]!];
                    expect(Math.hypot(s.x - e.x, s.y - e.y)).toBeLessThanOrEqual(CONSTELLATION_REACH * 1.2);
                }
            }
        }

        expect(seen).toBe(true);
    });

    it("are invisible at the moment they start and once they end", () => {
        const c = { links: [[0, 1] as [number, number]], start: 10, length: 5 };

        expect(constellationAlpha(c, 10)).toBe(0);
        expect(constellationAlpha(c, 12.5)).toBeGreaterThan(0.9);
        expect(constellationAlpha(c, 15)).toBe(0);
    });
});

describe("stepSky", () => {
    it("treats a long stall as one short step", () => {
        const a = createSky(W, H, seeded(13));
        const b = createSky(W, H, seeded(13));

        stepSky(a, 5, W, H, null, seeded(14));
        stepSky(b, 0.05, W, H, null, seeded(14));

        expect(a).toEqual(b);
    });
});
