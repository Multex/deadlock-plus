import { describe, expect, it } from "vitest";

import data from "./themes.json";
import {
    DEFAULT_THEME,
    THEMES,
    chromeHex,
    isLightTheme,
    oklchToHex,
    resolveTheme,
    resolveVariant,
    themeSwatch,
    themeVariant,
} from "./themes";

const theme = (id: string) => {
    const found = THEMES.find((t) => t.id === id);
    if (!found) throw new Error(`no theme ${id}`);
    return found;
};

describe("THEMES", () => {
    it("lists every theme in themes.json, in order", () => {
        expect(THEMES.map((t) => t.id)).toEqual(data.themes.map((t) => t.id));
        expect(DEFAULT_THEME).toBe(data.default);
    });

    it("fills a token a theme leaves out from the default theme, as the stylesheet does", () => {
        expect("dd-hk" in data.themes.find((t) => t.id === "midnight")!.tokens).toBe(false);
        expect(theme("midnight").tokens["dd-hk"]).toBe(theme(DEFAULT_THEME).tokens["dd-hk"]);
    });

    it("keeps film grain on unless a theme turns it off", () => {
        expect(theme(DEFAULT_THEME).grain).toBe(true);
        expect(theme("contrast").grain).toBe(false);
    });

    it("keeps the panel top glow only on Deadlock and Midnight", () => {
        expect(THEMES.filter((t) => t.spotlight).map((t) => t.id)).toEqual(["deadlock", "midnight"]);
    });

    it("lists the effect layers a theme lets you turn off one by one, and none for a theme with one layer", () => {
        expect(theme("nightshift").effects).toEqual(["rain", "lights", "frames", "clock"]);
        expect(theme("flint-snow").effects).toEqual(["snow", "stars", "tail", "tracks"]);
        expect(theme("pretty-in-pink").effects).toEqual(["clouds", "hearts", "bow"]);
        expect(theme(DEFAULT_THEME).effects).toEqual([]);
    });

    it("links a theme to what it is based on, where there is one", () => {
        expect(theme("deadlock-api").source).toBe("https://deadlock-api.com");
        expect(theme("nightshift").source).toBe("https://www.twitch.tv/deadlocknightshift");
        expect(theme("midnight").source).toBeUndefined();
        for (const t of THEMES) if (t.source) expect(t.source, t.id).toMatch(/^https:\/\//);
    });

    it("has Pretty in Pink just before Catppuccin, a light theme of its own with no film grain and nothing to link to", () => {
        expect(THEMES.at(-2)?.id).toBe("pretty-in-pink");
        expect(isLightTheme("pretty-in-pink")).toBe(true);
        expect(theme("pretty-in-pink").grain).toBe(false);
        expect(theme("pretty-in-pink").source).toBeUndefined();
    });

    it("takes a custom accent on every theme but High contrast and Catppuccin, whose accents are its own", () => {
        expect(THEMES.filter((t) => !t.customAccent).map((t) => t.id)).toEqual(["contrast", "catppuccin"]);
    });

    it("ends with Catppuccin, flat and without film grain", () => {
        const last = THEMES.at(-1)!;
        expect(last.id).toBe("catppuccin");
        expect(last.grain).toBe(false);
        expect(last.spotlight).toBe(false);
        expect(last.effects).toEqual([]);
        expect(last.source).toBe("https://catppuccin.com/palette");
    });

    it("gives variants only to Catppuccin, whose own tokens are its default flavour's", () => {
        expect(THEMES.filter((t) => t.variants.length).map((t) => t.id)).toEqual(["catppuccin"]);
        const catppuccin = theme("catppuccin");
        expect(catppuccin.variants.map((v) => v.id)).toEqual(["latte", "frappe", "macchiato", "mocha"]);
        expect(catppuccin.variants.map((v) => v.name)).toEqual(["Latte", "Frappé", "Macchiato", "Mocha"]);
        expect(catppuccin.defaultVariant).toBe("mocha");
        expect(catppuccin.defaultAccent).toBe("mauve");
        expect(themeVariant(catppuccin, "mocha").tokens).toEqual(catppuccin.tokens);
    });

    it("gives every theme a plain oklch background and chrome, which the pre-paint paths convert to hex", () => {
        for (const t of THEMES) {
            expect(() => oklchToHex(t.tokens.background ?? ""), t.id).not.toThrow();
            expect(() => oklchToHex(t.tokens.chrome ?? ""), t.id).not.toThrow();
        }
    });
});

describe("resolveTheme", () => {
    it("keeps every known theme id", () => {
        for (const t of THEMES) expect(resolveTheme(t.id)).toBe(t.id);
    });

    it("falls back to the default for missing or unknown values", () => {
        expect(resolveTheme(undefined)).toBe(DEFAULT_THEME);
        expect(resolveTheme("neon")).toBe(DEFAULT_THEME);
        expect(resolveTheme(3)).toBe(DEFAULT_THEME);
    });
});

describe("isLightTheme", () => {
    it("follows the light flag in the data", () => {
        expect(isLightTheme("daylight")).toBe(true);
        expect(isLightTheme(DEFAULT_THEME)).toBe(false);
        expect(isLightTheme("neon")).toBe(false);
    });

    it("follows the variant for a theme that has them", () => {
        expect(isLightTheme("catppuccin", "latte")).toBe(true);
        expect(isLightTheme("catppuccin", "mocha")).toBe(false);
        expect(isLightTheme("catppuccin")).toBe(false);
        expect(isLightTheme("catppuccin", "neon")).toBe(false);
    });
});

describe("themeVariant", () => {
    it("is the theme drawn in one of its variants: that variant's lightness and tokens", () => {
        const latte = themeVariant(theme("catppuccin"), "latte");

        expect(latte.id).toBe("catppuccin");
        expect(latte.light).toBe(true);
        expect(latte.tokens).toEqual(theme("catppuccin").variants[0]!.tokens);
    });

    it("falls back to the default variant, and leaves a theme without variants as it is", () => {
        expect(themeVariant(theme("catppuccin"), "neon").tokens).toEqual(theme("catppuccin").tokens);
        expect(themeVariant(theme("catppuccin")).light).toBe(false);
        expect(themeVariant(theme("void"), "latte")).toBe(theme("void"));
    });
});

describe("resolveVariant", () => {
    it("keeps a known variant and falls back to the theme's default, or none for a theme without variants", () => {
        expect(resolveVariant(theme("catppuccin"), "frappe")).toBe("frappe");
        expect(resolveVariant(theme("catppuccin"), "neon")).toBe("mocha");
        expect(resolveVariant(theme("catppuccin"), undefined)).toBe("mocha");
        expect(resolveVariant(theme("void"), "latte")).toBeUndefined();
    });
});

describe("themeSwatch", () => {
    it("draws background, card, brass and primary", () => {
        const t = theme("nightshift");

        expect(themeSwatch(t)).toEqual([t.tokens.background, t.tokens.card, t.tokens.brass, t.tokens.primary]);
    });
});

describe("oklchToHex", () => {
    it("converts to the sRGB the window and browser bar paint", () => {
        expect(oklchToHex("oklch(0.125 0.006 65)")).toBe("#080605");
        expect(oklchToHex("oklch(0.93 0.014 85)")).toBe("#ece7de");
        expect(oklchToHex("oklch(0 0 0)")).toBe("#000000");
    });

    it("refuses anything but a plain oklch() colour", () => {
        expect(() => oklchToHex("oklch(0.8 0.1 82 / 20%)")).toThrow();
        expect(() => oklchToHex("#fff")).toThrow();
    });
});

describe("chromeHex", () => {
    it("is the theme's --chrome as hex", () => {
        expect(chromeHex(theme(DEFAULT_THEME))).toBe("#080605");
        expect(chromeHex(theme("daylight"))).toBe("#ece7de");
    });
});
