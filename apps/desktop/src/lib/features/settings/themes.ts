import { t } from "$lib/core/i18n.svelte";
import { THEMES as THEME_DATA, resolveTheme, themeSwatch, type ThemeId } from "@deadlock-plus/ui/themes";

export { DEFAULT_THEME, isLightTheme, resolveTheme, type ThemeId } from "@deadlock-plus/ui/themes";

export interface Theme {
    id: ThemeId;
    label: string;
    description: string;
    swatch: [string, string, string, string];
}

export const THEMES: Theme[] = THEME_DATA.map((theme) => {
    const key = theme.id.replaceAll("-", "_");
    return {
        id: theme.id,
        get label() {
            return t(`settings.themes.${key}.label`);
        },
        get description() {
            return t(`settings.themes.${key}.description`);
        },
        swatch: themeSwatch(theme),
    };
});

/** The main window sets `data-theme` before the page loads, so settings start from the saved theme, not the default. */
export function initialTheme(root: { dataset: Record<string, string | undefined> } | undefined): ThemeId {
    return resolveTheme(root?.dataset.theme);
}

export type MotionPreference = "system" | "reduce" | "full";

export function resolveMotionPreference(value: unknown): MotionPreference {
    return value === "reduce" || value === "full" || value === "system" ? value : "system";
}

export function resolveReducedMotion(pref: MotionPreference, osPrefersReduced: boolean): boolean {
    if (pref === "system") return osPrefersReduced;
    return pref === "reduce";
}
