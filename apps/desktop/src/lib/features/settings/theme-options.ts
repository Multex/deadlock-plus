import { MAX_CHROMA, accentTokens, namedAccentTokens, type Accent } from "@deadlock-plus/ui/accent";
import { THEMES, resolveVariant, type Theme, type ThemeId } from "@deadlock-plus/ui/themes";

export type { Accent };

/**
 * What a user changed on a theme: the effect layers they turned off, an accent of their own, and for a theme with
 * variants, the variant and named accent picked when they differ from the theme's defaults.
 */
export interface ThemeOption {
    off?: string[];
    accent?: Accent;
    variant?: string;
    namedAccent?: string;
}

/** Only themes with a change are kept, so the defaults never get written down. */
export type ThemeOptions = Record<ThemeId, ThemeOption>;

const themeOf = (id: ThemeId): Theme | undefined => THEMES.find((t) => t.id === id);

function accent(value: unknown): Accent | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const { hue, chroma, lightness } = value as Record<string, unknown>;
    if (typeof hue !== "number" || typeof chroma !== "number" || !Number.isFinite(hue) || !Number.isFinite(chroma)) {
        return undefined;
    }
    const picked: Accent = { hue: ((hue % 360) + 360) % 360, chroma: Math.min(MAX_CHROMA, Math.max(0, chroma)) };
    if (typeof lightness === "number" && Number.isFinite(lightness))
        picked.lightness = Math.min(1, Math.max(0, lightness));
    return picked;
}

/** A variant the theme has, other than its default. */
function variant(theme: Theme | undefined, value: unknown): string | undefined {
    if (!theme || typeof value !== "string" || !theme.variants.some((v) => v.id === value)) return undefined;
    return value === theme.defaultVariant ? undefined : value;
}

/** A named accent the theme offers, other than its default. */
function namedAccent(theme: Theme | undefined, value: unknown): string | undefined {
    if (!theme || typeof value !== "string" || value === theme.defaultAccent) return undefined;
    return theme.variants[0]?.accents[value] ? value : undefined;
}

function tidy(option: ThemeOption): ThemeOption | undefined {
    const kept: ThemeOption = {};
    if (option.off?.length) kept.off = option.off;
    if (option.accent) kept.accent = option.accent;
    if (option.variant) kept.variant = option.variant;
    if (option.namedAccent) kept.namedAccent = option.namedAccent;
    return Object.keys(kept).length ? kept : undefined;
}

function put(options: ThemeOptions, theme: ThemeId, option: ThemeOption): ThemeOptions {
    const { [theme]: _, ...rest } = options;
    const kept = tidy(option);
    return kept ? { ...rest, [theme]: kept } : rest;
}

export function resolveThemeOptions(stored: unknown): ThemeOptions {
    if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return {};
    let options: ThemeOptions = {};
    for (const theme of THEMES) {
        const saved = (stored as Record<string, unknown>)[theme.id];
        if (typeof saved !== "object" || saved === null) continue;
        const { off, accent: picked, variant: flavour, namedAccent: named } = saved as Record<string, unknown>;
        options = put(options, theme.id, {
            off: Array.isArray(off) ? theme.effects.filter((layer) => off.includes(layer)) : undefined,
            accent: theme.customAccent ? accent(picked) : undefined,
            variant: variant(theme, flavour),
            namedAccent: namedAccent(theme, named),
        });
    }
    return options;
}

/**
 * The main window sets `data-theme-variant` before the page loads, so the options start from that variant
 * instead of flashing the default one until the stored options arrive.
 */
export function initialThemeOptions(root: { dataset: Record<string, string | undefined> } | undefined): ThemeOptions {
    const theme = root?.dataset.theme;
    if (!theme) return {};
    return put({}, theme, { variant: variant(themeOf(theme), root.dataset.themeVariant) });
}

/** Each of the theme's layers and whether it is on. */
export function layersOf(options: ThemeOptions, theme: ThemeId): Record<string, boolean> {
    const off = options[theme]?.off ?? [];
    const layers = themeOf(theme)?.effects ?? [];
    return Object.fromEntries(layers.map((layer) => [layer, !off.includes(layer)]));
}

export function accentOf(options: ThemeOptions, theme: ThemeId): Accent | null {
    return options[theme]?.accent ?? null;
}

/** The variant the theme is drawn in; none for a theme without variants. */
export function variantOf(options: ThemeOptions, theme: ThemeId): string | undefined {
    const data = themeOf(theme);
    return data ? resolveVariant(data, options[theme]?.variant) : undefined;
}

/** The named accent the theme is drawn with; none for a theme without named accents. */
export function namedAccentOf(options: ThemeOptions, theme: ThemeId): string | undefined {
    return options[theme]?.namedAccent ?? themeOf(theme)?.defaultAccent;
}

export function withLayer(options: ThemeOptions, theme: ThemeId, layer: string, on: boolean): ThemeOptions {
    const off = (options[theme]?.off ?? []).filter((l) => l !== layer);
    return put(options, theme, { ...options[theme], off: on ? off : [...off, layer] });
}

export function withAccent(options: ThemeOptions, theme: ThemeId, picked: Accent | null): ThemeOptions {
    return put(options, theme, { ...options[theme], accent: picked ? accent(picked) : undefined });
}

export function withVariant(options: ThemeOptions, theme: ThemeId, picked: string): ThemeOptions {
    return put(options, theme, { ...options[theme], variant: variant(themeOf(theme), picked) });
}

export function withNamedAccent(options: ThemeOptions, theme: ThemeId, picked: string): ThemeOptions {
    return put(options, theme, { ...options[theme], namedAccent: namedAccent(themeOf(theme), picked) });
}

/** The CSS variables an accent overrides on `<html>`; none when there is no accent or the theme takes none. */
export function accentStyle(theme: ThemeId, picked: Accent | null): Record<string, string> {
    const data = themeOf(theme);
    if (!picked || !data?.customAccent) return {};
    return Object.fromEntries(Object.entries(accentTokens(data, picked)).map(([name, value]) => [`--${name}`, value]));
}

/** The CSS variables a named accent other than the default overrides on `<html>`, in the variant picked. */
export function namedAccentStyle(options: ThemeOptions, theme: ThemeId): Record<string, string> {
    const data = themeOf(theme);
    const picked = options[theme]?.namedAccent;
    const tokens = data && picked ? namedAccentTokens(data, variantOf(options, theme), picked) : null;
    return tokens ? Object.fromEntries(Object.entries(tokens).map(([name, value]) => [`--${name}`, value])) : {};
}
