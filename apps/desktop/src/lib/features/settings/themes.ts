import { t } from "$lib/core/i18n.svelte";
import { THEMES as THEME_DATA, resolveTheme, themeSwatch, type ThemeId } from "@deadlock-plus/ui/themes";

export { DEFAULT_THEME, isLightTheme, resolveTheme, type ThemeId } from "@deadlock-plus/ui/themes";

export interface Theme {
    id: ThemeId;
    label: string;
    description: string;
    swatch: [string, string, string, string];
    effects: { id: string; label: string }[];
    source?: { url: string; label: string };
    customAccent: boolean;
    /** Proper nouns from the theme's source, so they stay untranslated. */
    variants: { id: string; name: string }[];
    accents: { id: string; name: string }[];
    /** What the theme's source calls its variants and accents; read only for a theme that has them. */
    variantLabel: string;
    accentLabel: string;
}

const capitalised = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

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
        effects: theme.effects.map((id) => ({
            id,
            get label() {
                return t(`settings.themes.${key}.effects.${id}`);
            },
        })),
        source: theme.source
            ? {
                  url: theme.source,
                  get label() {
                      return t(`settings.themes.${key}.source`);
                  },
              }
            : undefined,
        customAccent: theme.customAccent,
        variants: theme.variants.map((v) => ({ id: v.id, name: v.name })),
        accents: Object.keys(theme.variants[0]?.accents ?? {}).map((id) => ({ id, name: capitalised(id) })),
        get variantLabel() {
            return t(`settings.themes.${key}.variant`);
        },
        get accentLabel() {
            return t(`settings.themes.${key}.accent`);
        },
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
