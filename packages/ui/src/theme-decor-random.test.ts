import { describe, expect, it } from "vitest";

import { between, seeded } from "./theme-decor-random";

describe("seeded", () => {
    it("repeats the same sequence for the same seed", () => {
        const a = seeded(7);
        const b = seeded(7);

        expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    });

    it("stays in [0, 1) and differs between seeds", () => {
        const values = Array.from({ length: 500 }, seeded(1));

        expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
        expect(seeded(1)()).not.toBe(seeded(2)());
    });
});

describe("between", () => {
    it("scales into the range", () => {
        expect(between(() => 0, 2, 6)).toBe(2);
        expect(between(() => 0.5, 2, 6)).toBe(4);
    });
});
