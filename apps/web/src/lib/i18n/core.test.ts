import { describe, expect, it } from "vitest";
import { around, createTranslator, interpolate, lookup } from "./core";

const en = {
    nav: { features: "Features", greeting: "Hello, {name}" },
    count: { shots_one: "{count} screenshot", shots_other: "{count} screenshots" },
};

describe("lookup", () => {
    it("walks a dotted key into nested namespaces", () => {
        expect(lookup(en, "nav.features")).toBe("Features");
    });

    it("treats a missing, partial or blank key as absent", () => {
        expect(lookup(en, "nav.missing")).toBeUndefined();
        expect(lookup(en, "nav")).toBeUndefined();
        expect(lookup({ nav: { features: "  " } }, "nav.features")).toBeUndefined();
    });
});

describe("interpolate", () => {
    it("fills named holes and leaves unknown ones as they are", () => {
        expect(interpolate("Hello, {name} {other}", { name: "Sam" })).toBe("Hello, Sam {other}");
    });
});

describe("createTranslator", () => {
    it("reads the page's locale first", () => {
        const { t } = createTranslator("de", { en, de: { nav: { features: "Funktionen" } } });
        expect(t("nav.features")).toBe("Funktionen");
    });

    it("falls back to English per key, so an untranslated string still reads", () => {
        const { t } = createTranslator("de", { en, de: { nav: { features: "" } } });
        expect(t("nav.features")).toBe("Features");
        expect(t("nav.greeting", { name: "Sam" })).toBe("Hello, Sam");
    });

    it("tries the base language before English", () => {
        const { t } = createTranslator("pt-BR", { en, pt: { nav: { features: "Recursos" } } });
        expect(t("nav.features")).toBe("Recursos");
    });

    it("shows the key when no catalog has it", () => {
        expect(createTranslator("en", { en }).t("nav.nope")).toBe("nav.nope");
    });

    it("picks the plural form the locale's rules ask for", () => {
        const { tn } = createTranslator("en", { en });
        expect(tn("count.shots", 1)).toBe("1 screenshot");
        expect(tn("count.shots", 1200)).toBe("1,200 screenshots");
    });

    it("falls back to the other form when a locale has no form for the category", () => {
        const ru = { count: { shots_other: "{count} скриншотов" } };
        expect(createTranslator("ru", { en, ru }).tn("count.shots", 3)).toBe("3 скриншотов");
    });
});

describe("around", () => {
    it("splits a template at a named hole, so markup can sit in it", () => {
        expect(around("Choose {yes}. Then go on.", "yes")).toEqual(["Choose ", ". Then go on."]);
    });

    it("keeps a translation that drops the hole whole, before the markup", () => {
        expect(around("Wähle Ja.", "yes")).toEqual(["Wähle Ja.", ""]);
    });
});
