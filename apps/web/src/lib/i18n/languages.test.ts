import { describe, expect, it } from "vitest";
import { WEB_LOCALES } from "@deadlock-plus/links";
import { LANGUAGES, languageName } from "./languages";

describe("LANGUAGES", () => {
    it("names English and every served locale once, English first", () => {
        expect(LANGUAGES.map((l) => l.code)).toEqual(["en", ...WEB_LOCALES]);
    });

    it("writes each language in itself, so a visitor finds theirs whatever the page's language", () => {
        expect(languageName("de")).toBe("Deutsch");
        expect(languageName("pt-BR")).toBe("Português (Brasil)");
        expect(languageName("zh-TW")).toBe("繁體中文");
    });
});
