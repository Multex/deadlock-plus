import data from "./themes.json";

export type ThemeId = string;

export interface Theme {
    id: ThemeId;
    light: boolean;
    grain: boolean;
    /** Every token, with the ones this theme leaves out filled from the default theme. */
    tokens: Record<string, string>;
}

interface ThemeFile {
    default: string;
    themes: { id: string; light: boolean; grain?: boolean; tokens: Record<string, string> }[];
}

const file = data as ThemeFile;
const base = file.themes.find((t) => t.id === file.default);

export const DEFAULT_THEME: ThemeId = file.default;

export const THEMES: readonly Theme[] = file.themes.map((t) => ({
    id: t.id,
    light: t.light,
    grain: t.grain ?? true,
    tokens: { ...base?.tokens, ...t.tokens },
}));

export function resolveTheme(value: unknown): ThemeId {
    return THEMES.find((t) => t.id === value)?.id ?? DEFAULT_THEME;
}

export function isLightTheme(id: ThemeId): boolean {
    return THEMES.find((t) => t.id === id)?.light ?? false;
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
