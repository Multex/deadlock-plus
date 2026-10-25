import { describe, expect, it } from "vitest";
import { fitScale, rotatedBox } from "./fit";

const PAPER = { width: 720, height: 1080 };

describe("rotatedBox", () => {
    it("is the sheet itself when it lies straight", () => {
        expect(rotatedBox(720, 1080, 0)).toEqual({ w: 720, h: 1080 });
    });

    it("grows by the corners a tilt pushes out, either way", () => {
        const box = rotatedBox(720, 1080, -0.8);
        expect(box.w).toBeCloseTo(720 * Math.cos(0.8 * (Math.PI / 180)) + 1080 * Math.sin(0.8 * (Math.PI / 180)), 6);
        expect(box.h).toBeCloseTo(720 * Math.sin(0.8 * (Math.PI / 180)) + 1080 * Math.cos(0.8 * (Math.PI / 180)), 6);
        expect(rotatedBox(720, 1080, 0.8)).toEqual(box);
    });
});

describe("fitScale", () => {
    it("is bound by the height in a wide stage", () => {
        expect(fitScale(1200, 560, PAPER, 0, 10)).toBeCloseTo(540 / 1080, 6);
    });

    it("is bound by the width in a narrow stage", () => {
        expect(fitScale(380, 2000, PAPER, 0, 10)).toBeCloseTo(360 / 720, 6);
    });

    it("leaves room for the tilt so no corner leaves the stage", () => {
        const scale = fitScale(2000, 600, PAPER, -0.8, 0);
        expect(rotatedBox(720, 1080, -0.8).h * scale).toBeCloseTo(600, 6);
    });

    it("stops at the cap on a huge stage", () => {
        expect(fitScale(5000, 5000, PAPER, 0, 0, 1.35)).toBe(1.35);
    });

    it("is 0 until the stage is measured", () => {
        expect(fitScale(0, 0, PAPER, 0, 10)).toBe(0);
    });
});
