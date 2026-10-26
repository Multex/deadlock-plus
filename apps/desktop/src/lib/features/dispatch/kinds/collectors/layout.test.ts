import { describe, expect, it } from "vitest";
import { COVER, SLEEVE, SPREAD, fitBox, insideMode, spotHeight, tearScale } from "./layout";

describe("fitBox", () => {
    it("fits the box in the stage, minus the shadow pad and the control row", () => {
        expect(fitBox({ width: 595, height: 860 }, COVER)).toBeCloseTo((860 - 44 - 52) / 1080, 4);
        expect(fitBox({ width: 400, height: 2000 }, COVER)).toBeCloseTo((400 - 44) / 720, 4);
    });

    it("is 0 until the stage is measured and capped on a big screen", () => {
        expect(fitBox({ width: 0, height: 900 }, COVER)).toBe(0);
        expect(fitBox({ width: 4000, height: 4000 }, COVER)).toBe(1.35);
    });

    it("leaves room for the tear tab beside the bag", () => {
        expect(fitBox({ width: 600, height: 4000 }, SLEEVE)).toBeCloseTo((600 - 44) / (780 + 28), 4);
    });
});

describe("insideMode", () => {
    it("lays both inside pages open when the spread stays readable", () => {
        expect(insideMode({ width: 1348, height: 1400 })).toBe("spread");
    });

    it("turns one page at a time in a narrow stage", () => {
        expect(insideMode({ width: 716, height: 1040 })).toBe("pages");
        expect(insideMode({ width: 473, height: 680 })).toBe("pages");
    });

    it("measures the spread against the same pad", () => {
        expect(fitBox({ width: 1348, height: 1400 }, SPREAD)).toBeCloseTo((1348 - 44) / 1440, 4);
    });
});

describe("spotHeight", () => {
    it("hugs the scaled object so the buttons sit right under it", () => {
        const stage = { width: 1348, height: 1400 };
        expect(spotHeight(stage, SPREAD)).toBeCloseTo(1080 * fitBox(stage, SPREAD) + 44, 4);
    });

    it("keeps one height for the bag and the cover so the buttons do not jump when the tear ends", () => {
        const stage = { width: 595, height: 860 };
        expect(spotHeight(stage, null)).toBeCloseTo(
            Math.max(1180 * fitBox(stage, SLEEVE), 1080 * fitBox(stage, COVER)) + 44,
            4,
        );
    });

    it("never takes the button row's room", () => {
        expect(spotHeight({ width: 4000, height: 900 }, null)).toBeLessThanOrEqual(900 - 52);
    });
});

describe("tearScale", () => {
    const stage = { width: 595, height: 860 };

    it("starts at the bag's fit and ends at the cover's", () => {
        expect(tearScale(stage, 0)).toBeCloseTo(fitBox(stage, SLEEVE), 6);
        expect(tearScale(stage, 1)).toBeCloseTo(fitBox(stage, COVER), 6);
        expect(fitBox(stage, COVER)).toBeGreaterThan(fitBox(stage, SLEEVE));
    });
});
