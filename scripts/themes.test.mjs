import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { themeCss } from "./themes.mjs";

const data = {
    default: "base",
    themes: [
        { id: "base", light: false, tokens: { background: "oklch(0.1 0 0)", brass: "oklch(0.8 0.1 82)" } },
        { id: "paper", light: true, grain: false, tokens: { background: "oklch(0.97 0 0)" } },
        { id: "dusk", light: false, spotlight: true, tokens: { brass: "oklch(0.7 0.1 230)" } },
    ],
};

const block = (css, selector) => {
    const start = css.indexOf(`${selector} {`);
    if (start < 0) return undefined;
    return css.slice(start, css.indexOf("}", start) + 1);
};

describe("themeCss", () => {
    it("puts the default theme's tokens on the bare root", () => {
        const root = block(themeCss(data), ":root");

        expect(root).toContain("color-scheme: dark;");
        expect(root).toContain("--background: oklch(0.1 0 0);");
        expect(root).toContain("--brass: oklch(0.8 0.1 82);");
    });

    it("gives every other theme a block with only the tokens it changes", () => {
        const dusk = block(themeCss(data), ':root[data-theme="dusk"]');

        expect(dusk).toContain("--brass: oklch(0.7 0.1 230);");
        expect(dusk).not.toContain("--background");
        expect(dusk).not.toContain("color-scheme");
    });

    it("switches form controls and scrollbars to light for a light theme", () => {
        expect(block(themeCss(data), ':root[data-theme="paper"]')).toContain("color-scheme: light;");
    });

    it("turns the film grain off only for themes that opt out", () => {
        const css = themeCss(data);

        expect(css).toContain(':root[data-theme="paper"] body::after');
        expect(css).not.toContain(':root[data-theme="dusk"] body::after');
    });

    it("flattens the panel top glow for every theme that does not opt in", () => {
        const css = themeCss(data);

        const flat = block(css, ':root[data-theme="paper"] .noir-panel');

        expect(flat).toContain("background: var(--background);");
        expect(css).toContain(':root[data-theme="base"] .noir-panel,');
        expect(css).not.toContain(':root[data-theme="dusk"] .noir-panel');
    });

    it("gives each variant but the default its own block under the theme, switching the colour scheme where it differs", () => {
        const flavoured = {
            ...data,
            themes: [
                ...data.themes,
                {
                    id: "cafe",
                    light: false,
                    defaultVariant: "dark",
                    tokens: { background: "oklch(0.2 0 0)" },
                    variants: [
                        {
                            id: "milk",
                            name: "Milk",
                            light: true,
                            tokens: { background: "oklch(0.95 0 0)" },
                            accents: {},
                        },
                        { id: "roast", name: "Roast", tokens: { background: "oklch(0.15 0 0)" }, accents: {} },
                        { id: "dark", name: "Dark", accents: {} },
                    ],
                },
            ],
        };
        const css = themeCss(flavoured);

        const milk = block(css, ':root[data-theme="cafe"][data-theme-variant="milk"]');
        expect(milk).toContain("color-scheme: light;");
        expect(milk).toContain("--background: oklch(0.95 0 0);");
        const roast = block(css, ':root[data-theme="cafe"][data-theme-variant="roast"]');
        expect(roast).toContain("--background: oklch(0.15 0 0);");
        expect(roast).not.toContain("color-scheme");
        expect(css).not.toContain('[data-theme-variant="dark"]');
    });

    it("leaves every other theme's CSS as it was when a theme with variants joins", () => {
        const withVariants = {
            ...data,
            themes: [
                ...data.themes,
                {
                    id: "cafe",
                    light: false,
                    tokens: {},
                    variants: [{ id: "milk", name: "Milk", light: true, tokens: {}, accents: {} }],
                },
            ],
        };

        for (const theme of data.themes) {
            const selector = theme.id === data.default ? ":root" : `:root[data-theme="${theme.id}"]`;
            expect(block(themeCss(withVariants), selector), theme.id).toBe(block(themeCss(data), selector));
        }
    });

    it("rejects data whose default theme is missing", () => {
        expect(() => themeCss({ ...data, default: "neon" })).toThrow(/neon/);
    });
});

describe("theme-tokens.css", () => {
    const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

    it("is up to date with themes.json (run `pnpm themes:gen` in apps/desktop)", () => {
        const committed = read("../packages/ui/src/theme-tokens.css").replaceAll("\r\n", "\n");

        expect(committed).toBe(themeCss(JSON.parse(read("../packages/ui/src/themes.json"))));
    });

    it("draws every theme without variants exactly as it would if no theme had variants", () => {
        const real = JSON.parse(read("../packages/ui/src/themes.json"));
        const plain = { ...real, themes: real.themes.filter((theme) => !theme.variants) };

        expect(plain.themes.map((theme) => theme.id)).toContain("pretty-in-pink");
        for (const theme of plain.themes) {
            const selector = theme.id === real.default ? ":root" : `:root[data-theme="${theme.id}"]`;
            expect(block(themeCss(real), selector), theme.id).toBe(block(themeCss(plain), selector));
        }
    });
});
