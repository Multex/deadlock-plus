import {
    DEFAULT_THEME,
    THEMES as THEME_DATA,
    chromeHex,
    oklchToHex,
    resolveTheme,
    themeSwatch,
    type ThemeId,
} from "@deadlock-plus/ui/themes";

export { DEFAULT_THEME, resolveTheme, type ThemeId } from "@deadlock-plus/ui/themes";

export interface Theme {
    id: ThemeId;
    label: string;
    /** `--chrome` as sRGB hex: mobile browsers do not read `oklch()` in a theme-color tag. */
    chrome: string;
    /** Background, card, brass and primary, drawn in the picker swatch. */
    swatch: [string, string, string, string];
}

const LABELS: Record<ThemeId, string> = {
    deadlock: "Deadlock",
    midnight: "Midnight",
    daylight: "Daylight",
    contrast: "High contrast",
    nightshift: "Nightshift",
    "deadlock-api": "Deadlock API",
    statlocker: "Statlocker",
    "flint-snow": "Flint Snow",
    void: "Void",
    deadchaps: "DeadChaps",
};

export const THEME_STORAGE_KEY = "theme";

export const THEMES: Theme[] = THEME_DATA.map((theme) => ({
    id: theme.id,
    label: LABELS[theme.id] ?? "",
    chrome: chromeHex(theme),
    swatch: themeSwatch(theme),
}));

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

export const PREPAINT_PLACEHOLDER = "<!-- theme-prepaint -->";

/**
 * Runs before the stylesheet loads: restores the stored theme and paints its background, so a returning visitor
 * never sees the default theme flash first. A browser also tints its address bar with theme-color, so that gets
 * the theme's chrome colour instead of the brass a link preview reads. Hex throughout, for browsers without oklch.
 */
export function themePrepaint(): string {
    const scheme = (light: boolean) => (light ? "light" : "dark");
    const base = THEME_DATA.find((t) => t.id === DEFAULT_THEME);
    const rules = THEME_DATA.map((theme) => {
        const selector = theme === base ? "html" : `html[data-theme="${theme.id}"]`;
        const lines = [`background: ${oklchToHex(theme.tokens.background ?? "")};`];
        if (theme === base || scheme(theme.light) !== scheme(base?.light ?? false)) {
            lines.push(`color-scheme: ${scheme(theme.light)};`);
        }
        return `${selector} { ${lines.join(" ")} }`;
    });
    const chrome = JSON.stringify(Object.fromEntries(THEMES.map((t) => [t.id, t.chrome])));
    const script = [
        "(function () {",
        `var chrome = ${chrome};`,
        "var theme = null;",
        `try { theme = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}); } catch (e) {}`,
        `if (!theme || !Object.prototype.hasOwnProperty.call(chrome, theme)) theme = ${JSON.stringify(DEFAULT_THEME)};`,
        "document.documentElement.dataset.theme = theme;",
        "var meta = document.querySelector('meta[name=\"theme-color\"]');",
        "if (meta) meta.content = chrome[theme];",
        "})();",
    ];
    return `<style>${rules.join(" ")}</style><script>${script.join(" ")}</script>`;
}
