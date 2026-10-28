import { describe, expect, it } from "vitest";
import { shake } from "./motion";

describe("shake", () => {
    it("is still before the hit and after it settles", () => {
        expect(shake(-0.01, 10, 3)).toEqual([0, 0]);
        expect(shake(0.61, 10, 3)).toEqual([0, 0]);
    });

    it("wobbles the same way for the same seed and dies down", () => {
        expect(shake(0.05, 10, 3)).toEqual(shake(0.05, 10, 3));
        const size = (dt: number) => Math.hypot(...shake(dt, 10, 3));
        expect(size(0.5)).toBeLessThan(size(0.01));
    });
});
