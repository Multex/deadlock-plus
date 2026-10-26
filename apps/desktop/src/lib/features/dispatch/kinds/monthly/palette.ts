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
