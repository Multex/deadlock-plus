import { describe, expect, it } from "vitest";
import { browserLocale, dismissSuggestion, isSuggestionDismissed, suggestedLocale } from "./suggest";

describe("browserLocale", () => {
    it.each([
        [["de-DE", "de", "en"], "de"],
        [["pt-BR"], "pt-BR"],
        [["pt-PT"], "pt"],
        [["es-419"], "es"],
        [["zh-Hant-HK"], "zh-TW"],
        [["zh"], "zh-CN"],
        [["en-US", "de"], "en"],
        [["nl-NL", "fr-BE"], "fr"],
        [["nl-NL"], null],
        [[], null],
    ])("reads %j as %s", (languages, locale) => {
        expect(browserLocale(languages)).toBe(locale);
    });
});

describe("suggestedLocale", () => {
    it("suggests the browser's language when the page is in another one", () => {
        expect(suggestedLocale("en", ["de-DE", "en"], false)).toBe("de");
        expect(suggestedLocale("de", ["en-GB"], false)).toBe("en");
    });

    it("stays quiet when the page is already in the browser's language", () => {
        expect(suggestedLocale("de", ["de-AT"], false)).toBeNull();
        expect(suggestedLocale("en", ["en-US", "de"], false)).toBeNull();
    });

    it("stays quiet when the site has no page in the browser's language", () => {
        expect(suggestedLocale("en", ["nl-NL"], false)).toBeNull();
    });

    it("stays quiet once the visitor dismissed it", () => {
        expect(suggestedLocale("en", ["de-DE"], true)).toBeNull();
    });
});

describe("dismissal", () => {
    function fakeStorage() {
        const data = new Map<string, string>();
        return {
            getItem: (key: string) => data.get(key) ?? null,
            setItem: (key: string, v: string) => void data.set(key, v),
        };
    }
    const blocked = () => {
        throw new Error("SecurityError");
    };

    it("is remembered", () => {
        const storage = fakeStorage();
        expect(isSuggestionDismissed(() => storage)).toBe(false);
        dismissSuggestion(() => storage);
        expect(isSuggestionDismissed(() => storage)).toBe(true);
    });

    it("survives a browser that blocks storage", () => {
        expect(isSuggestionDismissed(blocked)).toBe(false);
        expect(() => dismissSuggestion(blocked)).not.toThrow();
    });
});
