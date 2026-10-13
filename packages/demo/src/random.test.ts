import { describe, expect, it } from "vitest";
import { seeded } from "./random";

describe("seeded", () => {
    it("repeats the same numbers for the same seed", () => {
        const a = seeded(42);
        const b = seeded(42);
        expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    });

    it("gives different numbers for another seed", () => {
        expect(seeded(1)()).not.toBe(seeded(2)());
    });

    it("stays in [0, 1)", () => {
        const next = seeded(7);
        for (let i = 0; i < 1000; i++) {
            const value = next();
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
    });
});
