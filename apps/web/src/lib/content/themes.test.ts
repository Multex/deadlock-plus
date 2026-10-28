import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decorThemeIds } from "@deadlock-plus/ui/theme-decor";
import { THEMES as THEME_DATA, chromeHex, oklchToHex, themeSwatch, themeVariant } from "@deadlock-plus/ui/themes";
import { describe, expect, it } from "vitest";
import { en } from "$lib/i18n";
import { lookup } from "$lib/i18n/core";

import {
    DEFAULT_THEME,
    EFFECTS_STORAGE_KEY,
    PREPAINT_PLACEHOLDER,
    THEMES,
    THEME_STORAGE_KEY,
    VARIANT_STORAGE_KEY,
    applyTheme,
    effectsOn,
    loadEffects,
    loadTheme,
    resolveTheme,
    saveEffects,
    saveTheme,
    saveVariant,
    storedVariant,
    themeKey,
    themePrepaint,
    themeStyle,
    themeVariantAttr,
} from "./themes";

const data = (id: string) => {
    const theme = THEME_DATA.find((t) => t.id === id);
    if (!theme) throw new Error(`themes.json has no ${id}`);
    return theme;
};

describe("THEMES", () => {
    it("lists exactly the themes the shared data defines", () => {
        expect(THEMES.map((t) => t.id)).toEqual(THEME_DATA.map((t) => t.id));
    });

    it("names every theme in English", () => {
        for (const theme of THEMES) expect(lookup(en, `themes.${themeKey(theme.id)}`), theme.id).toBeTruthy();
    });

    it("draws each swatch from that theme's background, card, brass and primary", () => {
        for (const theme of THEMES) expect(theme.swatch, theme.id).toEqual(themeSwatch(data(theme.id)));
    });

    it("carries each theme's chrome colour as hex for the browser bar", () => {
        for (const theme of THEMES) expect(theme.chrome, theme.id).toBe(chromeHex(data(theme.id)));
    });
});

describe("theme effects and credits", () => {
    const decorDir = fileURLToPath(new URL("../../../../../packages/ui/src/themes", import.meta.url));
    const withDecor = decorThemeIds(
        readdirSync(decorDir, { recursive: true, encoding: "utf8" }).map((p) => `/themes/${p.replaceAll("\\", "/")}`),
    );

    it("marks exactly the themes that ship decor as having effects", () => {
        expect(withDecor.length).toBeGreaterThan(0);
        expect(THEMES.filter((t) => t.effects).map((t) => t.id)).toEqual(
            THEME_DATA.map((t) => t.id).filter((id) => withDecor.includes(id)),
        );
    });

    it("credits each theme's source with its link and an English name", () => {
        for (const theme of THEME_DATA) {
            expect(THEMES.find((t) => t.id === theme.id)?.source, theme.id).toBe(theme.source);
            if (theme.source) expect(lookup(en, `themes.sources.${themeKey(theme.id)}`), theme.id).toBeTruthy();
        }
        expect(lookup(en, "themes.based_on")).toContain("{source}");
    });
});

describe("variants", () => {
    it("offers Catppuccin's four flavours by their own names, Mocha picked first", () => {
        const catppuccin = THEMES.find((t) => t.id === "catppuccin");

        expect(catppuccin?.variants.map((v) => [v.id, v.name])).toEqual([
            ["latte", "Latte"],
            ["frappe", "Frappé"],
            ["macchiato", "Macchiato"],
            ["mocha", "Mocha"],
        ]);
        expect(catppuccin?.defaultVariant).toBe("mocha");
    });

    it("draws each flavour's swatch and browser bar from that flavour", () => {
        const latte = themeVariant(data("catppuccin"), "latte");
        const variant = THEMES.find((t) => t.id === "catppuccin")?.variants[0];

        expect(variant?.swatch).toEqual(themeSwatch(latte));
        expect(variant?.chrome).toBe(chromeHex(latte));
    });

    it("gives a theme with one palette no variants", () => {
        expect(THEMES.find((t) => t.id === "midnight")?.variants).toEqual([]);
    });

    it("names the variant attribute only for a theme that has variants", () => {
        expect(themeVariantAttr("catppuccin", "latte")).toBe("latte");
        expect(themeVariantAttr("catppuccin", "espresso")).toBe("mocha");
        expect(themeVariantAttr("catppuccin", undefined)).toBe("mocha");
        expect(themeVariantAttr("midnight", "latte")).toBeUndefined();
    });
});

describe("themeStyle", () => {
    it("scopes every token of the theme as a custom property", () => {
        const style = themeStyle("midnight");

        for (const [name, value] of Object.entries(data("midnight").tokens))
            expect(style).toContain(`--${name}: ${value};`);
        expect(style).toContain("color-scheme: dark;");
    });

    it("draws a variant's own tokens, and the default variant for an unknown one", () => {
        const latte = themeVariant(data("catppuccin"), "latte");

        expect(themeStyle("catppuccin", "latte")).toContain(`--background: ${latte.tokens.background};`);
        expect(themeStyle("catppuccin", "latte")).toContain("color-scheme: light;");
        expect(themeStyle("catppuccin", "espresso")).toBe(themeStyle("catppuccin", "mocha"));
    });
});

describe("effectsOn", () => {
    it("runs effects on a desktop-width screen and not on a phone until the visitor says", () => {
        expect(effectsOn(null, true)).toBe(true);
        expect(effectsOn(null, false)).toBe(false);
    });

    it("follows the visitor's own choice on any screen", () => {
        expect(effectsOn(true, false)).toBe(true);
        expect(effectsOn(false, true)).toBe(false);
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
        expect(storedVariant(blocked)).toBeUndefined();
        expect(() => saveVariant(blocked, "latte")).not.toThrow();
        expect(loadEffects(blocked)).toBeNull();
        expect(() => saveEffects(blocked, false)).not.toThrow();
    });

    it("reads back the saved flavour, and nothing before one is saved", () => {
        const storage = fakeStorage();
        expect(storedVariant(() => storage)).toBeUndefined();

        saveVariant(() => storage, "frappe");

        expect(storage.data.get(VARIANT_STORAGE_KEY)).toBe("frappe");
        expect(storedVariant(() => storage)).toBe("frappe");
    });

    it("remembers whether the visitor turned effects on or off, and nothing until they do", () => {
        const storage = fakeStorage();
        expect(loadEffects(() => storage)).toBeNull();

        saveEffects(() => storage, false);
        expect(loadEffects(() => storage)).toBe(false);

        saveEffects(() => storage, true);
        expect(loadEffects(() => storage)).toBe(true);
        expect(loadEffects(() => fakeStorage({ [EFFECTS_STORAGE_KEY]: "maybe" }))).toBeNull();
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

    it("draws a theme with variants in the picked one, and drops the variant for one without", () => {
        const root = { dataset: {} as Record<string, string | undefined> };
        const meta = { content: "" };

        applyTheme({ root, meta }, "catppuccin", "latte");
        expect(root.dataset.themeVariant).toBe("latte");
        expect(meta.content).toBe(chromeHex(themeVariant(data("catppuccin"), "latte")));

        applyTheme({ root, meta }, "midnight", "latte");
        expect(root.dataset.themeVariant).toBeUndefined();
    });

    it("works on a page with no theme-color tag", () => {
        const root = { dataset: {} as Record<string, string | undefined> };

        applyTheme({ root, meta: null }, "contrast");

        expect(root.dataset.theme).toBe("contrast");
    });
});

describe("themePrepaint", () => {
    const head = themePrepaint();
    const script = /<script>([\s\S]*)<\/script>/.exec(head)?.[1] ?? "";

    function run(stored: string | null | Error, variant: string | null = null) {
        const root = { dataset: {} as Record<string, string | undefined> };
        const meta = { content: "#e6b557" };
        const localStorage = {
            getItem: (key: string) => {
                if (stored instanceof Error) throw stored;
                return key === VARIANT_STORAGE_KEY ? variant : stored;
            },
        };
        const document = { documentElement: root, querySelector: () => meta };
        new Function("document", "localStorage", script)(document, localStorage);
        const result: Record<string, string | undefined> = { theme: root.dataset.theme, chrome: meta.content };
        if (root.dataset.themeVariant) result.variant = root.dataset.themeVariant;
        return result;
    }

    it("restores the stored theme and tints the browser bar with its chrome colour", () => {
        for (const theme of THEMES.filter((t) => !t.variants.length))
            expect(run(theme.id), theme.id).toEqual({ theme: theme.id, chrome: theme.chrome });
    });

    it("restores the stored flavour, or the default one, with that flavour's browser bar colour", () => {
        const chrome = (id: string) => chromeHex(themeVariant(data("catppuccin"), id));
        const midnight = THEMES.find((t) => t.id === "midnight")?.chrome;

        expect(run("catppuccin", "latte")).toEqual({ theme: "catppuccin", variant: "latte", chrome: chrome("latte") });
        expect(run("catppuccin", "espresso")).toEqual({
            theme: "catppuccin",
            variant: "mocha",
            chrome: chrome("mocha"),
        });
        expect(run("midnight", "latte")).toEqual({ theme: "midnight", chrome: midnight });
    });

    it("paints each flavour's own background, and marks Latte light", () => {
        for (const variant of data("catppuccin").variants) {
            const selector = `html[data-theme="catppuccin"][data-theme-variant="${variant.id}"]`;
            const rule = new RegExp(`${selector.replace(/[[\]]/g, "\\$&")} \\{\\s*background: ([^;]+);`).exec(head);

            expect(rule?.[1], variant.id).toBe(oklchToHex(variant.tokens.background ?? ""));
        }
        expect(head).toMatch(
            /html\[data-theme="catppuccin"\]\[data-theme-variant="latte"\] \{[^}]*color-scheme: light;/,
        );
    });

    it("falls back to the default for an unknown or unreadable stored theme", () => {
        const fallback = { theme: DEFAULT_THEME, chrome: THEMES.find((t) => t.id === DEFAULT_THEME)?.chrome };

        expect(run(null)).toEqual(fallback);
        expect(run("neon")).toEqual(fallback);
        expect(run(new Error("SecurityError"))).toEqual(fallback);
    });

    it("paints each theme's own background as hex, for browsers without oklch", () => {
        for (const theme of THEME_DATA) {
            const selector = theme.id === DEFAULT_THEME ? "html" : `html[data-theme="${theme.id}"]`;
            const rule = new RegExp(`${selector.replace(/[[\]]/g, "\\$&")} \\{\\s*background: ([^;]+);`).exec(head);

            expect(rule?.[1], theme.id).toBe(oklchToHex(theme.tokens.background ?? ""));
        }
    });

    it("marks light themes as light for form controls and scrollbars", () => {
        expect(head).toMatch(/html \{[^}]*color-scheme: dark;/);
        expect(head).toMatch(/html\[data-theme="daylight"\] \{[^}]*color-scheme: light;/);
        expect(head).not.toMatch(/html\[data-theme="midnight"\] \{[^}]*color-scheme/);
    });
});

describe("app.html", () => {
    const html = readFileSync(fileURLToPath(new URL("../../app.html", import.meta.url)), "utf8");

    it("serves the default theme's brass as the accent colour of a link preview", () => {
        const served = /<meta name="theme-color" content="([^"]+)"/.exec(html)?.[1];

        expect(served).toBe(oklchToHex(data(DEFAULT_THEME).tokens.brass ?? ""));
    });

    it("takes the theme pre-paint after the theme-color tag and before the page head", () => {
        const at = html.indexOf(PREPAINT_PLACEHOLDER);

        expect(at).toBeGreaterThan(html.indexOf('<meta name="theme-color"'));
        expect(at).toBeLessThan(html.indexOf("%sveltekit.head%"));
    });
});

describe("badge contrast", () => {
    const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const luminance = (rgb: number[]) => {
        const [r = 0, g = 0, b = 0] = rgb.map((v) => {
            const c = v / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: number[], b: number[]) => {
        const [hi = 0, lo = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
    };

    // The download page's Recommended and Best-effort badges draw their colour as small text on a 15% tint of itself.
    it.each(["success", "warning"])("keeps %s badge text at 4.5:1 on every theme's card", (token) => {
        for (const theme of THEME_DATA) {
            const text = channels(oklchToHex(theme.tokens[token] ?? ""));
            const card = channels(oklchToHex(theme.tokens.card ?? ""));
            const tint = card.map((c, i) => 0.15 * (text[i] ?? 0) + 0.85 * c);
            expect(ratio(text, tint), theme.id).toBeGreaterThanOrEqual(4.5);
        }
    });
});
