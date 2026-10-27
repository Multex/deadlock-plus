import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { MIN_CONTRAST, contrast } from "@deadlock-plus/ui/accent";
import { THEMES, oklchToHex, themeVariant } from "@deadlock-plus/ui/themes";

const ROOT = join(import.meta.dirname, "../../../../..");
const SOURCES = ["apps/desktop/src", "packages/ui/src"].map((dir) => join(ROOT, dir));
const SURFACES = ["background", "card", "muted", "popover", "chrome", "accent"];
// Variant-prefixed classes (`hover:`, `marker:`) are left out: axe and readers judge the resting text.
const FADED_TEXT = /(?<![\w:-])text-(muted-foreground|foreground)\/(\d+)\b/g;

/** The tag a class sits in, from its `<` to the `>` that closes it (an arrow's `=>` does not). */
function openingTag(source: string, at: number): string {
    const start = source.lastIndexOf("<", at);
    const end = source.slice(at).search(/[^=]>/);
    return source.slice(start, end < 0 ? undefined : at + end + 2);
}

function svelteFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return svelteFiles(path);
        return entry.name.endsWith(".svelte") ? [path] : [];
    });
}

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

/** A faded colour as the browser paints it: mixed into the surface in gamma-encoded sRGB, the way axe reads it. */
function painted(colour: string, surface: string, alpha: number): string {
    const fg = channels(oklchToHex(colour));
    const bg = channels(oklchToHex(surface));
    const mixed = fg.map((c, i) => c * alpha + bg[i]! * (1 - alpha));
    const linear = mixed.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    const [r, g, b] = linear as [number, number, number];
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    const C = Math.hypot(A, B);
    const H = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
    return `oklch(${L.toFixed(6)} ${C.toFixed(6)} ${H.toFixed(4)})`;
}

const palettes = THEMES.flatMap((t) => [
    t,
    ...t.variants.map((v) => ({ id: `${t.id}/${v.id}`, tokens: themeVariant(t, v.id).tokens })),
]);

function worst(token: string, alpha: number) {
    let low = { ratio: Infinity, where: "" };
    for (const p of palettes) {
        for (const surface of SURFACES) {
            const ratio = contrast(painted(p.tokens[token]!, p.tokens[surface]!, alpha), p.tokens[surface]!);
            if (ratio < low.ratio) low = { ratio, where: `${p.id} on ${surface}` };
        }
    }
    return low;
}

describe("faded text colours", () => {
    it("reads at 4.5:1 on every theme and surface, unless the element is hidden from assistive tech", () => {
        const misses: string[] = [];
        for (const file of SOURCES.flatMap(svelteFiles)) {
            const source = readFileSync(file, "utf8");
            for (const match of source.matchAll(FADED_TEXT)) {
                const [, token, percent] = match;
                if (openingTag(source, match.index).includes("aria-hidden")) continue;
                const low = worst(token!, Number(percent) / 100);
                if (low.ratio >= MIN_CONTRAST) continue;
                const line = source.slice(0, match.index).split("\n").length;
                const at = `${relative(ROOT, file).replaceAll("\\", "/")}:${line}`;
                misses.push(`${at} text-${token}/${percent} ${low.ratio.toFixed(2)} (${low.where})`);
            }
        }
        expect(misses).toEqual([]);
    });

    it("flags the faded status line text the axe sweep caught", () => {
        expect(worst("muted-foreground", 0.6).ratio).toBeLessThan(MIN_CONTRAST);
        expect(worst("muted-foreground", 1).ratio).toBeGreaterThanOrEqual(MIN_CONTRAST);
    });
});
