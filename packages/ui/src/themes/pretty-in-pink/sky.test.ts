import { describe, expect, it } from "vitest";

import { seeded } from "../../theme-decor-random";
import {
    CLOUD_BAND,
    MAX_HEARTS,
    bankPuffs,
    cloudPuffs,
    createSky,
    edgeX,
    fitSky,
    heartAlpha,
    stepSky,
    type Heart,
    type Sky,
} from "./sky";

const W = 1230;
const H = 830;
const STEP = 1 / 20;
const run = (sky: Sky, seconds: number, seed = 1, width = W, height = H) => {
    const random = seeded(seed);
    for (let t = 0; t < seconds; t += STEP) stepSky(sky, STEP, width, height, random);
};
const top = (sky: Sky) => sky.clouds.map((c) => c.y + c.height * c.scale);

describe("cloudPuffs", () => {
    it("builds one fluffy cloud: every puff touches the next, none hangs below the flat base", () => {
        for (let seed = 1; seed < 20; seed++) {
            const cloud = cloudPuffs(seeded(seed));
            expect(cloud.puffs.length).toBeGreaterThanOrEqual(5);
            for (const p of cloud.puffs) {
                expect(p.dy + p.r).toBeLessThanOrEqual(cloud.height + 0.001);
                expect(p.dx - p.r).toBeGreaterThanOrEqual(-0.001);
                expect(p.dx + p.r).toBeLessThanOrEqual(cloud.width + 0.001);
            }
            for (let i = 1; i < cloud.puffs.length; i++) {
                const [a, b] = [cloud.puffs[i - 1]!, cloud.puffs[i]!];
                expect(Math.hypot(a.dx - b.dx, a.dy - b.dy), `seed ${seed} puff ${i}`).toBeLessThan(a.r + b.r);
            }
        }
    });
});

describe("bankPuffs", () => {
    it("lines the whole bottom edge with puffs that leave no gap for the page to show through", () => {
        const puffs = bankPuffs(seeded(12), 2000, 100);
        const sorted = [...puffs].sort((a, b) => a.dx - b.dx);

        expect(sorted[0]!.dx - sorted[0]!.r).toBeLessThanOrEqual(0);
        expect(sorted.at(-1)!.dx + sorted.at(-1)!.r).toBeGreaterThanOrEqual(2000);
        for (let i = 1; i < sorted.length; i++) {
            const [a, b] = [sorted[i - 1]!, sorted[i]!];
            expect(b.dx - b.r, `puff ${i}`).toBeLessThan(a.dx + a.r);
        }
        for (const p of puffs) {
            expect(p.dy - p.r).toBeGreaterThanOrEqual(0);
            expect(p.dy).toBeLessThanOrEqual(100);
        }
    });
});

describe("createSky", () => {
    it("lays out the same sky for the same seed", () => {
        expect(createSky(W, H, seeded(1))).toEqual(createSky(W, H, seeded(1)));
    });

    it("keeps a handful of clouds in the top of the panel, clear of the page below", () => {
        const sky = createSky(W, H, seeded(2));

        expect(sky.clouds.length).toBeGreaterThanOrEqual(4);
        expect(sky.clouds.length).toBeLessThanOrEqual(7);
        for (const c of sky.clouds) expect(c.y).toBeGreaterThanOrEqual(0);
        for (const bottom of top(sky)) expect(bottom).toBeLessThanOrEqual(H * CLOUD_BAND);
    });

    it("starts with no hearts, so none pop in fully grown", () => {
        expect(createSky(W, H, seeded(3)).hearts).toEqual([]);
    });
});

describe("stepSky", () => {
    it("drifts every cloud slowly to the right, the small far ones slower than the big near ones", () => {
        const sky = createSky(W, H, seeded(4));
        const before = sky.clouds.map((c) => c.x);
        stepSky(sky, 1, W, H, seeded(1));

        sky.clouds.forEach((c, i) => {
            const moved = c.x - before[i]!;
            expect(moved).toBeGreaterThan(2);
            expect(moved).toBeLessThan(20);
        });
        const byScale = [...sky.clouds].sort((a, b) => a.scale - b.scale);
        expect(byScale[0]!.speed).toBeLessThan(byScale.at(-1)!.speed);
    });

    it("brings a cloud that drifts off the right edge back in from the left, still up in the sky", () => {
        const sky = createSky(W, H, seeded(5));
        const cloud = sky.clouds[0]!;
        cloud.x = W + 1;
        stepSky(sky, STEP, W, H, seeded(2));

        expect(cloud.x + cloud.width * cloud.scale).toBeLessThanOrEqual(0);
        expect(cloud.y + cloud.height * cloud.scale).toBeLessThanOrEqual(H * CLOUD_BAND);
    });

    it("floats hearts up now and then, never more than a few at once", () => {
        const sky = createSky(W, H, seeded(6));
        let most = 0;
        let seen = 0;
        const random = seeded(7);
        for (let t = 0; t < 120; t += STEP) {
            stepSky(sky, STEP, W, H, random);
            most = Math.max(most, sky.hearts.length);
            seen = Math.max(seen, sky.hearts.length ? 1 : 0);
        }

        expect(seen).toBe(1);
        expect(most).toBeLessThanOrEqual(MAX_HEARTS);
    });

    it("lifts each heart upward and lets it go once it has faded", () => {
        const sky = createSky(W, H, seeded(8));
        const heart: Heart = {
            x: 100,
            y: 600,
            size: 12,
            age: 0,
            life: 6,
            sway: 10,
            phase: 0,
            rise: 20,
            kind: "heart",
            tint: 0,
        };
        sky.hearts.push(heart);
        sky.nextHeart = 1000;
        stepSky(sky, 1, W, H, seeded(1));

        expect(heart.y).toBeLessThan(600);
        run(sky, 6);
        expect(sky.hearts).not.toContain(heart);
    });

    it("changes nothing on a zero step, as the loop hands after a sleep", () => {
        const sky = createSky(W, H, seeded(9));
        run(sky, 10);
        const before = structuredClone(sky);
        stepSky(sky, 0, W, H, seeded(3));

        expect(sky).toEqual(before);
    });
});

describe("heartAlpha", () => {
    it("fades a heart in, holds it, then fades it out", () => {
        const at = (age: number): Heart => ({
            x: 0,
            y: 0,
            size: 10,
            age,
            life: 10,
            sway: 0,
            phase: 0,
            rise: 10,
            kind: "heart",
            tint: 0,
        });

        expect(heartAlpha(at(0))).toBe(0);
        expect(heartAlpha(at(5))).toBe(1);
        expect(heartAlpha(at(10))).toBe(0);
        expect(heartAlpha(at(1))).toBeGreaterThan(0);
        expect(heartAlpha(at(1))).toBeLessThan(1);
    });
});

describe("edgeX", () => {
    it("starts most hearts in the margins either side of the page, where they are seen", () => {
        const random = seeded(10);
        const xs = Array.from({ length: 400 }, () => edgeX(random, W));
        const margins = xs.filter((x) => x < W * 0.2 || x > W * 0.8).length;

        expect(margins / xs.length).toBeGreaterThan(0.6);
        for (const x of xs) {
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThanOrEqual(W);
        }
    });
});

describe("fitSky", () => {
    it("keeps clouds and hearts where they were, in proportion, when the panel resizes", () => {
        const sky = createSky(W, H, seeded(11));
        run(sky, 30);
        const cloud = { ...sky.clouds[0]! };
        fitSky(sky, W, H, W * 2, H / 2);

        expect(sky.clouds[0]!.x).toBeCloseTo(cloud.x * 2);
        expect(sky.clouds[0]!.y).toBeCloseTo(cloud.y / 2);
    });
});
