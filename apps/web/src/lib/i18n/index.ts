import { getContext, setContext } from "svelte";
import error from "virtual:en/error";
import footer from "virtual:en/footer";
import language from "virtual:en/language";
import nav from "virtual:en/nav";
import shot from "virtual:en/shot";
import site from "virtual:en/site";
import themes from "virtual:en/themes";
import { createTranslator, type Catalog, type Translator } from "./core";

export { around, type Catalog, type Translator } from "./core";

/** The English copy every page shows: the layout, the language banner, the screenshot viewer and the error page. */
export const en: Catalog = { ...error, ...footer, ...language, ...nav, ...shot, ...site, ...themes };

export interface I18nContext {
    locale: string;
    /** The page's language and its base language. English is added by each page. */
    catalogs: Record<string, Catalog>;
}

const KEY = Symbol("i18n");
const ENGLISH_PAGE: I18nContext = { locale: "en", catalogs: {} };

/** Hands the layout's language to every component below it, following it if the layout's data changes. */
export function provideI18n(current: () => I18nContext): void {
    setContext(KEY, current);
}

/**
 * A translator for the page's language, falling back to English. `english` adds the page's own English namespaces
 * to the shared ones. Without a layout, as in a test that renders a page on its own, the page is English.
 */
export function useI18n(...english: Catalog[]): Translator {
    const context = getContext<(() => I18nContext) | undefined>(KEY) ?? (() => ENGLISH_PAGE);
    const fallback: Catalog = Object.assign({}, en, ...english);
    let cached: { from: I18nContext; translator: Translator } | undefined;
    const current = () => {
        const from = context();
        if (cached?.from !== from) {
            cached = { from, translator: createTranslator(from.locale, { ...from.catalogs, en: fallback }) };
        }
        return cached.translator;
    };
    return {
        get locale() {
            return current().locale;
        },
        t: (key, params) => current().t(key, params),
        tn: (key, count, params) => current().tn(key, count, params),
    };
}
