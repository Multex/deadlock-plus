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
