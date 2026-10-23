import { describe, expect, it } from "vitest";
import { gameColors, type GameColor } from "./colors";
import { panoramaAlpha, panoramaBlend, panoramaColor, scale } from "./panorama";

// Measured in the 1440p captures: the background beside each element, and the element drawn over it.
const MEASURED: [string, number, string, string][] = [
    ["#000000", 0x66, "#5c5783", "#484568"],
    ["#000000", 0x60, "#59517b", "#463e61"],
    ["offBlack", 0x90, "#54476e", "#382f49"],
    ["offBlack", 0xea, "#4c674a", "#1b2419"],
    ["offBlack", 0x70, "#4e694b", "#3a5038"],
    ["#ffffff", 0x05, "#161616", "#2e2e2e"],
    ["offWhite", 0x08, "#121212", "#36332d"],
    ["#ffffff", 0x50, "#1b2419", "#9a9b99"],
    ["offWhite", 0x90, "#3a5038", "#c9bfab"],
];

describe("panoramaBlend", () => {
    it.each(MEASURED)("draws %s at alpha %i over %s as the game does (%s)", (color, alpha, under, game) => {
        expect(distance(panoramaBlend(color, alpha / 255, under), game)).toBeLessThanOrEqual(2);
    });

    it("keeps the ends", () => {
        expect(panoramaBlend("#ff0000", 0, "#123456")).toBe("#123456");
        expect(panoramaBlend("#ff0000", 1, "#123456")).toBe("#ff0000");
    });
});

describe("panoramaAlpha", () => {
    it.each(MEASURED)("lets the browser blend %s at alpha %i over %s like the game", (color, alpha, under, game) => {
        const a = panoramaAlpha(alpha / 255, color, under);
        expect(distance(browserBlend(color, a, under), game)).toBeLessThanOrEqual(4);
    });

    it("gives a dark overlay one alpha over any background", () => {
        const a = panoramaAlpha(0x60 / 255, "#000000", "#59517b");
        expect(panoramaAlpha(0x60 / 255, "#000000", "#795218")).toBeCloseTo(a, 1);
        expect(panoramaAlpha(0x60 / 255, "#000000", "#405b44")).toBeCloseTo(a, 1);
        expect(a).toBeLessThan(0x60 / 255);
    });

    it("strengthens a light overlay over dark", () => {
        expect(panoramaAlpha(0x50 / 255, "#ffffff", "#000000")).toBeCloseTo(0x98 / 255, 2);
        expect(panoramaAlpha(0x05 / 255, "#ffffff", "#161616")).toBeGreaterThan(0x05 / 255);
    });

    it("keeps the ends and clamps out-of-range input", () => {
        expect(panoramaAlpha(0, "#ffffff", "#202020")).toBe(0);
        expect(panoramaAlpha(1, "#ffffff", "#202020")).toBeCloseTo(1, 10);
        expect(panoramaAlpha(-0.2, "#ffffff", "#202020")).toBe(0);
        expect(panoramaAlpha(1.5, "#ffffff", "#202020")).toBeCloseTo(1, 10);
    });

    it("passes the alpha through when the colour is the background's", () => {
        expect(panoramaAlpha(0.4, "#202020", "#202020")).toBe(0.4);
    });
});

describe("panoramaColor", () => {
    it("passes an opaque colour through as hex", () => {
        expect(panoramaColor("#FFEFD7")).toBe("#ffefd7");
        expect(panoramaColor("#fff")).toBe("#ffffff");
        expect(panoramaColor("#10130Dff")).toBe("#10130d");
        expect(panoramaColor("shard", "#000000")).toBe("#99ffd6");
    });

    it("reads the `&xx` alpha suffix and the eight-digit form alike", () => {
        const a = round(panoramaAlpha(0x50 / 255, "#ffffff", "#1b2419"));
        expect(panoramaColor("#ffffff&50", "#1b2419")).toBe(`rgb(255 255 255 / ${a})`);
        expect(panoramaColor("#ffffff50", "#1b2419")).toBe(`rgb(255 255 255 / ${a})`);
    });

    it("resolves game colour names, the backdrop's too", () => {
        const a = round(panoramaAlpha(0x90 / 255, "#ffefd7", "#10130d"));
        expect(panoramaColor("offWhite&90", "offBlack")).toBe(`rgb(255 239 215 / ${a})`);
        expect(panoramaColor("shard")).toBe("#99ffd6");
    });

    it("needs the backdrop of a translucent colour", () => {
        expect(() => panoramaColor("#00000060")).toThrow(/backdrop/);
    });

    it("rejects what it cannot read", () => {
        expect(() => panoramaColor("notAColour")).toThrow(/notAColour/);
        expect(() => panoramaColor("#12345")).toThrow();
        expect(() => panoramaColor("#ffffff&5", "#000000")).toThrow();
        expect(() => panoramaColor("#ffffff&50", "#00000080")).toThrow(/opaque/);
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

function rgb(value: string): number[] {
    const hex = value in gameColors ? gameColors[value as GameColor] : value;
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function distance(a: string, b: string): number {
    const [x, y] = [rgb(a), rgb(b)];
    return Math.max(...x.map((v, i) => Math.abs(v - y[i])));
}

function browserBlend(color: string, alpha: number, under: string): string {
    const [c, u] = [rgb(color), rgb(under)];
    return (
        "#" +
        c
            .map((v, i) =>
                Math.round(alpha * v + (1 - alpha) * u[i])
                    .toString(16)
                    .padStart(2, "0"),
            )
            .join("")
    );
}
