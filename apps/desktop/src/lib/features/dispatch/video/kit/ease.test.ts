import { describe, expect, it } from "vitest";
import { clamp01, easeInOut, easeOutBack, easeOutCubic, lerp } from "./ease";

const EASES = { easeOutCubic, easeInOut, easeOutBack };

describe("eases", () => {
    for (const [name, ease] of Object.entries(EASES)) {
        it(`${name} starts at 0, ends at 1 and holds there outside the range`, () => {
            expect(ease(0)).toBeCloseTo(0, 12);
            expect(ease(1)).toBeCloseTo(1, 12);
            expect(ease(-3)).toBe(ease(0));
            expect(ease(4)).toBe(ease(1));
        });
    }

    it("easeInOut is half way at the middle", () => {
        expect(easeInOut(0.5)).toBeCloseTo(0.5, 12);
    });

    it("easeOutBack overshoots by about 10%, more with a larger overshoot", () => {
        const peak = (c?: number) => Math.max(...Array.from({ length: 999 }, (_, i) => easeOutBack((i + 1) / 1000, c)));
        expect(peak()).toBeGreaterThan(1.09);
        expect(peak()).toBeLessThan(1.11);
        expect(peak(1.9)).toBeGreaterThan(peak());
    });

    it("clamp01 and lerp", () => {
        expect(clamp01(-1)).toBe(0);
        expect(clamp01(2)).toBe(1);
        expect(clamp01(0.3)).toBe(0.3);
        expect(lerp(10, 20, 0)).toBe(10);
        expect(lerp(10, 20, 1)).toBe(20);
        expect(lerp(10, 20, 0.25)).toBe(12.5);
    });
});
