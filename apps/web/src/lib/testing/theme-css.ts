import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function oklchToHex(l: number, c: number, hue: number): string {
    const h = (hue * Math.PI) / 180;
    const a = c * Math.cos(h);
    const b = c * Math.sin(h);
    const lc = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const mc = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const sc = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const linear = [
        4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
        -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
        -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
    ];
    const channels = linear.map((v) => {
        const srgb = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
        return Math.round(Math.min(1, Math.max(0, srgb)) * 255)
            .toString(16)
            .padStart(2, "0");
    });
    return `#${channels.join("")}`;
}

export function oklchStringToHex(value: string): string {
    const parts = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(value);
    if (!parts) throw new Error(`not a plain oklch() colour: ${value}`);
    return oklchToHex(Number(parts[1]), Number(parts[2]), Number(parts[3]));
}

/** Each theme's custom properties from the shared stylesheet, keyed by theme id. The bare `:root` block is `fallback`. */
export function themeBlocks(fallback: string): Map<string, Map<string, string>> {
    const css = readFileSync(
        fileURLToPath(new URL("../../../../../packages/ui/src/theme.css", import.meta.url)),
        "utf8",
    );
    const blocks = new Map<string, Map<string, string>>();
    for (const [, id, body = ""] of css.matchAll(/:root(?:\[data-theme="([\w-]+)"\])?\s*\{([^}]*)\}/g)) {
        const vars = new Map<string, string>();
        for (const [, name = "", value = ""] of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) vars.set(name, value.trim());
        blocks.set(id ?? fallback, vars);
    }
    return blocks;
}
