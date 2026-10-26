import { describe, expect, it } from "vitest";
import { featureArt, tallyMarks } from "./feature";
import { typedLength } from "./interview";
import { keepLens } from "./takes";
import { railWidths } from "./wardrobe";

describe("railWidths", () => {
    it("fills the rail exactly, gaps included", () => {
        const w = railWidths([0.5, 0.3, 0.1, 0.1], 1000, 80, 20);
        expect(w.reduce((a, b) => a + b, 0) + 3 * 20).toBeCloseTo(1000, 6);
    });
    it("gives a bigger share a wider swatch and never goes under the minimum", () => {
        const w = railWidths([0.6, 0.2, 0.05, 0.01], 1000, 120, 10);
        expect(w[0]).toBeGreaterThan(w[1]!);
        expect(w[1]).toBeGreaterThan(w[2]!);
        for (const x of w) expect(x).toBeGreaterThanOrEqual(120 - 1e-9);
    });
    it("shares the rail evenly when every share is zero", () => {
        expect(railWidths([0, 0], 500, 50, 20)).toEqual([240, 240]);
    });
    it("shrinks the minimum when the rail is too short for it", () => {
        const w = railWidths([0.5, 0.5, 0.5], 300, 200, 0);
        expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(300, 6);
    });
});

describe("typedLength", () => {
    it("types nothing before the cue and everything once the time is up", () => {
        expect(typedLength("Busiest day?", 0.9, 1, 30)).toBe(0);
        expect(typedLength("Busiest day?", 1 + 6 / 30, 1, 30)).toBe(6);
        expect(typedLength("Busiest day?", 5, 1, 30)).toBe(12);
    });
});

describe("keepLens", () => {
    const bounds = { x: 100, y: 400, w: 800, h: 1000 };
    it("keeps the whole lens inside the area it may cover", () => {
        expect(keepLens(50, 300, 120, bounds)).toEqual({ x: 220, y: 520 });
        expect(keepLens(980, 1500, 120, bounds)).toEqual({ x: 780, y: 1280 });
    });
    it("leaves a lens that already fits where it is", () => {
        expect(keepLens(500, 800, 120, bounds)).toEqual({ x: 500, y: 800 });
    });
});

describe("tallyMarks", () => {
    const stat = (value: number) => ({ value, source: "test" });
    it("circles every win of a streak", () => {
        expect(tallyMarks({ angle: "streak", stats: [stat(8)] })).toEqual(Array(8).fill("w"));
    });
    it("crosses out the losses before the comeback's wins", () => {
        expect(tallyMarks({ angle: "losing_then_winning", stats: [stat(3), stat(5), stat(6)] })).toEqual([
            "l",
            "l",
            "l",
            "w",
            "w",
            "w",
            "w",
            "w",
        ]);
    });
    it("never deals more frames than the table holds", () => {
        expect(tallyMarks({ angle: "winning", stats: [stat(40)] })).toHaveLength(16);
    });
});

describe("featureArt", () => {
    it("pictures each angle its own way", () => {
        expect(featureArt("climb")).toBe("makeover");
        expect(featureArt("streak")).toBe("tally");
        expect(featureArt("nemesis")).toBe("pair");
        expect(featureArt("one_trick")).toBe("popart");
    });
});
