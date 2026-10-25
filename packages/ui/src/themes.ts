import data from "./themes.json";

export type ThemeId = string;

/** One palette a theme comes in, like Catppuccin's flavours. */
export interface ThemeVariant {
    id: string;
    /** Shown as is in every language: variants are named by their source. */
    name: string;
    light: boolean;
    /** Every token, filled from the theme and then the default theme. */
    tokens: Record<string, string>;
    /** The accents this variant offers by name, in its own exact colours. */
    accents: Record<string, string>;
}

export interface Theme {
    id: ThemeId;
    light: boolean;
    grain: boolean;
    /** Whether the main panel gets a soft brass glow from the top; flat where the palette is neutral or light. */
    spotlight: boolean;
    /** Effect layers that can be turned off one by one; empty when the theme's effects are one piece. */
    effects: string[];
    /** What the theme is based on, linked from its card. */
    source?: string;
    /** Whether the theme takes an accent of the user's own; off where the palette is the point. */
    customAccent: boolean;
    /** Every token, with the ones this theme leaves out filled from the default theme; its default variant's. */
    tokens: Record<string, string>;
    /** Empty for a theme that comes in one palette. */
    variants: ThemeVariant[];
    defaultVariant?: string;
    /** The named accent each variant's own tokens are drawn with. */
    defaultAccent?: string;
}

interface ThemeFile {
    default: string;
    themes: {
        id: string;
        light: boolean;
        grain?: boolean;
        spotlight?: boolean;
        effects?: string[];
        source?: string;
        customAccent?: boolean;
        defaultVariant?: string;
        defaultAccent?: string;
        tokens: Record<string, string>;
        variants?: {
            id: string;
            name: string;
            light?: boolean;
            tokens?: Record<string, string>;
            accents: Record<string, string>;
        }[];
    }[];
}

const file = data as ThemeFile;
const base = file.themes.find((t) => t.id === file.default);

export const DEFAULT_THEME: ThemeId = file.default;

export const THEMES: readonly Theme[] = file.themes.map((t) => {
    const tokens = { ...base?.tokens, ...t.tokens };
    return {
        id: t.id,
        light: t.light,
        grain: t.grain ?? true,
        spotlight: t.spotlight ?? false,
        effects: t.effects ?? [],
        source: t.source,
        customAccent: t.customAccent ?? true,
        tokens,
        variants: (t.variants ?? []).map((v) => ({
            id: v.id,
            name: v.name,
            light: v.light ?? t.light,
            tokens: { ...tokens, ...v.tokens },
            accents: v.accents,
        })),
        defaultVariant: t.defaultVariant,
        defaultAccent: t.defaultAccent,
    };
});

export function resolveTheme(value: unknown): ThemeId {
    return THEMES.find((t) => t.id === value)?.id ?? DEFAULT_THEME;
}

/** `value` when the theme has that variant, else its default; none for a theme without variants. */
export function resolveVariant(theme: Theme, value: unknown): string | undefined {
    if (!theme.variants.length) return undefined;
    return theme.variants.find((v) => v.id === value)?.id ?? theme.defaultVariant ?? theme.variants[0]?.id;
}

/** The theme as one of its variants draws it, so contrast checks and swatches read that variant's colours. */
export function themeVariant(theme: Theme, id?: string): Theme {
    const variant = theme.variants.find((v) => v.id === resolveVariant(theme, id));
    return variant ? { ...theme, light: variant.light, tokens: variant.tokens } : theme;
}

export function isLightTheme(id: ThemeId, variant?: string): boolean {
    const theme = THEMES.find((t) => t.id === id);
    return theme ? themeVariant(theme, variant).light : false;
}

/** Background, card, brass and primary, drawn in the picker swatch. */
export function themeSwatch(theme: Theme): [string, string, string, string] {
    const { background = "", card = "", brass = "", primary = "" } = theme.tokens;
    return [background, card, brass, primary];
}

export function oklchToHex(value: string): string {
    const parts = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(value);
    if (!parts) throw new Error(`not a plain oklch() colour: ${value}`);
    const [l, c, hue] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
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

/** `--chrome` as sRGB hex, for places that cannot read `oklch()`: the native window and a browser's theme-color. */
export function chromeHex(theme: Theme): string {
    return oklchToHex(theme.tokens.chrome ?? "");
}
