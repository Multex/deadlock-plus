import { WEB_LOCALES } from "@deadlock-plus/links";
import { DEFAULT_LOCALE } from "./core";

const SITE_LOCALES: readonly string[] = [DEFAULT_LOCALE, ...WEB_LOCALES];

export const DISMISSED_KEY = "language-suggestion-dismissed";

// Browsers send script tags (zh-Hant) or regions (zh-HK) where the site only knows zh-CN and zh-TW.
function canonical(tag: string): string {
    const [base = "", ...rest] = tag.split("-");
    if (base.toLowerCase() !== "zh") return tag;
    return rest.some((part) => /^(hant|tw|hk|mo)$/i.test(part)) ? "zh-TW" : "zh-CN";
}

/** The first of the browser's languages the site has pages in, matched exactly and then by base language. */
export function browserLocale(languages: readonly string[]): string | null {
    for (const language of languages) {
        const wanted = canonical(language);
        const exact = SITE_LOCALES.find((locale) => locale.toLowerCase() === wanted.toLowerCase());
        if (exact) return exact;
        const base = wanted.split("-")[0]?.toLowerCase();
        if (base && SITE_LOCALES.includes(base)) return base;
    }
    return null;
}

/** The language to offer the visitor, or null when the page is already in it, the site lacks it, or it was dismissed. */
export function suggestedLocale(page: string, languages: readonly string[], dismissed: boolean): string | null {
    if (dismissed) return null;
    const wanted = browserLocale(languages);
    return wanted && wanted !== page ? wanted : null;
}

// Takes a getter because reading `localStorage` itself throws where the browser blocks site data.
export function isSuggestionDismissed(storage: () => Pick<Storage, "getItem">): boolean {
    try {
        return storage().getItem(DISMISSED_KEY) === "1";
    } catch {
        return false;
    }
}

export function dismissSuggestion(storage: () => Pick<Storage, "setItem">): void {
    try {
        storage().setItem(DISMISSED_KEY, "1");
    } catch {
        // The banner still closes on this page; it just comes back on the next one.
    }
}
