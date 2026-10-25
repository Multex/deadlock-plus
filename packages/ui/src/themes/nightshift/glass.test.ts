import { describe, expect, it } from "vitest";

import { seeded } from "../../theme-decor-random";
import { FOG_CELL, SLIDE_RADIUS, createGlass, fogAt, stepGlass, type Glass } from "./glass";

const W = 1200;
const H = 800;
const STEP = 1 / 30;

const run = (glass: Glass, seconds: number, pointer: Parameters<typeof stepGlass>[4] = null, seed = 1) => {
    const random = seeded(seed);
    let busy = false;
    for (let t = 0; t < seconds; t += STEP) busy = stepGlass(glass, STEP, W, H, pointer, random);
    return busy;
};

describe("createGlass", () => {
    it("starts fogged, with the same drops for the same seed", () => {
        const glass = createGlass(W, H, seeded(1));

        expect(glass).toEqual(createGlass(W, H, seeded(1)));
        expect(glass.drops.length).toBeGreaterThan(40);
        expect(fogAt(glass, 600, 400)).toBeGreaterThan(0.9);
    });
});

describe("drops", () => {
    it("slide down once they are heavy enough, and leave beads behind", () => {
        const glass = createGlass(W, H, seeded(2));
        glass.drops = [{ x: 600, y: 100, r: SLIDE_RADIUS + 1, vy: 0, sliding: false, shed: 0 }];
        glass.spawnEvery = Infinity;

        run(glass, 1);

        const big = glass.drops.reduce((a, b) => (a.r > b.r ? a : b));
        expect(big.y).toBeGreaterThan(130);
        expect(glass.drops.filter((d) => d.r < 1.6 && d.y < big.y).length).toBeGreaterThan(2);
    });

    it("cling while small", () => {
        const glass = createGlass(W, H, seeded(3));
        glass.drops = [{ x: 600, y: 100, r: 1.5, vy: 0, sliding: false, shed: 0 }];
        glass.spawnEvery = Infinity;

        run(glass, 2);

        expect(glass.drops[0]!.y).toBe(100);
    });

    it("merge on contact, keeping their water", () => {
        const glass = createGlass(W, H, seeded(4));
        glass.drops = [
            { x: 600, y: 100, r: 3, vy: 0, sliding: false, shed: 0 },
            { x: 603, y: 100, r: 2, vy: 0, sliding: false, shed: 0 },
        ];
        glass.spawnEvery = Infinity;

        stepGlass(glass, STEP, W, H, null, seeded(5));

        expect(glass.drops.length).toBe(1);
        expect(glass.drops[0]!.r).toBeCloseTo(Math.sqrt(13));
    });

    it("never grow past the pool", () => {
        const glass = createGlass(W, H, seeded(6));
        run(glass, 30);

        expect(glass.drops.length).toBeLessThanOrEqual(260);
    });
});

describe("condensation", () => {
    it("is wiped where a moving cursor passes, and fogs back slowly", () => {
        const glass = createGlass(W, H, seeded(7));

        stepGlass(glass, STEP, W, H, { x: 600, y: 400, vx: 700, vy: 0 }, seeded(8));
        const wiped = fogAt(glass, 600, 400);
        expect(wiped).toBeLessThan(0.6);

        run(glass, 4);
        expect(fogAt(glass, 600, 400)).toBeGreaterThan(wiped);
        expect(fogAt(glass, 600, 400)).toBeLessThan(0.95);
    });

    it("stays put under a resting cursor", () => {
        const glass = createGlass(W, H, seeded(9));

        stepGlass(glass, STEP, W, H, { x: 600, y: 400, vx: 0, vy: 0 }, seeded(10));

        expect(fogAt(glass, 600, 400)).toBeGreaterThan(0.9);
    });

    it("is cleared along the path a sliding drop runs down", () => {
        const glass = createGlass(W, H, seeded(11));
        glass.drops = [{ x: 300, y: 100, r: SLIDE_RADIUS + 2, vy: 0, sliding: false, shed: 0 }];
        glass.spawnEvery = Infinity;

        run(glass, 1.5);

        expect(fogAt(glass, 300, 160)).toBeLessThan(0.8);
        expect(fogAt(glass, 300 + FOG_CELL * 4, 160)).toBeGreaterThan(0.9);
    });
});

describe("stepGlass", () => {
    it("asks for full frame rate while a drop slides or the cursor wipes, and calm otherwise", () => {
        const sliding = createGlass(W, H, seeded(12));
        sliding.drops = [{ x: 600, y: 100, r: SLIDE_RADIUS + 1, vy: 0, sliding: false, shed: 0 }];
        sliding.spawnEvery = Infinity;
        const still = createGlass(W, H, seeded(12));
        still.drops = [{ x: 600, y: 100, r: 1.5, vy: 0, sliding: false, shed: 0 }];
        still.spawnEvery = Infinity;

        expect(run(sliding, 0.3)).toBe(true);
        expect(run(still, 0.3)).toBe(false);
    });
});
