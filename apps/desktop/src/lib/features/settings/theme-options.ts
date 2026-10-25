import { MAX_CHROMA, accentTokens, type Accent } from "@deadlock-plus/ui/accent";
import { THEMES, type ThemeId } from "@deadlock-plus/ui/themes";

export type { Accent };

/** What a user changed on a theme: the effect layers they turned off and an accent of their own. */
export interface ThemeOption {
    off?: string[];
    accent?: Accent;
}

/** Only themes with a change are kept, so the defaults never get written down. */
export type ThemeOptions = Record<ThemeId, ThemeOption>;

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

function tidy(option: ThemeOption): ThemeOption | undefined {
    const kept: ThemeOption = {};
    if (option.off?.length) kept.off = option.off;
    if (option.accent) kept.accent = option.accent;
    return kept.off || kept.accent ? kept : undefined;
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
        const { off, accent: picked } = saved as Record<string, unknown>;
        options = put(options, theme.id, {
            off: Array.isArray(off) ? theme.effects.filter((layer) => off.includes(layer)) : undefined,
            accent: theme.customAccent ? accent(picked) : undefined,
        });
    }
    return options;
}

/** Each of the theme's layers and whether it is on. */
export function layersOf(options: ThemeOptions, theme: ThemeId): Record<string, boolean> {
    const off = options[theme]?.off ?? [];
    const layers = THEMES.find((t) => t.id === theme)?.effects ?? [];
    return Object.fromEntries(layers.map((layer) => [layer, !off.includes(layer)]));
}

export function accentOf(options: ThemeOptions, theme: ThemeId): Accent | null {
    return options[theme]?.accent ?? null;
}

export function withLayer(options: ThemeOptions, theme: ThemeId, layer: string, on: boolean): ThemeOptions {
    const off = (options[theme]?.off ?? []).filter((l) => l !== layer);
    return put(options, theme, { ...options[theme], off: on ? off : [...off, layer] });
}

export function withAccent(options: ThemeOptions, theme: ThemeId, picked: Accent | null): ThemeOptions {
    return put(options, theme, { ...options[theme], accent: picked ? accent(picked) : undefined });
}

/** The CSS variables an accent overrides on `<html>`; none when there is no accent or the theme takes none. */
export function accentStyle(theme: ThemeId, picked: Accent | null): Record<string, string> {
    const data = THEMES.find((t) => t.id === theme);
    if (!picked || !data?.customAccent) return {};
    return Object.fromEntries(Object.entries(accentTokens(data, picked)).map(([name, value]) => [`--${name}`, value]));
}
