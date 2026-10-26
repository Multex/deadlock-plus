import { describe, expect, it } from "vitest";
import { countUp } from "./count";

describe("countUp", () => {
    it("is zero up to the start and exactly the value from the end on", () => {
        expect(countUp(456, 0, 1, 2)).toBe(0);
        expect(countUp(456, 1, 1, 2)).toBe(0);
        expect(countUp(456, 2, 1, 2)).toBe(456);
        expect(countUp(456, 9, 1, 2)).toBe(456);
    });

    it("climbs in whole numbers and never runs back", () => {
        let last = -1;
        for (let t = 0; t <= 2.5; t += 0.01) {
            const v = countUp(456, t, 1, 2);
            expect(Number.isInteger(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(last);
            last = v;
        }
    });

    it("counts a share in whole percent steps", () => {
        expect(countUp(0.58, 1.5, 1, 2, 100)).toBeGreaterThan(0.3);
        expect((countUp(0.58, 1.5, 1, 2, 100) * 100) % 1).toBeCloseTo(0, 6);
        expect(countUp(0.58, 2, 1, 2, 100)).toBe(0.58);
    });
});
