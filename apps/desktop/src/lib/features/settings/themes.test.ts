import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { THEMES as THEME_DATA, chromeHex } from "@deadlock-plus/ui/themes";
import { describe, expect, it } from "vitest";
import {
    DEFAULT_THEME,
    THEMES,
    initialTheme,
    resolveMotionPreference,
    resolveReducedMotion,
    resolveTheme,
} from "./themes";

describe("THEMES", () => {
    it("has a label and description in en for every theme", () => {
        for (const theme of THEMES) {
            expect(theme.label, theme.id).not.toMatch(/^settings\./);
            expect(theme.description, theme.id).not.toMatch(/^settings\./);
        }
    });

    it("names every effect layer a theme lets you turn off", () => {
        for (const theme of THEMES) {
            for (const layer of theme.effects)
                expect(layer.label, `${theme.id}.${layer.id}`).not.toMatch(/^settings\./);
        }
        expect(THEMES.find((t) => t.id === "nightshift")?.effects.map((l) => l.id)).toEqual([
            "rain",
            "lights",
            "frames",
            "clock",
        ]);
    });

    it("names the source of every theme that links to one", () => {
        for (const theme of THEMES) {
            if (theme.source) expect(theme.source.label, theme.id).not.toMatch(/^settings\./);
        }
        expect(THEMES.find((t) => t.id === "deadlock-api")?.source?.url).toBe("https://deadlock-api.com");
    });
});

describe("Catppuccin", () => {
    const catppuccin = THEMES.find((t) => t.id === "catppuccin")!;

    it("is named, described and linked in en, last in the list", () => {
        expect(THEMES.at(-1)?.id).toBe("catppuccin");
        expect(catppuccin.label).toBe("Catppuccin");
        expect(catppuccin.source?.url).toBe("https://catppuccin.com/palette");
        expect(catppuccin.variantLabel).toBe("Flavour");
        expect(catppuccin.accentLabel).toBe("Accent");
    });

    it("names its flavours and accents as Catppuccin does, the same in every language", () => {
        expect(catppuccin.variants.map((v) => v.name)).toEqual(["Latte", "Frappé", "Macchiato", "Mocha"]);
        expect(catppuccin.accents.map((a) => a.name)).toEqual([
            "Rosewater",
            "Flamingo",
            "Pink",
            "Mauve",
            "Red",
            "Maroon",
            "Peach",
            "Yellow",
            "Green",
            "Teal",
            "Sky",
            "Sapphire",
            "Blue",
            "Lavender",
        ]);
    });

    it("leaves themes without flavours or named accents without either", () => {
        const plain = THEMES.find((t) => t.id === "void")!;
        expect(plain.variants).toEqual([]);
        expect(plain.accents).toEqual([]);
    });
});

describe("app.html", () => {
    it("paints the default theme's chrome where no native window colour sits behind the page", () => {
        const html = readFileSync(fileURLToPath(new URL("../../../app.html", import.meta.url)), "utf8");
        const fallback = /html:not\(\[data-theme\]\) \{\s*background: (#[0-9a-f]{6});/.exec(html)?.[1];

        expect(fallback).toBe(chromeHex(THEME_DATA.find((t) => t.id === DEFAULT_THEME)!));
    });
});

describe("initialTheme", () => {
    it("starts from the theme the window set before the page loaded", () => {
        expect(initialTheme({ dataset: { theme: "daylight" } })).toBe("daylight");
    });

    it("falls back to the default without a root element or a known theme", () => {
        expect(initialTheme(undefined)).toBe(DEFAULT_THEME);
        expect(initialTheme({ dataset: {} })).toBe(DEFAULT_THEME);
        expect(initialTheme({ dataset: { theme: "neon" } })).toBe(DEFAULT_THEME);
    });
});

describe("resolveTheme", () => {
    it("falls back to the default for missing or unknown values", () => {
        expect(resolveTheme(undefined)).toBe(DEFAULT_THEME);
        expect(resolveTheme(null)).toBe(DEFAULT_THEME);
        expect(resolveTheme("neon")).toBe(DEFAULT_THEME);
        expect(resolveTheme(3)).toBe(DEFAULT_THEME);
    });

    it("keeps every known theme id", () => {
        for (const theme of THEMES) expect(resolveTheme(theme.id)).toBe(theme.id);
    });

    it("has unique ids and includes the default", () => {
        const ids = THEMES.map((t) => t.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toContain(DEFAULT_THEME);
    });
});

describe("resolveMotionPreference", () => {
    it("defaults to following the system", () => {
        expect(resolveMotionPreference(undefined)).toBe("system");
        expect(resolveMotionPreference("maybe")).toBe("system");
    });

    it("keeps valid values", () => {
        expect(resolveMotionPreference("reduce")).toBe("reduce");
        expect(resolveMotionPreference("full")).toBe("full");
        expect(resolveMotionPreference("system")).toBe("system");
    });
});

describe("resolveReducedMotion", () => {
    it("follows the OS when set to system", () => {
        expect(resolveReducedMotion("system", true)).toBe(true);
        expect(resolveReducedMotion("system", false)).toBe(false);
    });

    it("overrides the OS when set explicitly", () => {
        expect(resolveReducedMotion("reduce", false)).toBe(true);
        expect(resolveReducedMotion("full", true)).toBe(false);
    });
});
