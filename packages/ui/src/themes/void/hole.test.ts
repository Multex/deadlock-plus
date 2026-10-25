import { describe, expect, it } from "vitest";

import { seeded } from "../../theme-decor-random";
import { HORIZON, OUTER, createSwarm, diskTurn, glowAt, project, stepSwarm } from "./hole";

const STEP = 1 / 20;
const run = (swarm: ReturnType<typeof createSwarm>, seconds: number, seed = 1) => {
    const random = seeded(seed);
    for (let t = 0; t < seconds; t += STEP) stepSwarm(swarm, STEP, random);
};

describe("createSwarm", () => {
    it("scatters the same particles for the same seed, all outside the horizon", () => {
        const swarm = createSwarm(seeded(1));

        expect(swarm).toEqual(createSwarm(seeded(1)));
        expect(swarm.length).toBeGreaterThan(20);
        for (const p of swarm) {
            expect(p.r).toBeGreaterThan(HORIZON);
            expect(p.r).toBeLessThanOrEqual(OUTER);
        }
    });
});

describe("stepSwarm", () => {
    it("whirls the inner particles round faster than the outer ones", () => {
        const swarm = [
            { r: 1.5, angle: 0 },
            { r: 4, angle: 0 },
        ];
        stepSwarm(swarm, 1, seeded(2));

        expect(swarm[0]!.angle).toBeGreaterThan(swarm[1]!.angle * 2);
    });

    it("draws particles slowly inward", () => {
        const swarm = [{ r: 4, angle: 0 }];
        run(swarm, 5);

        expect(swarm[0]!.r).toBeLessThan(4);
        expect(swarm[0]!.r).toBeGreaterThan(3);
    });

    it("sends a particle that falls through the horizon back out to the rim", () => {
        const swarm = [{ r: HORIZON + 0.001, angle: 0 }];
        run(swarm, 1);

        expect(swarm[0]!.r).toBeGreaterThan(OUTER * 0.8);
    });

    it("keeps every particle between the horizon and the rim over a long run", () => {
        const swarm = createSwarm(seeded(3));
        run(swarm, 120);

        for (const p of swarm) {
            expect(p.r).toBeGreaterThan(HORIZON);
            expect(p.r).toBeLessThanOrEqual(OUTER);
        }
    });

    it("turns slowly enough at the horizon that twenty frames a second look smooth", () => {
        const swarm = [{ r: HORIZON + 0.05, angle: 0 }];
        stepSwarm(swarm, STEP, seeded(4));

        // In shadow radii: under 0.04 is under 2 px for a 54 px shadow.
        expect(swarm[0]!.angle * swarm[0]!.r).toBeLessThan(0.04);
    });
});

describe("project", () => {
    it("squashes the disk by its tilt", () => {
        expect(project(2, Math.PI / 2, 0.25).y).toBeCloseTo(0.5);
        expect(project(2, 0, 0.25)).toMatchObject({ x: 2 });
    });

    it("puts the near half of the disk in front of the shadow, the far half behind", () => {
        expect(project(2, Math.PI / 2, 0.25).front).toBe(true);
        expect(project(2, -Math.PI / 2, 0.25).front).toBe(false);
    });
});

describe("glowAt", () => {
    it("fades out at the horizon and at the rim, brightest in between", () => {
        expect(glowAt(HORIZON)).toBe(0);
        expect(glowAt(OUTER)).toBe(0);
        expect(glowAt(2)).toBeGreaterThan(glowAt(4));
        expect(glowAt(2)).toBeGreaterThan(0.5);
    });
});

describe("diskTurn", () => {
    it("turns by the wall clock, so a rebuilt panel carries on where it was", () => {
        expect(diskTurn(123_456)).toBe(diskTurn(123_456));
        expect(diskTurn(123_456 + 1_000)).toBeGreaterThan(diskTurn(123_456));
    });

    it("turns slowly: under a pixel a frame at the disk's inner edge", () => {
        expect((diskTurn(50_000) - diskTurn(50_000 - 50)) * 1.6 * 54).toBeLessThan(1);
    });
});
