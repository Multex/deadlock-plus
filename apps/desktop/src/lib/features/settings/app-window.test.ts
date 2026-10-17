import { describe, expect, it } from "vitest";
import { DEFAULT_UI_SCALE, UI_SCALE_RANGE, resolveHardwareAcceleration, resolveUiScale } from "./app-window";

describe("app window settings", () => {
    it("offers 80 to 150 percent in steps of ten", () => {
        expect(UI_SCALE_RANGE).toEqual({ min: 80, max: 150, step: 10 });
        expect(DEFAULT_UI_SCALE).toBe(100);
    });

    it("uses 100 percent when nothing usable is stored", () => {
        expect(resolveUiScale(undefined)).toBe(100);
        expect(resolveUiScale(null)).toBe(100);
        expect(resolveUiScale("big")).toBe(100);
        expect(resolveUiScale(Number.NaN)).toBe(100);
    });

    it("keeps a stored scale inside the range and on the step grid", () => {
        expect(resolveUiScale(120)).toBe(120);
        expect(resolveUiScale(40)).toBe(80);
        expect(resolveUiScale(400)).toBe(150);
        expect(resolveUiScale(114)).toBe(110);
    });

    it("leaves hardware acceleration on unless it was turned off", () => {
        expect(resolveHardwareAcceleration(undefined)).toBe(true);
        expect(resolveHardwareAcceleration("off")).toBe(true);
        expect(resolveHardwareAcceleration(true)).toBe(true);
        expect(resolveHardwareAcceleration(false)).toBe(false);
    });
});
