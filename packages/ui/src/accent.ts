import { oklchToHex, resolveVariant, themeVariant, type Theme } from "./themes";

/** A user's own accent. Without a lightness it takes the theme's trim lightness; either way contrast can move it. */
export interface Accent {
    hue: number;
    chroma: number;
    lightness?: number;
}

export const MIN_CONTRAST = 4.5;
/** The most vivid an accent can ask for; the screen's gamut caps it lower at most hues. */
export const MAX_CHROMA = 0.37;
/** The accent is text on these (`accent` is the hover surface), and `bg-brass` puts the background colour on it as text. */
const SURFACES = ["background", "card", "muted", "secondary", "popover", "chrome", "accent"];
const STEP = 0.005;

function parse(value: string): [number, number, number] {
    const parts = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)/.exec(value);
    if (!parts) throw new Error(`not an oklch() colour: ${value}`);
    return [Number(parts[1]), Number(parts[2]), Number(parts[3])];
}

function linear(l: number, c: number, hue: number): [number, number, number] {
    const h = (hue * Math.PI) / 180;
    const a = c * Math.cos(h);
    const b = c * Math.sin(h);
    const lc = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const mc = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const sc = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
        4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
        -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
        -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
    ];
}

const fits = (rgb: number[]) => rgb.every((v) => v >= -0.0005 && v <= 1.0005);

export function inGamut(value: string): boolean {
    return fits(linear(...parse(value)));
}

function luminance(value: string): number {
    const [r, g, b] = linear(...parse(value)).map((v) => Math.min(1, Math.max(0, v)));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** The WCAG contrast ratio of two `oklch()` colours. */
export function contrast(a: string, b: string): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
}

/** The most vivid colour up to `chroma` the screen can show at this lightness and hue. */
function fitChroma(l: number, hue: number, chroma: number): number {
    if (fits(linear(l, chroma, hue))) return chroma;
    let lo = 0;
    let hi = chroma;
    for (let i = 0; i < 20; i++) {
        const mid = (lo + hi) / 2;
        if (fits(linear(l, mid, hue))) lo = mid;
        else hi = mid;
    }
    return lo;
}

const format = (l: number, c: number, hue: number) =>
    `oklch(${+l.toFixed(4)} ${+(Math.floor(c * 10000) / 10000).toFixed(4)} ${+hue.toFixed(2)})`;

/**
 * The accent as this theme draws it: starting from its own lightness (or the theme's trim lightness), moved away
 * from the background until every text pair it is part of reaches 4.5:1.
 */
export function accentColour(theme: Theme, accent: Accent): string {
    const hue = ((accent.hue % 360) + 360) % 360;
    const chroma = Math.min(MAX_CHROMA, Math.max(0, accent.chroma));
    const away = theme.light ? -STEP : STEP;
    const surfaces = SURFACES.map((s) => theme.tokens[s]).filter((s): s is string => !!s);
    let l = accent.lightness ?? parse(theme.tokens.brass ?? "oklch(0.8 0 0)")[0];
    for (; l >= 0 && l <= 1; l += away) {
        const colour = format(l, fitChroma(l, hue, chroma), hue);
        if (surfaces.every((s) => contrast(colour, s) >= MIN_CONTRAST)) return colour;
    }
    return format(theme.light ? 0 : 1, 0, hue);
}

/** `colour` as is when it reads at 4.5:1 on every surface; otherwise only its lightness moves, as `accentColour` does. */
export function readableColour(theme: Theme, colour: string): string {
    const surfaces = SURFACES.map((s) => theme.tokens[s]).filter((s): s is string => !!s);
    if (surfaces.every((s) => contrast(colour, s) >= MIN_CONTRAST)) return colour;
    const [lightness, chroma, hue] = parse(colour);
    return accentColour(theme, { hue, chroma, lightness });
}

/**
 * A theme's named accent in one of its variants. The focus ring keeps the accent's exact colour; the trim, which
 * is also text, takes the readable one. `null` for an accent the variant does not have.
 */
export function namedAccentTokens(
    theme: Theme,
    variant: string | undefined,
    name: string,
): Record<"brass" | "ring", string> | null {
    const id = resolveVariant(theme, variant);
    const exact = theme.variants.find((v) => v.id === id)?.accents[name];
    if (!exact) return null;
    return { brass: readableColour(themeVariant(theme, id), exact), ring: exact };
}

export function accentHex(theme: Theme, accent: Accent): string {
    return oklchToHex(accentColour(theme, accent));
}

export function hexToAccent(hex: string): Accent {
    let digits = hex.trim().replace(/^#/, "");
    if (digits.length === 3) digits = [...digits].map((d) => d + d).join("");
    const [r, g, b] = [0, 2, 4].map((i) => {
        const c = parseInt(digits.slice(i, i + 2), 16) / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    const chroma = Math.hypot(a, bb);
    const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    return { hue: chroma < 0.002 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360, chroma, lightness };
}

/** A plain `oklch()` colour that `oklchToHex` turns back into exactly `hex`, as short as that allows. */
export function hexToOklch(hex: string): string {
    const { lightness = 0, chroma, hue } = hexToAccent(hex);
    const precisions = [
        [4, 4, 2],
        [4, 4, 3],
        [5, 5, 3],
        [6, 6, 4],
    ] as const;
    for (const [l, c, h] of precisions) {
        const value = `oklch(${+lightness.toFixed(l)} ${+chroma.toFixed(c)} ${+hue.toFixed(h)})`;
        if (oklchToHex(value) === hex.toLowerCase()) return value;
    }
    throw new Error(`no oklch() round trip for ${hex}`);
}

/** The theme's own trim, read as an accent. */
export function themeAccent(theme: Theme): Accent {
    const [, chroma, hue] = parse(theme.tokens.brass ?? "oklch(0.8 0 0)");
    return { hue, chroma };
}

/** Whether `text` is a hex colour `hexToAccent` can read. */
export function isHex(text: string): boolean {
    return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(text.trim());
}

/** The tokens an accent replaces: the trim, the focus ring, and the borders at the theme's own strength. */
export function accentTokens(theme: Theme, accent: Accent): Record<"brass" | "ring" | "border" | "input", string> {
    const colour = accentColour(theme, accent);
    const alpha = (token: string, fallback: string) =>
        /\/ ([\d.]+%)\)$/.exec(theme.tokens[token] ?? "")?.[1] ?? fallback;
    const withAlpha = (a: string) => colour.replace(")", ` / ${a})`);
    return {
        brass: colour,
        ring: colour,
        border: withAlpha(alpha("border", "20%")),
        input: withAlpha(alpha("input", "26%")),
    };
}
