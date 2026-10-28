import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_LINKS, RESERVED_PATHS, WEB_LOCALES, parseLinks } from "@deadlock-plus/links";
import { reroute } from "../../hooks";
import { alternates, languageHref, localeOf, localizedHref, unlocalizedPath } from "./routes";

const LOCALE_FILES = readdirSync(fileURLToPath(new URL("../../../../../locales/web", import.meta.url)))
    .filter((name) => name.endsWith(".json") && !name.endsWith(".notes.json"))
    .map((name) => name.replace(/\.json$/, ""))
    .filter((name) => name !== "en");

const rerouted = (path: string) => reroute({ url: new URL(`https://deadlockplus.app${path}`), fetch });

describe("web locales", () => {
    it("serves every language the catalog folder holds", () => {
        expect([...WEB_LOCALES].sort()).toEqual(LOCALE_FILES.sort());
        expect(WEB_LOCALES).toEqual(expect.arrayContaining(["de", "pt-BR", "zh-TW"]));
    });
});

describe("localeOf", () => {
    it.each([
        ["/", "en"],
        ["/features", "en"],
        ["/de", "de"],
        ["/de/features", "de"],
        ["/pt-BR/faq", "pt-BR"],
        ["/de/no-such-page", "de"],
        ["/xx/features", "en"],
        ["/pt-br/faq", "en"],
    ])("reads %s as %s", (path, locale) => {
        expect(localeOf(path)).toBe(locale);
    });
});

describe("reroute", () => {
    it.each([
        ["/de", "/"],
        ["/de/features", "/features"],
        ["/pt-BR/faq", "/faq"],
        ["/zh-TW/download", "/download"],
        ["/de/themes", "/themes"],
        ["/ja/themes/nightshift", "/themes/nightshift"],
        ["/pt-BR/themes/pretty-in-pink", "/themes/pretty-in-pink"],
    ])("serves %s from the English route %s", (path, route) => {
        expect(rerouted(path)).toBe(route);
    });

    it("leaves English and the English-only pages alone", () => {
        for (const path of ["/", "/features", "/privacy", "/de/privacy", "/de/transparency", "/de/og"]) {
            expect(rerouted(path), path).toBeUndefined();
        }
    });

    it("leaves a path that only starts like a theme page alone", () => {
        for (const path of ["/de/themes/", "/de/themes/nightshift/extra", "/de/themes/Night_Shift", "/de/themesx"]) {
            expect(rerouted(path), path).toBeUndefined();
        }
    });

    it("never hands a localized path to the landing redirect", () => {
        expect(rerouted("/de/tt")).toBeUndefined();
        expect(rerouted("/de/discord")).toBeUndefined();
    });
});

describe("a locale code and a [ref] landing path", () => {
    it("can never be the same name", () => {
        for (const locale of WEB_LOCALES) expect(RESERVED_PATHS, locale).toContain(locale.toLowerCase());
    });

    it("refuses a stored landing path named after a locale", () => {
        const table = (path: string) =>
            JSON.stringify({ invites: DEFAULT_LINKS.invites, landings: [{ path, ref: "website" }] });
        expect(parseLinks(table("promo"))).not.toBeNull();
        expect(parseLinks(table("de"))).toBeNull();
        expect(parseLinks(table("pt-br"))).toBeNull();
    });

    it("sends the bare locale home in its language, not to the redirect", () => {
        expect(rerouted("/de")).toBe("/");
    });
});

describe("localizedHref", () => {
    it("prefixes a localized page with the locale and keeps its query and hash", () => {
        expect(localizedHref("/", "de")).toBe("/de");
        expect(localizedHref("/features#stats", "de")).toBe("/de/features#stats");
        expect(localizedHref("/download?ref=tt#linux", "pt-BR")).toBe("/pt-BR/download?ref=tt#linux");
    });

    it("prefixes the theme gallery and each theme's page", () => {
        expect(localizedHref("/themes", "de")).toBe("/de/themes");
        expect(localizedHref("/themes/flint-snow?ref=tt", "de")).toBe("/de/themes/flint-snow?ref=tt");
    });

    it("keeps English, English-only pages and other sites as they are", () => {
        expect(localizedHref("/features", "en")).toBe("/features");
        expect(localizedHref("/privacy", "de")).toBe("/privacy");
        expect(localizedHref("/transparency?ref=tt", "de")).toBe("/transparency?ref=tt");
        expect(localizedHref("/discord/website", "de")).toBe("/discord/website");
        expect(localizedHref("https://github.com/x", "de")).toBe("https://github.com/x");
    });
});

describe("languageHref", () => {
    it("opens the same page in the other language, keeping the referral", () => {
        expect(languageHref("/features", "?ref=tt", "de")).toBe("/de/features?ref=tt");
        expect(languageHref("/de/faq", "", "pt-BR")).toBe("/pt-BR/faq");
        expect(languageHref("/de/faq", "", "en")).toBe("/faq");
        expect(languageHref("/ja", "", "en")).toBe("/");
        expect(languageHref("/de/themes/void", "", "ja")).toBe("/ja/themes/void");
    });

    it("opens the language's home page from an English-only page", () => {
        expect(languageHref("/privacy", "", "de")).toBe("/de");
        expect(languageHref("/transparency", "?ref=tt", "en")).toBe("/transparency?ref=tt");
    });
});

describe("unlocalizedPath", () => {
    it("names the English page behind a localized one", () => {
        expect(unlocalizedPath("/de")).toBe("/");
        expect(unlocalizedPath("/de/faq")).toBe("/faq");
        expect(unlocalizedPath("/faq")).toBe("/faq");
        expect(unlocalizedPath("/privacy")).toBe("/privacy");
    });
});

describe("alternates", () => {
    it("names every language's copy of a theme page", () => {
        const links = alternates("/de/themes/catppuccin");
        expect(links).toContainEqual({ hreflang: "x-default", path: "/themes/catppuccin" });
        expect(links).toContainEqual({ hreflang: "ja", path: "/ja/themes/catppuccin" });
        expect(alternates("/themes")).toContainEqual({ hreflang: "de", path: "/de/themes" });
    });
});
