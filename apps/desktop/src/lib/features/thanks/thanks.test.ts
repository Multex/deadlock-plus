import { describe, expect, it } from "vitest";
import { LANGUAGES } from "$lib/features/settings/languages";
import { THANKS, donatorsOthersKey, isEmpty, parseThanks, translatorLanguages } from "./thanks";

describe("parseThanks", () => {
    it("keeps named entries and drops blank names", () => {
        const parsed = parseThanks({
            contributors: [{ name: "Ada", url: "https://github.com/ada" }, { name: "  " }],
            translators: [{ name: "Bo", languages: ["de"] }],
            donators: { names: ["Cy", ""], others: 3 },
        });
        expect(parsed.contributors).toEqual([{ name: "Ada", url: "https://github.com/ada" }]);
        expect(parsed.translators).toEqual([{ name: "Bo", languages: ["de"] }]);
        expect(parsed.donators).toEqual({ names: ["Cy"], others: 3 });
    });

    it("only keeps https links", () => {
        const parsed = parseThanks({
            contributors: [
                { name: "Ada", url: "javascript:alert(1)" },
                { name: "Bo", url: "http://example.com" },
            ],
            translators: [],
            donators: { names: [], others: 0 },
        });
        expect(parsed.contributors).toEqual([{ name: "Ada" }, { name: "Bo" }]);
    });

    it("treats a negative or fractional others count as zero or whole", () => {
        const neg = parseThanks({ contributors: [], translators: [], donators: { names: [], others: -2 } });
        const frac = parseThanks({ contributors: [], translators: [], donators: { names: [], others: 2.7 } });
        expect(neg.donators.others).toBe(0);
        expect(frac.donators.others).toBe(2);
    });
});

describe("isEmpty", () => {
    it("is true only when nobody is listed", () => {
        expect(isEmpty({ contributors: [], translators: [], donators: { names: [], others: 0 } })).toBe(true);
        expect(isEmpty({ contributors: [], translators: [], donators: { names: [], others: 1 } })).toBe(false);
    });
});

describe("donatorsOthersKey", () => {
    it("says anonymous when no donator is named", () => {
        expect(donatorsOthersKey([])).toBe("settings.thanks.anonymous");
    });

    it("says others when donators are named", () => {
        expect(donatorsOthersKey(["Cy"])).toBe("settings.thanks.others");
    });
});

describe("translatorLanguages", () => {
    it("names each language in itself, then in the given locale, and skips unknown codes", () => {
        expect(translatorLanguages({ name: "Bo", languages: ["de", "ru", "xx"] }, "en")).toEqual([
            "Deutsch (German)",
            "Русский (Russian)",
        ]);
    });

    it("localizes the bracketed name", () => {
        expect(translatorLanguages({ name: "Bo", languages: ["de"] }, "fr")).toEqual(["Deutsch (allemand)"]);
    });

    it("drops the brackets when both names are the same", () => {
        expect(translatorLanguages({ name: "Bo", languages: ["ru", "de"] }, "ru")).toEqual([
            "Русский",
            "Deutsch (немецкий)",
        ]);
    });
});

describe("bundled THANKS", () => {
    it("only names languages the app offers", () => {
        const codes = new Set(LANGUAGES.map((l) => l.code));
        for (const tr of THANKS.translators) for (const c of tr.languages) expect(codes.has(c)).toBe(true);
    });
});
