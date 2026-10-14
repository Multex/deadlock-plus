export type ThemeId = "deadlock" | "midnight" | "daylight" | "contrast" | "nightshift" | "deadlock-api";

export interface Theme {
    id: ThemeId;
    label: string;
    /** `--chrome` as sRGB hex: mobile browsers do not read `oklch()` in a theme-color tag. */
    chrome: string;
    /** Background, card, brass and primary, drawn in the picker swatch. */
    swatch: [string, string, string, string];
}

export const DEFAULT_THEME: ThemeId = "deadlock";

export const THEME_STORAGE_KEY = "theme";

export const THEMES: Theme[] = [
    {
        id: "deadlock",
        label: "Deadlock",
        chrome: "#080605",
        swatch: ["oklch(0.17 0.008 70)", "oklch(0.21 0.01 70)", "oklch(0.8 0.125 82)", "oklch(0.68 0.11 155)"],
    },
    {
        id: "midnight",
        label: "Midnight",
        chrome: "#04060d",
        swatch: ["oklch(0.17 0.02 260)", "oklch(0.21 0.025 260)", "oklch(0.82 0.06 230)", "oklch(0.7 0.11 175)"],
    },
    {
        id: "daylight",
        label: "Daylight",
        chrome: "#ece7de",
        swatch: ["oklch(0.97 0.012 85)", "oklch(0.99 0.006 85)", "oklch(0.6 0.12 70)", "oklch(0.5 0.12 155)"],
    },
    {
        id: "contrast",
        label: "High contrast",
        chrome: "#000000",
        swatch: ["oklch(0 0 0)", "oklch(0.12 0 0)", "oklch(0.92 0.16 95)", "oklch(0.85 0.2 150)"],
    },
    {
        id: "nightshift",
        label: "Nightshift",
        chrome: "#010303",
        swatch: ["oklch(0.13 0.008 220)", "oklch(0.18 0.01 225)", "oklch(0.63 0.09 86)", "oklch(0.77 0.11 192)"],
    },
    {
        id: "deadlock-api",
        label: "Deadlock API",
        chrome: "#000000",
        swatch: ["oklch(0.09 0.004 250)", "oklch(0.15 0.007 258)", "oklch(0.66 0.217 21)", "oklch(0.68 0.12 145)"],
    },
];

export function resolveTheme(value: unknown): ThemeId {
    return THEMES.find((t) => t.id === value)?.id ?? DEFAULT_THEME;
}

// Takes a getter because reading `localStorage` itself throws where the browser blocks site data.
export function loadTheme(storage: () => Pick<Storage, "getItem">): ThemeId {
    try {
        return resolveTheme(storage().getItem(THEME_STORAGE_KEY));
    } catch {
        return DEFAULT_THEME;
    }
}

export function saveTheme(storage: () => Pick<Storage, "setItem">, id: ThemeId): void {
    try {
        storage().setItem(THEME_STORAGE_KEY, id);
    } catch {
        // The theme still applies to this page; it just does not carry over to the next one.
    }
}

export interface ThemeTarget {
    root: { dataset: Record<string, string | undefined> };
    meta: { content: string } | null;
}

export function applyTheme(target: ThemeTarget, id: ThemeId): void {
    target.root.dataset.theme = id;
    const chrome = THEMES.find((t) => t.id === id)?.chrome;
    if (target.meta && chrome) target.meta.content = chrome;
}
