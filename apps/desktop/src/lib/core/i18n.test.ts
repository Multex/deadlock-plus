import { beforeEach, describe, expect, it } from "vitest";
import { chainFor, formatNumber, i18n, interpolate, lookup, resolveLocale, t, tn, type Catalog } from "./i18n.svelte";

const en: Catalog = {
    common: { save: "Save", hello: "Hello, {name}.", nested: { deep: "Deep" } },
    replays_count_one: "{count} replay",
    replays_count_other: "{count} replays",
};
const fr: Catalog = {
    common: { save: "Enregistrer" },
    replays_count_one: "{count} replay (fr)",
    replays_count_many: "{count} replays (fr many)",
    replays_count_other: "{count} replays (fr)",
};

describe("lookup", () => {
    it("walks a dotted path", () => {
        expect(lookup(en, "common.nested.deep")).toBe("Deep");
    });

    it("returns undefined for a missing path or a non-string node", () => {
        expect(lookup(en, "common.missing")).toBeUndefined();
        expect(lookup(en, "common")).toBeUndefined();
    });

    it("treats a blank string as untranslated", () => {
        expect(lookup({ a: "", b: "  " }, "a")).toBeUndefined();
        expect(lookup({ a: "", b: "  " }, "b")).toBeUndefined();
    });
});

describe("interpolate", () => {
    it("fills placeholders", () => {
        expect(interpolate("Hi {a} and {b}", { a: "x", b: 2 })).toBe("Hi x and 2");
    });

    it("leaves an unknown placeholder visible", () => {
        expect(interpolate("Hi {a}", {})).toBe("Hi {a}");
    });
});

describe("resolveLocale", () => {
    it("uses a supported explicit code", () => {
        expect(resolveLocale("fr", "en-US", ["en", "fr"])).toBe("fr");
    });

    it("follows the system language by base code", () => {
        expect(resolveLocale("system", "fr-CA", ["en", "fr"])).toBe("fr");
    });

    it("falls back to en when nothing matches", () => {
        expect(resolveLocale("system", "de-DE", ["en", "fr"])).toBe("en");
        expect(resolveLocale("zz", "en-US", ["en", "fr"])).toBe("en");
    });

    it("maps Chinese system languages to the simplified or traditional catalog", () => {
        const supported = ["en", "zh-CN", "zh-TW"];
        for (const tag of ["zh", "zh-CN", "zh-SG", "zh-Hans", "zh-Hans-CN"])
            expect(resolveLocale("system", tag, supported)).toBe("zh-CN");
        for (const tag of ["zh-TW", "zh-HK", "zh-MO", "zh-Hant", "zh-Hant-TW"])
            expect(resolveLocale("system", tag, supported)).toBe("zh-TW");
    });

    it("keeps Portuguese regions on their own catalog", () => {
        expect(resolveLocale("system", "pt-BR", ["en", "pt", "pt-BR"])).toBe("pt-BR");
        expect(resolveLocale("system", "pt-PT", ["en", "pt", "pt-BR"])).toBe("pt");
    });
});

describe("chainFor", () => {
    it("orders exact locale, base language, then en", () => {
        const all = { en, fr, "fr-CA": {} as Catalog };
        expect(chainFor("fr-CA", all)).toEqual([all["fr-CA"], fr, en]);
    });

    it("does not repeat en", () => {
        expect(chainFor("en", { en })).toEqual([en]);
    });
});

describe("t and tn", () => {
    beforeEach(() => {
        i18n.reset({ en, fr }, "en");
    });

    it("translates and interpolates", () => {
        expect(t("common.hello", { name: "Deftu" })).toBe("Hello, Deftu.");
    });

    it("falls back to en for a key the locale lacks", () => {
        i18n.reset({ en, fr }, "fr");
        expect(t("common.save")).toBe("Enregistrer");
        expect(t("common.hello", { name: "A" })).toBe("Hello, A.");
    });

    it("returns the key when it is missing everywhere", () => {
        expect(t("nope.nothing")).toBe("nope.nothing");
    });

    it("picks plural forms by count", () => {
        expect(tn("replays_count", 1)).toBe("1 replay");
        expect(tn("replays_count", 5)).toBe("5 replays");
        expect(tn("replays_count", 0)).toBe("0 replays");
    });

    it("falls back to _other when the exact form is absent", () => {
        i18n.reset({ en: { x_other: "{count} things" } }, "en");
        expect(tn("x", 1)).toBe("1 things");
    });

    it("uses the active locale's plural rules", () => {
        i18n.reset({ en, fr }, "fr");
        expect(tn("replays_count", 1_000_000)).toBe(`${formatNumber(1_000_000)} replays (fr many)`);
    });

    it("groups the count for the active locale", () => {
        expect(tn("replays_count", 2093)).toBe("2,093 replays");
        i18n.reset({ en, de: { replays_count_other: "{count} Replays" } }, "de");
        expect(tn("replays_count", 2093)).toBe("2.093 Replays");
    });

    it("lets a caller-supplied count win", () => {
        expect(tn("replays_count", 2093, { count: "about 2k" })).toBe("about 2k replays");
    });

    it("is reactive to the locale", () => {
        expect(t("common.save")).toBe("Save");
        i18n.setLocale("fr");
        expect(t("common.save")).toBe("Enregistrer");
    });

    it("tells listeners only when the locale actually changes", () => {
        i18n.reset({ en, fr }, "en");
        const seen: string[] = [];
        const off = i18n.onLocaleChange((l) => seen.push(l));
        i18n.setLocale("en");
        i18n.setLocale("fr");
        off();
        i18n.setLocale("en");
        expect(seen).toEqual(["fr"]);
    });
});

describe("formatting", () => {
    it("formats numbers for the active locale", () => {
        i18n.reset({ en }, "en");
        expect(formatNumber(1234.5)).toBe("1,234.5");
    });
});
