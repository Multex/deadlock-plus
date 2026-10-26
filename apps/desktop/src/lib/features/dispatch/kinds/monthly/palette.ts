import { MIN_CONTRAST, contrast, hexToAccent, hexToOklch, inGamut } from "@deadlock-plus/ui/accent";
import { oklchToHex } from "@deadlock-plus/ui/themes";

export interface MonthPalette {
    /** Cover and feature colour. */
    bg: string;
    /** The light behind the cover star; never under text. */
    glow: string;
    /** Kickers, the star's name and the sticker on `bg`. */
    accent: string;
    /** Body type on `bg`. */
    fg: string;
    /** Type on the white inside pages. */
    ink: string;
    /** `accent` as it reads on the near-black panels (nemesis, best-game photo). */
    night: string;
}

/** A cover colour per calendar month, so every issue on the shelf reads as a different month at a glance. */
export const MONTH_PALETTES: readonly MonthPalette[] = [
    { bg: "#1b3768", glow: "#4c7cc8", accent: "#ffd23f", fg: "#ffffff", ink: "#1b3768", night: "#ffd23f" },
    { bg: "#7e1a3a", glow: "#d0587e", accent: "#ffd6e3", fg: "#ffffff", ink: "#7e1a3a", night: "#ffd6e3" },
    { bg: "#1d5a42", glow: "#4fa67e", accent: "#f2ee6b", fg: "#ffffff", ink: "#1d5a42", night: "#f2ee6b" },
    { bg: "#553a88", glow: "#9a7bd6", accent: "#ffd0f0", fg: "#ffffff", ink: "#553a88", night: "#ffd0f0" },
    { bg: "#b33f28", glow: "#f08a5d", accent: "#fff2b3", fg: "#ffffff", ink: "#9c3420", night: "#fff2b3" },
    { bg: "#d9a21b", glow: "#ffd35c", accent: "#151515", fg: "#151515", ink: "#7a5a06", night: "#ffd35c" },
    { bg: "#a5141c", glow: "#ec4a3d", accent: "#ffe066", fg: "#ffffff", ink: "#a5141c", night: "#ffe066" },
    { bg: "#0d636b", glow: "#3fb7b2", accent: "#ffe17a", fg: "#ffffff", ink: "#0d636b", night: "#ffe17a" },
    { bg: "#a84a17", glow: "#f39545", accent: "#ffe7a8", fg: "#ffffff", ink: "#97400f", night: "#ffe7a8" },
    { bg: "#24132f", glow: "#7b3fa0", accent: "#ff8a1f", fg: "#ffffff", ink: "#5b2a78", night: "#ff8a1f" },
    { bg: "#45461b", glow: "#8f8a3a", accent: "#ffcf6b", fg: "#ffffff", ink: "#45461b", night: "#ffcf6b" },
    { bg: "#0d3a28", glow: "#2f7f55", accent: "#ff6e62", fg: "#ffffff", ink: "#0d3a28", night: "#ff6e62" },
];

/** The inside pages' fixed colours, shared by every month. */
export const PAGE_TOKENS = {
    paper: "#f9f7f2",
    /** Body type and rules. */
    text: "#16130f",
    /** Captions and small print. */
    muted: "#5c554b",
    /** The nemesis box and the best-game photo. */
    dark: "#16130f",
    /** Type on `dark`. */
    "dark-text": "#f4efe4",
    "dark-muted": "#cfc7b8",
} as const;

type PageToken = keyof typeof PAGE_TOKENS;
type Token = keyof MonthPalette | PageToken;

/** Each month colour drawn as text, over each surface it is drawn on. */
export const PALETTE_TEXT_PAIRS: readonly [Token, Token][] = [
    ["fg", "bg"],
    ["accent", "bg"],
    ["bg", "accent"],
    ["ink", "paper"],
    ["paper", "ink"],
    ["night", "dark"],
];

export const PAGE_TEXT_PAIRS: readonly [PageToken, PageToken][] = [
    ["text", "paper"],
    ["muted", "paper"],
    ["dark-text", "dark"],
    ["dark-muted", "dark"],
];

/** `month` is 1-12. */
export function monthPalette(month: number): MonthPalette {
    return MONTH_PALETTES[(((month - 1) % 12) + 12) % 12]!;
}

const pageStyle = Object.entries(PAGE_TOKENS)
    .map(([k, v]) => `--page-${k}: ${v};`)
    .join(" ");

/** The palette as CSS custom properties for a page's `style`. */
export function paletteStyle(p: MonthPalette): string {
    return `--bg: ${p.bg}; --glow: ${p.glow}; --accent: ${p.accent}; --fg: ${p.fg}; --ink: ${p.ink}; --night: ${p.night}; ${pageStyle}`;
}

const WHITE = "#ffffff";
const LIGHTNESS_STEP = 0.01;

const oklch = (l: number, c: number, hue: number) => `oklch(${+l.toFixed(4)} ${+c.toFixed(4)} ${+hue.toFixed(2)})`;

/** The hex of the most vivid colour up to `chroma` the screen can show at this lightness and hue. */
function swatch(l: number, chroma: number, hue: number): string {
    let lo = 0;
    let hi = chroma;
    if (inGamut(oklch(l, hi, hue))) lo = hi;
    else
        for (let i = 0; i < 20; i++) {
            const mid = (lo + hi) / 2;
            if (inGamut(oklch(l, mid, hue))) lo = mid;
            else hi = mid;
        }
    return oklchToHex(oklch(l, Math.floor(lo * 10000) / 10000, hue));
}

const reads = (a: string, b: string) => contrast(hexToOklch(a), hexToOklch(b)) >= MIN_CONTRAST;

/**
 * Walks the lightness from `start` in `step` until the swatch reads at 4.5:1 against every one of `against`,
 * keeping hue and as much chroma as the screen allows.
 */
function readable(start: number, step: number, chroma: number, hue: number, against: string[]): string {
    for (let l = start; l >= 0 && l <= 1; l += step) {
        const hex = swatch(l, chroma, hue);
        if (against.every((other) => reads(hex, other))) return hex;
    }
    return step < 0 ? "#000000" : WHITE;
}

/**
 * A cover palette from the hero's own colour, so the cover and the hero's backdrop art share a hue. Each field
 * keeps its role: a deep `bg` white type reads on, a bright `glow`, a pale `accent` that reads on `bg` both ways,
 * a dark `ink` for the white pages and a light `night` for the near-black panels.
 */
export function heroPalette(hex: string): MonthPalette {
    const { hue, chroma, lightness = 0.5 } = hexToAccent(hex.startsWith("#") ? hex : `#${hex}`);
    // The cover sits a little darker than the hero colour, but a pale hero still gets a mid-tone cover.
    const bg = readable(Math.min(0.5, Math.max(0.36, lightness - 0.12)), -LIGHTNESS_STEP, Math.min(chroma, 0.16), hue, [
        WHITE,
    ]);
    const accent = readable(0.9, LIGHTNESS_STEP, Math.min(chroma, 0.11), hue, [bg]);
    return {
        bg,
        glow: swatch(0.7, Math.min(chroma * 1.2, 0.2), hue),
        accent,
        fg: WHITE,
        ink: readable(0.42, -LIGHTNESS_STEP, Math.min(chroma, 0.16), hue, [PAGE_TOKENS.paper]),
        night: readable(0.82, LIGHTNESS_STEP, Math.min(chroma, 0.12), hue, [PAGE_TOKENS.dark]),
    };
}
