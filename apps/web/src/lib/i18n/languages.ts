export interface Language {
    code: string;
    /** The language written in itself, so it stays readable whatever the page's language is. */
    name: string;
}

// Written out rather than read from Intl.DisplayNames, whose wording differs between the server and each browser.
export const LANGUAGES: readonly Language[] = [
    { code: "en", name: "English" },
    { code: "af", name: "Afrikaans" },
    { code: "cs", name: "Čeština" },
    { code: "de", name: "Deutsch" },
    { code: "es", name: "Español" },
    { code: "fr", name: "Français" },
    { code: "hu", name: "Magyar" },
    { code: "id", name: "Bahasa Indonesia" },
    { code: "it", name: "Italiano" },
    { code: "ja", name: "日本語" },
    { code: "ko", name: "한국어" },
    { code: "pl", name: "Polski" },
    { code: "pt", name: "Português" },
    { code: "pt-BR", name: "Português (Brasil)" },
    { code: "ru", name: "Русский" },
    { code: "th", name: "ไทย" },
    { code: "tr", name: "Türkçe" },
    { code: "uk", name: "Українська" },
    { code: "zh-CN", name: "简体中文" },
    { code: "zh-TW", name: "繁體中文" },
];

export function languageName(code: string): string {
    return LANGUAGES.find((language) => language.code === code)?.name ?? code;
}
