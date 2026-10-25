import { describe, expect, it } from "vitest";

import data from "./themes.json";
import { DEFAULT_THEME, THEMES, chromeHex, isLightTheme, oklchToHex, resolveTheme, themeSwatch } from "./themes";

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

    it("lists the effect layers a theme lets you turn off one by one, and none for a theme with one layer", () => {
        expect(theme("nightshift").effects).toEqual(["rain", "lights", "frames", "clock"]);
        expect(theme("flint-snow").effects).toEqual(["snow", "stars", "tail", "tracks"]);
        expect(theme(DEFAULT_THEME).effects).toEqual([]);
    });

    it("links a theme to what it is based on, where there is one", () => {
        expect(theme("deadlock-api").source).toBe("https://deadlock-api.com");
        expect(theme("nightshift").source).toBe("https://www.twitch.tv/deadlocknightshift");
        expect(theme("midnight").source).toBeUndefined();
        for (const t of THEMES) if (t.source) expect(t.source, t.id).toMatch(/^https:\/\//);
    });

    it("takes a custom accent on every theme but High contrast", () => {
        expect(THEMES.filter((t) => !t.customAccent).map((t) => t.id)).toEqual(["contrast"]);
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
