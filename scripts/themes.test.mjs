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
});
