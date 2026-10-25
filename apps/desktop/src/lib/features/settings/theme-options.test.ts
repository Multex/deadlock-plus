import { describe, expect, it } from "vitest";
import { accentOf, accentStyle, layersOf, resolveThemeOptions, withAccent, withLayer } from "./theme-options";

describe("resolveThemeOptions", () => {
    it("starts with every layer on and no accent of your own", () => {
        const options = resolveThemeOptions(undefined);

        expect(layersOf(options, "nightshift")).toEqual({ rain: true, lights: true, frames: true, clock: true });
        expect(accentOf(options, "nightshift")).toBeNull();
    });

    it("keeps what was saved", () => {
        const saved = { nightshift: { off: ["rain"], accent: { hue: 300, chroma: 0.15 } } };
        const options = resolveThemeOptions(saved);

        expect(layersOf(options, "nightshift").rain).toBe(false);
        expect(accentOf(options, "nightshift")).toEqual({ hue: 300, chroma: 0.15 });
    });

    it("drops themes, layers and accents it does not know, so a stale save cannot break the page", () => {
        const options = resolveThemeOptions({
            neon: { off: ["glow"] },
            nightshift: { off: ["rain", "thunder", 3], accent: { hue: "red" } },
            midnight: "nonsense",
        });

        expect(options).toEqual({ nightshift: { off: ["rain"] } });
    });

    it("ignores an accent on a theme that does not take one", () => {
        expect(resolveThemeOptions({ contrast: { accent: { hue: 10, chroma: 0.1 } } })).toEqual({});
    });

    it("wraps a hue into a turn and caps how vivid an accent can be", () => {
        const options = resolveThemeOptions({ void: { accent: { hue: 400, chroma: 9 } } });

        expect(accentOf(options, "void")).toEqual({ hue: 40, chroma: 0.37 });
    });
});

describe("withLayer", () => {
    it("turns one layer off and back on, leaving the rest", () => {
        const off = withLayer({}, "flint-snow", "tail", false);
        expect(layersOf(off, "flint-snow")).toEqual({ snow: true, stars: true, tail: false, tracks: true });

        expect(withLayer(off, "flint-snow", "tail", true)).toEqual({});
    });
});

describe("withAccent", () => {
    it("sets an accent and clears it again", () => {
        const set = withAccent({}, "void", { hue: 200, chroma: 0.1 });
        expect(accentOf(set, "void")).toEqual({ hue: 200, chroma: 0.1 });

        expect(withAccent(set, "void", null)).toEqual({});
    });
});

describe("accentStyle", () => {
    it("overrides the trim, ring and borders with the accent, as CSS variables", () => {
        const style = accentStyle("void", { hue: 200, chroma: 0.1 });

        expect(Object.keys(style).sort()).toEqual(["--border", "--brass", "--input", "--ring"]);
        expect(style["--brass"]).toMatch(/^oklch\(/);
    });

    it("overrides nothing without an accent, or on a theme that does not take one", () => {
        expect(accentStyle("void", null)).toEqual({});
        expect(accentStyle("contrast", { hue: 200, chroma: 0.1 })).toEqual({});
    });
});
