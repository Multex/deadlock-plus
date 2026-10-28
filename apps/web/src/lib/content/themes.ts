import {
    DEFAULT_THEME,
    THEMES as THEME_DATA,
    chromeHex,
    oklchToHex,
    resolveTheme,
    resolveVariant,
    themeSwatch,
    themeVariant,
    type Theme as ThemeData,
    type ThemeId,
} from "@deadlock-plus/ui/themes";

export { DEFAULT_THEME, resolveTheme, type ThemeId } from "@deadlock-plus/ui/themes";

export interface ThemeVariant {
    id: string;
    /** Shown as is in every language: variants are named by their source. */
    name: string;
    chrome: string;
    swatch: [string, string, string, string];
}

export interface Theme {
    id: ThemeId;
    /** `--chrome` as sRGB hex: mobile browsers do not read `oklch()` in a theme-color tag. */
    chrome: string;
    /** Background, card, brass and primary, drawn in the picker swatch. */
    swatch: [string, string, string, string];
    /** Whether the theme draws animated decor behind the page. */
    effects: boolean;
    /** What the theme is based on, credited with a link. */
    source?: string;
    /** Empty for a theme that comes in one palette. */
    variants: ThemeVariant[];
    defaultVariant?: string;
}

export const THEME_STORAGE_KEY = "theme";
export const VARIANT_STORAGE_KEY = "theme-variant";
export const EFFECTS_STORAGE_KEY = "theme-effects";

/** Effects run by default from this width up; a phone gets them only once the visitor turns them on. */
export const WIDE_QUERY = "(min-width: 1024px)";

// Kept by hand so the page bundle never has to look at the decor modules; a test holds it to the files on disk.
const DECOR_THEMES: readonly ThemeId[] = [
    "deadlock",
    "midnight",
    "daylight",
    "nightshift",
    "deadlock-api",
    "statlocker",
    "flint-snow",
    "void",
    "deadchaps",
    "pretty-in-pink",
];

/** The theme's name under `themes.` in the catalog, which keys with underscores. */
export function themeKey(id: ThemeId): string {
    return id.replaceAll("-", "_");
}

export const THEMES: Theme[] = THEME_DATA.map((theme) => ({
    id: theme.id,
    chrome: chromeHex(theme),
    swatch: themeSwatch(theme),
    effects: DECOR_THEMES.includes(theme.id),
    source: theme.source,
    variants: theme.variants.map((v) => {
        const drawn = themeVariant(theme, v.id);
        return { id: v.id, name: v.name, chrome: chromeHex(drawn), swatch: themeSwatch(drawn) };
    }),
    defaultVariant: resolveVariant(theme, undefined),
}));

const dataOf = (id: ThemeId): ThemeData | undefined => THEME_DATA.find((t) => t.id === id);

/** The value of `data-theme-variant` for the theme: the given variant if it has it, else its default; none without variants. */
export function themeVariantAttr(id: ThemeId, variant: string | undefined): string | undefined {
    const theme = dataOf(id);
    return theme ? resolveVariant(theme, variant) : undefined;
}

/** Every token of the theme as custom properties, for a preview drawn in a theme other than the page's. */
export function themeStyle(id: ThemeId, variant?: string): string {
    const base = dataOf(id) ?? dataOf(DEFAULT_THEME);
    if (!base) return "";
    const theme = themeVariant(base, variant);
    const tokens = Object.entries(theme.tokens).map(([name, value]) => `--${name}: ${value};`);
    return [`color-scheme: ${theme.light ? "light" : "dark"};`, ...tokens].join(" ");
}

/** Effects follow the visitor's own choice; until they make one, a wide screen runs them and a phone does not. */
export function effectsOn(choice: boolean | null, wide: boolean): boolean {
    return choice ?? wide;
}

// Each takes a getter because reading `localStorage` itself throws where the browser blocks site data.
function read(storage: () => Pick<Storage, "getItem">, key: string): string | null {
    try {
        return storage().getItem(key);
    } catch {
        return null;
    }
}

function write(storage: () => Pick<Storage, "setItem">, key: string, value: string): void {
    try {
        storage().setItem(key, value);
    } catch {
        // The choice still applies to this page; it just does not carry over to the next one.
    }
}

export function loadTheme(storage: () => Pick<Storage, "getItem">): ThemeId {
    return resolveTheme(read(storage, THEME_STORAGE_KEY));
}

export function saveTheme(storage: () => Pick<Storage, "setItem">, id: ThemeId): void {
    write(storage, THEME_STORAGE_KEY, id);
}

/** The flavour last picked, whichever theme is in use, so it comes back when its theme does. */
export function storedVariant(storage: () => Pick<Storage, "getItem">): string | undefined {
    return read(storage, VARIANT_STORAGE_KEY) ?? undefined;
}

export function saveVariant(storage: () => Pick<Storage, "setItem">, variant: string): void {
    write(storage, VARIANT_STORAGE_KEY, variant);
}

/** The visitor's own choice, or null until they make one. */
export function loadEffects(storage: () => Pick<Storage, "getItem">): boolean | null {
    const stored = read(storage, EFFECTS_STORAGE_KEY);
    return stored === "on" ? true : stored === "off" ? false : null;
}

export function saveEffects(storage: () => Pick<Storage, "setItem">, on: boolean): void {
    write(storage, EFFECTS_STORAGE_KEY, on ? "on" : "off");
}

export interface ThemeTarget {
    root: { dataset: Record<string, string | undefined> };
    meta: { content: string } | null;
}

export function applyTheme(target: ThemeTarget, id: ThemeId, variant?: string): void {
    const { dataset } = target.root;
    dataset.theme = id;
    const theme = THEMES.find((t) => t.id === id);
    const drawn = themeVariantAttr(id, variant);
    if (drawn) dataset.themeVariant = drawn;
    else delete dataset.themeVariant;
    const chrome = theme?.variants.find((v) => v.id === drawn)?.chrome ?? theme?.chrome;
    if (target.meta && chrome) target.meta.content = chrome;
}

export const PREPAINT_PLACEHOLDER = "<!-- theme-prepaint -->";

/**
 * Runs before the stylesheet loads: restores the stored theme and flavour and paints its background, so a returning
 * visitor never sees the default theme flash first. A browser also tints its address bar with theme-color, so that
 * gets the theme's chrome colour instead of the brass a link preview reads. Hex throughout, for browsers without oklch.
 */
export function themePrepaint(): string {
    const scheme = (light: boolean) => (light ? "light" : "dark");
    const base = THEME_DATA.find((t) => t.id === DEFAULT_THEME);
    const rules = THEME_DATA.flatMap((theme) => {
        const selector = theme === base ? "html" : `html[data-theme="${theme.id}"]`;
        const lines = [`background: ${oklchToHex(theme.tokens.background ?? "")};`];
        if (theme === base || scheme(theme.light) !== scheme(base?.light ?? false)) {
            lines.push(`color-scheme: ${scheme(theme.light)};`);
        }
        const variants = theme.variants.map((variant) => {
            const own = [`background: ${oklchToHex(variant.tokens.background ?? "")};`];
            if (variant.light !== theme.light) own.push(`color-scheme: ${scheme(variant.light)};`);
            return `html[data-theme="${theme.id}"][data-theme-variant="${variant.id}"] { ${own.join(" ")} }`;
        });
        return [`${selector} { ${lines.join(" ")} }`, ...variants];
    });
    const chrome = JSON.stringify(Object.fromEntries(THEMES.map((t) => [t.id, t.chrome])));
    const variants = JSON.stringify(
        Object.fromEntries(
            THEMES.filter((t) => t.variants.length).map((t) => [
                t.id,
                { fallback: t.defaultVariant, chrome: Object.fromEntries(t.variants.map((v) => [v.id, v.chrome])) },
            ]),
        ),
    );
    const own = "Object.prototype.hasOwnProperty.call";
    const script = [
        "(function () {",
        `var chrome = ${chrome};`,
        `var variants = ${variants};`,
        "var theme = null;",
        "var variant = null;",
        `try { theme = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}); variant = localStorage.getItem(${JSON.stringify(VARIANT_STORAGE_KEY)}); } catch (e) {}`,
        `if (!theme || !${own}(chrome, theme)) theme = ${JSON.stringify(DEFAULT_THEME)};`,
        "var root = document.documentElement;",
        "root.dataset.theme = theme;",
        "var colour = chrome[theme];",
        `var flavours = ${own}(variants, theme) ? variants[theme] : null;`,
        "if (flavours) {",
        `if (!variant || !${own}(flavours.chrome, variant)) variant = flavours.fallback;`,
        "root.dataset.themeVariant = variant;",
        "colour = flavours.chrome[variant];",
        "}",
        "var meta = document.querySelector('meta[name=\"theme-color\"]');",
        "if (meta) meta.content = colour;",
        "})();",
    ];
    return `<style>${rules.join(" ")}</style><script>${script.join(" ")}</script>`;
}
