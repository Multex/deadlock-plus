import { THEMES, themeKey, type Theme } from "./themes";

export const themePath = (id: string): string => `/themes/${id}`;

/** The gallery, then every theme's own page. */
export const THEME_PAGES: readonly string[] = ["/themes", ...THEMES.map((theme) => themePath(theme.id))];

/** The picture shown when a link to the theme's page is shared, made by `scripts/og.mjs`. */
export const themeOgImage = (id: string): string => `/og/themes/${id}.jpg`;

export function themeById(id: string): Theme | undefined {
    return THEMES.find((theme) => theme.id === id);
}

const EFFECTS = "themes_page.effects";

/** The catalog keys naming a theme's effects: one per layer, or one line for effects that come as one piece. */
export function themeEffects(theme: Theme): string[] {
    if (!theme.effects) return [];
    const key = `${EFFECTS}.${themeKey(theme.id)}`;
    return theme.layers.length ? theme.layers.map((layer) => `${key}.${layer}`) : [key];
}
