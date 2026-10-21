import { describe, expect, it } from "vitest";
import { panoramaAlpha, panoramaColor, scale } from "./panorama";

describe("panoramaAlpha", () => {
    it("sRGB-encodes the alpha, as Panorama blends in linear light", () => {
        expect(panoramaAlpha(0.5)).toBeCloseTo(0.735, 3);
        expect(panoramaAlpha(0.31)).toBeCloseTo(0.593, 3);
        expect(panoramaAlpha(0.56)).toBeCloseTo(0.774, 3);
    });

    it("keeps the ends and the linear segment near zero", () => {
        expect(panoramaAlpha(0)).toBe(0);
        expect(panoramaAlpha(1)).toBeCloseTo(1, 10);
        expect(panoramaAlpha(0.002)).toBeCloseTo(0.002 * 12.92, 10);
    });

    it("clamps out-of-range input", () => {
        expect(panoramaAlpha(-0.2)).toBe(0);
        expect(panoramaAlpha(1.5)).toBeCloseTo(1, 10);
    });

    it("matches the measured blend of #ffffff50 on black (#989898)", () => {
        expect(Math.round(panoramaAlpha(0x50 / 255) * 255)).toBe(0x98);
    });
});

describe("panoramaColor", () => {
    it("passes an opaque colour through as hex", () => {
        expect(panoramaColor("#FFEFD7")).toBe("#ffefd7");
        expect(panoramaColor("#fff")).toBe("#ffffff");
        expect(panoramaColor("#10130Dff")).toBe("#10130d");
    });

    it("reads the `&xx` alpha suffix and the eight-digit form alike", () => {
        expect(panoramaColor("#ffffff&50")).toBe("rgb(255 255 255 / 0.596)");
        expect(panoramaColor("#ffffff50")).toBe("rgb(255 255 255 / 0.596)");
        expect(panoramaColor("#000000&80")).toBe(`rgb(0 0 0 / ${round(panoramaAlpha(0x80 / 255))})`);
    });

    it("resolves a game colour name", () => {
        expect(panoramaColor("offWhite&90")).toBe(`rgb(255 239 215 / ${round(panoramaAlpha(0x90 / 255))})`);
        expect(panoramaColor("shard")).toBe("#99ffd6");
    });

    it("rejects what it cannot read", () => {
        expect(() => panoramaColor("notAColour")).toThrow(/notAColour/);
        expect(() => panoramaColor("#12345")).toThrow();
        expect(() => panoramaColor("#ffffff&5")).toThrow();
    });
});

describe("scale", () => {
    it("maps Panorama px to CSS px at the given UI scale", () => {
        expect(scale(450)).toBe(450);
        expect(scale(450, 0.75)).toBe(337.5);
        expect(scale(18, 4 / 3)).toBeCloseTo(24, 10);
    });
});

function round(n: number): number {
    return Math.round(n * 1000) / 1000;
}
