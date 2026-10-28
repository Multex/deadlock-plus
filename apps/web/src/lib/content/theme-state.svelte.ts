import {
    DEFAULT_THEME,
    applyTheme,
    effectsOn,
    loadEffects,
    loadTheme,
    saveEffects,
    saveTheme,
    saveVariant,
    storedVariant,
    themeVariantAttr,
    type ThemeId,
} from "./themes";

/** The visitor's theme, flavour and effects, shared by the footer picker and the page backdrop. Browser only. */
class ThemeState {
    theme = $state<ThemeId>(DEFAULT_THEME);
    /** The flavour last picked; kept while another theme is in use. */
    picked = $state<string | undefined>(undefined);
    /** The visitor's own effects choice; null until they make one. */
    choice = $state<boolean | null>(null);
    /** Whether the screen is wide enough to run effects by default. */
    wide = $state(false);
    #loaded = false;

    /** The flavour the theme is drawn in; none for a theme without flavours. */
    readonly variant = $derived(themeVariantAttr(this.theme, this.picked));
    readonly effects = $derived(effectsOn(this.choice, this.wide));

    load(): void {
        if (this.#loaded) return;
        this.#loaded = true;
        this.theme = loadTheme(() => localStorage);
        this.picked = storedVariant(() => localStorage);
        this.choice = loadEffects(() => localStorage);
    }

    pick(id: ThemeId): void {
        this.theme = id;
        this.#apply();
        saveTheme(() => localStorage, id);
    }

    pickVariant(variant: string): void {
        this.picked = variant;
        this.#apply();
        saveVariant(() => localStorage, variant);
    }

    setEffects(on: boolean): void {
        this.choice = on;
        saveEffects(() => localStorage, on);
    }

    #apply(): void {
        applyTheme(
            {
                root: document.documentElement,
                meta: document.querySelector<HTMLMetaElement>('meta[name="theme-color"]'),
            },
            this.theme,
            this.variant,
        );
    }
}

export const themeState = new ThemeState();
