import { t } from "$lib/core/i18n.svelte";

export type ThemeId = "deadlock" | "midnight" | "daylight" | "contrast" | "nightshift" | "deadlock-api";

export interface Theme {
    id: ThemeId;
    label: string;
    description: string;
    light: boolean;
    /** Background, card, brass and primary, drawn in the picker swatch. */
    swatch: [string, string, string, string];
}

export const DEFAULT_THEME: ThemeId = "deadlock";

export const THEMES: Theme[] = [
    {
        id: "deadlock",
        get label() {
            return t("settings.themes.deadlock.label");
        },
        get description() {
            return t("settings.themes.deadlock.description");
        },
        light: false,
        swatch: ["oklch(0.17 0.008 70)", "oklch(0.21 0.01 70)", "oklch(0.8 0.125 82)", "oklch(0.68 0.11 155)"],
    },
    {
        id: "midnight",
        get label() {
            return t("settings.themes.midnight.label");
        },
        get description() {
            return t("settings.themes.midnight.description");
        },
        light: false,
        swatch: ["oklch(0.17 0.02 260)", "oklch(0.21 0.025 260)", "oklch(0.82 0.06 230)", "oklch(0.7 0.11 175)"],
    },
    {
        id: "daylight",
        get label() {
            return t("settings.themes.daylight.label");
        },
        get description() {
            return t("settings.themes.daylight.description");
        },
        light: true,
        swatch: ["oklch(0.97 0.012 85)", "oklch(0.99 0.006 85)", "oklch(0.6 0.12 70)", "oklch(0.5 0.12 155)"],
    },
    {
        id: "contrast",
        get label() {
            return t("settings.themes.contrast.label");
        },
        get description() {
            return t("settings.themes.contrast.description");
        },
        light: false,
        swatch: ["oklch(0 0 0)", "oklch(0.12 0 0)", "oklch(0.92 0.16 95)", "oklch(0.85 0.2 150)"],
    },
    {
        id: "nightshift",
        get label() {
            return t("settings.themes.nightshift.label");
        },
        get description() {
            return t("settings.themes.nightshift.description");
        },
        light: false,
        swatch: ["oklch(0.13 0.008 220)", "oklch(0.18 0.01 225)", "oklch(0.63 0.09 86)", "oklch(0.77 0.11 192)"],
    },
    {
        id: "deadlock-api",
        get label() {
            return t("settings.themes.deadlock_api.label");
        },
        get description() {
            return t("settings.themes.deadlock_api.description");
        },
        light: false,
        swatch: ["oklch(0.09 0.004 250)", "oklch(0.15 0.007 258)", "oklch(0.66 0.217 21)", "oklch(0.68 0.12 145)"],
    },
];

export function resolveTheme(value: unknown): ThemeId {
    return THEMES.find((t) => t.id === value)?.id ?? DEFAULT_THEME;
}

/** The main window sets `data-theme` before the page loads, so settings start from the saved theme, not the default. */
export function initialTheme(root: { dataset: Record<string, string | undefined> } | undefined): ThemeId {
    return resolveTheme(root?.dataset.theme);
}

export function isLightTheme(id: ThemeId): boolean {
    return THEMES.find((t) => t.id === id)?.light ?? false;
}

export type MotionPreference = "system" | "reduce" | "full";

export function resolveMotionPreference(value: unknown): MotionPreference {
    return value === "reduce" || value === "full" || value === "system" ? value : "system";
}

export function resolveReducedMotion(pref: MotionPreference, osPrefersReduced: boolean): boolean {
    if (pref === "system") return osPrefersReduced;
    return pref === "reduce";
}
