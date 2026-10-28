import { describe, expect, it } from "vitest";

import { burst, stirsDecor } from "./theme-decor-loop";

describe("stirsDecor", () => {
    it("lets a mouse or pen stir the decor", () => {
        expect(stirsDecor({ pointerType: "mouse" })).toBe(true);
        expect(stirsDecor({ pointerType: "pen" })).toBe(true);
    });

    it("never lets a finger stir it, so scrolling a phone leaves the scene alone", () => {
        expect(stirsDecor({ pointerType: "touch" })).toBe(false);
    });
});

describe("burst", () => {
    it("is active for its length at the start of every period, by the wall clock", () => {
        expect(burst(10_000 * 7 + 1_000, 10_000, 3_000)).toMatchObject({ active: true });
        expect(burst(10_000 * 7 + 5_000, 10_000, 3_000)).toMatchObject({ active: false });
    });

    it("reports how far through the burst it is", () => {
        expect(burst(10_000 * 3 + 1_500, 10_000, 3_000).progress).toBeCloseTo(0.5);
    });

    it("says how long until it starts or stops, so a scene can sleep until then", () => {
        expect(burst(10_000 * 2 + 1_000, 10_000, 3_000).untilChange).toBe(2_000);
        expect(burst(10_000 * 2 + 4_000, 10_000, 3_000).untilChange).toBe(6_000);
    });

    it("shifts by an offset, so several bursts on one period do not line up", () => {
        expect(burst(10_000 * 2 + 4_500, 10_000, 1_000, 4_000)).toMatchObject({ active: true });
        expect(burst(10_000 * 2 + 500, 10_000, 1_000, 4_000)).toMatchObject({ active: false });
    });
});
