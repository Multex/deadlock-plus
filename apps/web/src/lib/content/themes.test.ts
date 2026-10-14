import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { oklchStringToHex, themeBlocks } from "$lib/testing/theme-css";
import {
    DEFAULT_THEME,
    THEMES,
    THEME_STORAGE_KEY,
    applyTheme,
    loadTheme,
    resolveTheme,
    saveTheme,
    type ThemeId,
} from "./themes";

const blocks = themeBlocks(DEFAULT_THEME);
const cssVar = (id: ThemeId, name: string) => {
    const value = blocks.get(id)?.get(name);
    if (!value) throw new Error(`theme.css has no ${name} for ${id}`);
    return value;
};

describe("THEMES", () => {
    it("lists exactly the themes the stylesheet defines", () => {
        expect(THEMES.map((t) => t.id).sort()).toEqual([...blocks.keys()].sort());
    });

    it("draws each swatch from that theme's background, card, brass and primary", () => {
        for (const theme of THEMES) {
            expect(theme.swatch, theme.id).toEqual(
                ["--background", "--card", "--brass", "--primary"].map((name) => cssVar(theme.id, name)),
            );
        }
    });

    it("carries each theme's chrome colour as hex for the browser bar", () => {
        for (const theme of THEMES) {
            expect(theme.chrome, theme.id).toBe(oklchStringToHex(cssVar(theme.id, "--chrome")));
        }
    });
});

describe("resolveTheme", () => {
    it("keeps every known theme id", () => {
        for (const theme of THEMES) expect(resolveTheme(theme.id)).toBe(theme.id);
    });

    it("falls back to the default for missing or unknown values", () => {
        expect(resolveTheme(null)).toBe(DEFAULT_THEME);
        expect(resolveTheme("neon")).toBe(DEFAULT_THEME);
        expect(resolveTheme(3)).toBe(DEFAULT_THEME);
    });
});

describe("stored theme", () => {
    function fakeStorage(initial: Record<string, string> = {}) {
        const data = new Map(Object.entries(initial));
        return {
            data,
            getItem: (key: string) => data.get(key) ?? null,
            setItem: (key: string, value: string) => void data.set(key, value),
        };
    }

    it("reads back what was saved", () => {
        const storage = fakeStorage();

        saveTheme(() => storage, "midnight");

        expect(storage.data.get(THEME_STORAGE_KEY)).toBe("midnight");
        expect(loadTheme(() => storage)).toBe("midnight");
    });

    it("loads the default when nothing or something unknown is stored", () => {
        expect(loadTheme(() => fakeStorage())).toBe(DEFAULT_THEME);
        expect(loadTheme(() => fakeStorage({ [THEME_STORAGE_KEY]: "neon" }))).toBe(DEFAULT_THEME);
    });

    it("survives a browser that blocks storage", () => {
        const blocked = () => {
            throw new Error("SecurityError");
        };

        expect(loadTheme(blocked)).toBe(DEFAULT_THEME);
        expect(() => saveTheme(blocked, "daylight")).not.toThrow();
    });
});

describe("applyTheme", () => {
    it("sets the theme on the root element and tints the browser bar", () => {
        const root = { dataset: {} as Record<string, string | undefined> };
        const meta = { content: "" };

        applyTheme({ root, meta }, "daylight");

        expect(root.dataset.theme).toBe("daylight");
        expect(meta.content).toBe(THEMES.find((t) => t.id === "daylight")?.chrome);
    });

    it("works on a page with no theme-color tag", () => {
        const root = { dataset: {} as Record<string, string | undefined> };

        applyTheme({ root, meta: null }, "contrast");

        expect(root.dataset.theme).toBe("contrast");
    });
});

describe("app.html", () => {
    const html = readFileSync(fileURLToPath(new URL("../../app.html", import.meta.url)), "utf8");

    it("serves the default theme's brass as the accent colour of a link preview", () => {
        const served = /<meta name="theme-color" content="([^"]+)"/.exec(html)?.[1];

        expect(served).toBe(oklchStringToHex(cssVar(DEFAULT_THEME, "--brass")));
    });

    it("restores the stored theme before the first paint, under the same storage key", () => {
        expect(html).toContain(`localStorage.getItem("${THEME_STORAGE_KEY}")`);
        expect(html.indexOf("localStorage.getItem")).toBeLessThan(html.indexOf("%sveltekit.head%"));
    });

    it("tints the browser bar with the restored theme's chrome colour", () => {
        expect(html.indexOf('<meta name="theme-color"')).toBeLessThan(html.indexOf("<script>"));
        for (const theme of THEMES) {
            expect(html, theme.id).toMatch(new RegExp(`"?${theme.id}"?: "${theme.chrome}"`));
        }
    });

    it("paints each theme's own background before the stylesheet loads", () => {
        for (const theme of THEMES) {
            const selector = theme.id === DEFAULT_THEME ? "html" : `html[data-theme="${theme.id}"]`;
            const rule = new RegExp(`${selector.replace(/[[\]]/g, "\\$&")} \\{\\s*background: ([^;]+);`).exec(html);

            const value = rule?.[1];
            const painted = !value || value.startsWith("#") ? value : oklchStringToHex(value);

            expect(painted, theme.id).toBe(oklchStringToHex(cssVar(theme.id, "--background")));
        }
    });

    it("marks the light theme as light for form controls and scrollbars", () => {
        expect(html).toMatch(/html\[data-theme="daylight"\] \{[^}]*color-scheme: light;/);
    });
});
