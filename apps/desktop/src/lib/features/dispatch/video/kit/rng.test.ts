import { describe, expect, it } from "vitest";
import { seeded } from "./rng";

const take = (next: () => number, n: number) => Array.from({ length: n }, () => next());

describe("seeded", () => {
    it("gives the same stream for the same seed", () => {
        expect(take(seeded(1172), 50)).toEqual(take(seeded(1172), 50));
    });

    it("gives a different stream for a different seed", () => {
        expect(take(seeded(1), 10)).not.toEqual(take(seeded(2), 10));
    });

    it("stays in [0, 1) and spreads across it", () => {
        const xs = take(seeded(20261105), 2000);
        for (const x of xs) {
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThan(1);
        }
        const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
        expect(mean).toBeGreaterThan(0.45);
        expect(mean).toBeLessThan(0.55);
    });

    it("treats a seed as an unsigned 32-bit integer", () => {
        expect(take(seeded(-1), 5)).toEqual(take(seeded(0xffffffff), 5));
    });
});
