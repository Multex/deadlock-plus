import { describe, expect, it } from "vitest";
import { fitFontSize } from "./fit";

describe("fitFontSize", () => {
    it("keeps the largest size when the text already fits", () => {
        expect(fitFontSize({ max: 64, min: 32, fits: () => true })).toBe(64);
    });

    it("shrinks to the largest whole size that fits", () => {
        expect(fitFontSize({ max: 64, min: 32, fits: (size) => size <= 47 })).toBe(47);
    });

    it("stops at the smallest size when nothing fits, leaving the clamp to cut the rest", () => {
        expect(fitFontSize({ max: 64, min: 32, fits: () => false })).toBe(32);
    });
});
