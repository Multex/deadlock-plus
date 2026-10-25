import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HEADER = "/* Generated from themes.json by `pnpm themes:gen` (apps/desktop). Edit the JSON, not this file. */\n";

function rule(selector, lines) {
    return `${selector} {\n${lines.map((line) => (line ? `    ${line}` : "")).join("\n")}\n}\n`;
}

function declarations(theme, colorScheme) {
    const tokens = Object.entries(theme.tokens).map(([name, value]) => `--${name}: ${value};`);
    return colorScheme ? [`color-scheme: ${colorScheme};`, "", ...tokens] : tokens;
}

/** Non-default themes only override, so a token they leave out falls back to the default theme's `:root` value. */
export function themeCss(data) {
    const base = data.themes.find((theme) => theme.id === data.default);
    if (!base) throw new Error(`themes.json: default theme ${data.default} is not in themes`);

    const scheme = (theme) => (theme.light ? "light" : "dark");
    const blocks = [rule(":root", declarations(base, scheme(base)))];
    for (const theme of data.themes) {
        if (theme === base) continue;
        const colorScheme = scheme(theme) === scheme(base) ? undefined : scheme(theme);
        blocks.push(rule(`:root[data-theme="${theme.id}"]`, declarations(theme, colorScheme)));
    }

    const grainless = data.themes.filter((theme) => theme.grain === false);
    if (grainless.length) {
        const selectors = grainless.map((theme) => `:root[data-theme="${theme.id}"] body::after`).join(",\n");
        blocks.push(rule(selectors, ["display: none;"]));
    }

    const flat = data.themes.filter((theme) => theme.spotlight !== true);
    if (flat.length) {
        const selectors = flat.map((theme) => `:root[data-theme="${theme.id}"] .noir-panel`).join(",\n");
        blocks.push(rule(selectors, ["background: var(--background);"]));
    }
    return HEADER + "\n" + blocks.join("\n");
}

function main() {
    const dir = fileURLToPath(new URL("../packages/ui/src/", import.meta.url));
    const data = JSON.parse(readFileSync(`${dir}themes.json`, "utf8"));
    writeFileSync(`${dir}theme-tokens.css`, themeCss(data));
    console.log(`Wrote theme-tokens.css (${data.themes.length} themes)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
