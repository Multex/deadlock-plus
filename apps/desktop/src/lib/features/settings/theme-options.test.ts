import { describe, expect, it } from "vitest";
import {
    accentOf,
    accentStyle,
    initialThemeOptions,
    layersOf,
    namedAccentOf,
    namedAccentStyle,
    resolveThemeOptions,
    variantOf,
    withAccent,
    withLayer,
    withNamedAccent,
    withVariant,
} from "./theme-options";

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

describe("Catppuccin's flavour and accent", () => {
    it("start as Mocha and Mauve, Catppuccin's own defaults", () => {
        const options = resolveThemeOptions(undefined);

        expect(variantOf(options, "catppuccin")).toBe("mocha");
        expect(namedAccentOf(options, "catppuccin")).toBe("mauve");
    });

    it("are none for a theme without flavours or named accents", () => {
        expect(variantOf({}, "void")).toBeUndefined();
        expect(namedAccentOf({}, "void")).toBeUndefined();
    });

    it("are kept as picked, and only while they differ from the defaults", () => {
        const picked = withNamedAccent(withVariant({}, "catppuccin", "latte"), "catppuccin", "peach");
        expect(picked).toEqual({ catppuccin: { variant: "latte", namedAccent: "peach" } });
        expect(resolveThemeOptions(picked)).toEqual(picked);

        const back = withNamedAccent(withVariant(picked, "catppuccin", "mocha"), "catppuccin", "mauve");
        expect(back).toEqual({});
    });

    it("drop a flavour or accent the theme does not have", () => {
        expect(resolveThemeOptions({ catppuccin: { variant: "espresso", namedAccent: "beige" } })).toEqual({});
        expect(resolveThemeOptions({ void: { variant: "latte", namedAccent: "peach" } })).toEqual({});
        expect(withVariant({}, "void", "latte")).toEqual({});
        expect(withNamedAccent({}, "catppuccin", "beige")).toEqual({});
    });

    it("override the trim and ring for an accent other than the flavour's default", () => {
        const picked = withNamedAccent({}, "catppuccin", "peach");

        expect(Object.keys(namedAccentStyle(picked, "catppuccin")).sort()).toEqual(["--brass", "--ring"]);
        expect(namedAccentStyle({}, "catppuccin")).toEqual({});
        expect(namedAccentStyle(picked, "void")).toEqual({});
    });
});

describe("initialThemeOptions", () => {
    it("starts from the flavour the window set before the page loaded, so a light flavour never flashes dark", () => {
        const root = { dataset: { theme: "catppuccin", themeVariant: "latte" } };

        expect(variantOf(initialThemeOptions(root), "catppuccin")).toBe("latte");
    });

    it("starts empty without a root, a theme with flavours, or a known flavour", () => {
        expect(initialThemeOptions(undefined)).toEqual({});
        expect(initialThemeOptions({ dataset: { theme: "void", themeVariant: "latte" } })).toEqual({});
        expect(initialThemeOptions({ dataset: { theme: "catppuccin", themeVariant: "espresso" } })).toEqual({});
    });
});
