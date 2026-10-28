import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { en, i18n, lookup, SUPPORTED_LOCALES, t, type Catalog } from "./i18n.svelte";

const englishAreas = import.meta.glob<Catalog>(
    ["../../../../../locales/*/en.json", "!../../../../../locales/dispatch/*.json"],
    { eager: true, import: "default" },
);
const allEnglishAreas = import.meta.glob("../../../../../locales/*/en.json");
const russianAreas = import.meta.glob<Catalog>("../../../../../locales/*/ru.json", { eager: true, import: "default" });

const areaOf = (path: string): string => path.split("/").at(-2) ?? path;

function leaves(node: Catalog, prefix = ""): [string, string][] {
    return Object.entries(node).flatMap(([name, value]) => {
        const key = prefix ? `${prefix}.${name}` : name;
        return typeof value === "string" ? [[key, value] as [string, string]] : leaves(value, key);
    });
}

function russianArea(area: string): Catalog {
    const entry = Object.entries(russianAreas).find(([path]) => areaOf(path) === area);
    if (!entry) throw new Error(`no ru file for ${area}`);
    return entry[1];
}

describe("locale areas", () => {
    beforeEach(() => i18n.preload(["ru"]));
    afterEach(() => i18n.reset({ en }, "en"));

    it("ships one English file per app area, with Dispatch as its own area", () => {
        expect(Object.keys(allEnglishAreas).map(areaOf).sort()).toEqual([
            "app",
            "builds",
            "dispatch",
            "live",
            "matches",
            "settings",
            "tools",
        ]);
    });

    it("keeps every area but Dispatch in the startup catalog", () => {
        const startup = Object.values(englishAreas).flatMap((catalog) => Object.keys(catalog));
        expect(Object.keys(en).sort()).toEqual(startup.sort());
        expect(en.dispatch).toBeUndefined();
    });

    it("does not load the translator notes as a locale", () => {
        expect(SUPPORTED_LOCALES.filter((code) => code.includes("notes"))).toEqual([]);
    });

    it("resolves an English key from every area", () => {
        i18n.reset({ en }, "en");
        for (const [path, catalog] of Object.entries(englishAreas)) {
            const [key, text] = leaves(catalog)[0];
            expect(t(key), areaOf(path)).toBe(text);
        }
    });

    it("resolves a Russian key from every area", () => {
        i18n.setLocale("ru");
        for (const [path, catalog] of Object.entries(englishAreas)) {
            const russian = russianArea(areaOf(path));
            const found = leaves(catalog).find(([key]) => lookup(russian, key) !== undefined);
            if (!found) throw new Error(`no Russian text in ${areaOf(path)}`);
            expect(t(found[0]), areaOf(path)).toBe(lookup(russian, found[0]));
        }
    });

    it("falls back to English for a namespace a locale's area lacks", () => {
        const { live: _dropped, ...rest } = i18n.catalogs.ru;
        i18n.reset({ en, ru: rest }, "ru");
        const [liveKey, liveText] = leaves(en.live as Catalog, "live")[0];
        expect(t(liveKey)).toBe(liveText);
        const [settingsKey] = leaves(russianArea("settings")).filter(([, text]) => text.trim() !== "")[0];
        expect(t(settingsKey)).toBe(lookup(russianArea("settings"), settingsKey));
        expect(t(settingsKey)).not.toBe(lookup(en, settingsKey));
    });
});
