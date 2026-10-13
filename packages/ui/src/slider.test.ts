import { describe, expect, it } from "vitest";
import { MAX_AUTO_TICKS, pageValue, snapValue, tickValues, valuePercent } from "./slider";

describe("snapValue", () => {
    const range = { min: 0, max: 100, step: 5 };

    it("keeps a value that is already on the grid", () => {
        expect(snapValue(35, range)).toBe(35);
    });

    it("moves an off-grid value to the nearest step", () => {
        expect(snapValue(37, range)).toBe(35);
        expect(snapValue(38, range)).toBe(40);
    });

    it("takes the lower step on a tie", () => {
        expect(snapValue(2.5, range)).toBe(0);
    });

    it("clamps to the range", () => {
        expect(snapValue(-20, range)).toBe(0);
        expect(snapValue(250, range)).toBe(100);
    });

    it("counts steps from min, not from zero", () => {
        expect(snapValue(6, { min: 1, max: 10, step: 3 })).toBe(7);
    });

    it("stops at the last step when max is off the grid", () => {
        expect(snapValue(10.4, { min: 0, max: 10.5, step: 1 })).toBe(10);
        expect(snapValue(99, { min: 0, max: 10.5, step: 1 })).toBe(10);
    });

    it("does not leak float noise from a fractional step", () => {
        expect(snapValue(0.31, { min: 0, max: 1, step: 0.1 })).toBe(0.3);
        expect(snapValue(0.7, { min: 0, max: 1, step: 0.1 })).toBe(0.7);
    });

    it("returns min for an empty range or a value that is not a number", () => {
        expect(snapValue(4, { min: 3, max: 3, step: 1 })).toBe(3);
        expect(snapValue(Number.NaN, range)).toBe(0);
    });

    it("only clamps when the step is not positive", () => {
        expect(snapValue(37.2, { min: 0, max: 100, step: 0 })).toBe(37.2);
    });
});

describe("valuePercent", () => {
    it("maps the range onto 0 to 100", () => {
        expect(valuePercent(0, 0, 200)).toBe(0);
        expect(valuePercent(50, 0, 200)).toBe(25);
        expect(valuePercent(200, 0, 200)).toBe(100);
    });

    it("honours a non-zero min", () => {
        expect(valuePercent(15, 10, 20)).toBe(50);
    });

    it("clamps values outside the range", () => {
        expect(valuePercent(-5, 0, 10)).toBe(0);
        expect(valuePercent(50, 0, 10)).toBe(100);
    });

    it("is 0 for an empty range", () => {
        expect(valuePercent(5, 5, 5)).toBe(0);
    });
});

describe("tickValues", () => {
    it("has no ticks unless asked", () => {
        expect(tickValues(undefined, { min: 0, max: 4, step: 1 })).toEqual([]);
        expect(tickValues(false, { min: 0, max: 4, step: 1 })).toEqual([]);
    });

    it("marks every step when asked and the count is small", () => {
        expect(tickValues(true, { min: 0, max: 4, step: 1 })).toEqual([0, 1, 2, 3, 4]);
        expect(tickValues(true, { min: 0.5, max: 2, step: 0.5 })).toEqual([0.5, 1, 1.5, 2]);
    });

    it("draws nothing rather than a comb when there are too many steps", () => {
        expect(tickValues(true, { min: 0, max: MAX_AUTO_TICKS - 1, step: 1 })).toHaveLength(MAX_AUTO_TICKS);
        expect(tickValues(true, { min: 0, max: MAX_AUTO_TICKS, step: 1 })).toEqual([]);
    });

    it("sorts given values, drops duplicates and anything outside the range", () => {
        expect(tickValues([30, 10, 10, -5, 120, 60, Number.NaN], { min: 0, max: 100, step: 1 })).toEqual([10, 30, 60]);
    });

    it("keeps given values that are off the step grid", () => {
        expect(tickValues([2.5], { min: 0, max: 10, step: 1 })).toEqual([2.5]);
    });
});

describe("pageValue", () => {
    const range = { min: 0, max: 100, step: 1 };

    it("moves a tenth of the range per page key", () => {
        expect(pageValue("PageUp", 40, range)).toBe(50);
        expect(pageValue("PageDown", 40, range)).toBe(30);
    });

    it("stops at the ends", () => {
        expect(pageValue("PageUp", 95, range)).toBe(100);
        expect(pageValue("PageDown", 4, range)).toBe(0);
    });

    it("moves at least one step on a short range", () => {
        expect(pageValue("PageUp", 1, { min: 0, max: 4, step: 1 })).toBe(2);
    });

    it("lands on the step grid", () => {
        expect(pageValue("PageUp", 0, { min: 0, max: 2, step: 0.25 })).toBe(0.25);
        expect(pageValue("PageUp", 0, { min: 0, max: 90, step: 5 })).toBe(10);
    });

    it("ignores every other key", () => {
        expect(pageValue("ArrowRight", 40, range)).toBeNull();
    });
});
