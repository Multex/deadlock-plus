import { describe, expect, it } from "vitest";
import { panoramaAlpha, panoramaColor } from "../panorama";
import {
    cardLayers,
    cardRadius,
    cardState,
    fitName,
    initials,
    NAME_LINE_HEIGHT,
    nameTone,
    oracleWidth,
    phaseWash,
    plateColor,
    romanTier,
    textureVariant,
    tierNumeral,
} from "./card";

describe("textureVariant", () => {
    it("is stable for a name and differs between names", () => {
        expect(textureVariant("Extra Regen")).toBe(textureVariant("Extra Regen"));
        expect(textureVariant("Extra Regen")).not.toBe(textureVariant("Monster Rounds"));
        expect(Number.isInteger(textureVariant(""))).toBe(true);
    });
});

describe("cardLayers", () => {
    const weapon = { slot: "weapon", tier: 2, active: false } as const;

    it("picks the slot and tier backer", () => {
        expect(cardLayers(weapon, { variant: 0 }).backer).toBe("card_backer_weapon_t2");
        expect(cardLayers({ ...weapon, slot: "spirit", tier: 4 }, { variant: 0 }).backer).toBe("card_backer_spirit_t4");
    });

    it("has no backer for tier 5, which the game draws on the plain card base", () => {
        expect(cardLayers({ ...weapon, tier: 5 }, { variant: 0 }).backer).toBeNull();
    });

    it("cycles paper textures by 3, from the first", () => {
        const paper = [0, 1, 2, 3].map((variant) => cardLayers(weapon, { variant }).paper);
        expect(paper).toEqual(["paper_texture_1", "paper_texture_2", "paper_texture_3", "paper_texture_1"]);
    });

    it("draws no paper wear, as the 1440p captures show none", () => {
        for (const tier of [1, 2, 3, 4, 5] as const) {
            expect(cardLayers({ ...weapon, tier }, { variant: 0 })).not.toHaveProperty("wear");
        }
    });

    it("drops the backer art on owned and component cards", () => {
        for (const flags of [{ owned: true }, { usedAsComponent: true }]) {
            expect(cardLayers(weapon, { variant: 0, ...flags }).backer).toBeNull();
        }
    });

    it("masks passive art only in the shop grid", () => {
        expect(cardLayers(weapon, { variant: 1, layout: "shop" }).iconMask).toBe("icon_mask_2");
        expect(cardLayers(weapon, { variant: 1, layout: "build" }).iconMask).toBeNull();
        expect(cardLayers({ ...weapon, active: true }, { variant: 1, layout: "shop" }).iconMask).toBeNull();
    });

    it("names the tier numeral, none for tier 5", () => {
        expect(cardLayers({ ...weapon, tier: 3 }, { variant: 0 }).numeral).toBe("tier_number_3");
        expect(cardLayers({ ...weapon, tier: 5 }, { variant: 0 }).numeral).toBeNull();
    });
});

describe("tierNumeral", () => {
    it("sizes the numeral at the corner's 140% ui-scale", () => {
        expect(tierNumeral(1)).toEqual({ width: 5 * 1.4, right: 4 * 1.4 });
        expect(tierNumeral(4)).toEqual({ width: 11 * 1.4, right: 1 * 1.4 });
    });
});

describe("cardRadius", () => {
    it("arches active cards in the shop and rounds one corner in build lists", () => {
        expect(cardRadius(false, "shop")).toEqual([2, 2, 2, 2]);
        expect(cardRadius(true, "shop")).toEqual([50, 50, 2, 2]);
        expect(cardRadius(true, "build")).toEqual([40, 2, 2, 2]);
        expect(cardRadius(false, "build")).toEqual([2, 2, 2, 2]);
    });
});

describe("nameTone", () => {
    it("is off-black by default", () => {
        expect(nameTone("spirit", 2, {})).toEqual({ color: "#10130d", shadow: null, italic: false, opacity: 1 });
    });

    it("gives tier 3 weapon names a warm glow", () => {
        expect(nameTone("weapon", 3, {})).toMatchObject({ color: "#000000", shadow: "#aa8470" });
        expect(nameTone("vitality", 3, {}).shadow).toBeNull();
    });

    it("lights tier 4 names per slot", () => {
        expect(nameTone("weapon", 4, {}).color).toBe("#e4c5a1");
        expect(nameTone("vitality", 4, {}).color).toBe("#c2e7cd");
        expect(nameTone("spirit", 4, {}).color).toBe("#e3d4f2");
    });

    it("dims owned and component names over the tier colours", () => {
        expect(nameTone("weapon", 3, { owned: true })).toEqual({
            color: panoramaColor("offWhite&80", "offBlack"),
            shadow: null,
            italic: false,
            opacity: 1,
        });
        expect(nameTone("weapon", 4, { usedAsComponent: true })).toEqual({
            color: "#ffefd7",
            shadow: null,
            italic: true,
            opacity: panoramaAlpha(0.5, "offWhite", "offBlack"),
        });
    });

    it("italicises disabled names", () => {
        expect(nameTone("spirit", 1, { disabled: true }).italic).toBe(true);
    });
});

describe("cardState", () => {
    it("draws a plain card at full strength", () => {
        expect(cardState({})).toEqual({
            opacity: 1,
            cardOpacity: 1,
            artBrightness: 1,
            saturation: 1,
            shadow: true,
            outline: null,
            popularity: true,
            newTag: true,
        });
    });

    it("dims owned cards and outlines them", () => {
        expect(cardState({ owned: true })).toMatchObject({
            opacity: panoramaAlpha(0.7, "offWhite", "offBlack"),
            cardOpacity: panoramaAlpha(0.5, "offWhite", "offBlack"),
            artBrightness: 1 - panoramaAlpha(0.5, "#000000", "offWhite"),
            shadow: false,
            outline: "#10130d",
            popularity: false,
            newTag: false,
        });
    });

    it("keeps component art bright", () => {
        expect(cardState({ usedAsComponent: true })).toMatchObject({
            opacity: panoramaAlpha(0.7, "offWhite", "offBlack"),
            cardOpacity: panoramaAlpha(0.5, "offWhite", "offBlack"),
            artBrightness: 1,
            outline: "#10130d",
        });
    });

    it("greys disabled cards out", () => {
        expect(cardState({ disabled: true })).toMatchObject({
            opacity: panoramaAlpha(0.2, "offWhite", "offBlack"),
            saturation: 0,
            shadow: false,
        });
    });
});

describe("oracleWidth", () => {
    it("adds glyph advances and scales with the size", () => {
        expect(oracleWidth("Escalating", 15)).toBeCloseTo(68.2, 0);
        expect(oracleWidth("Juggernaut", 30)).toBeCloseTo(2 * oracleWidth("Juggernaut", 15), 5);
        expect(oracleWidth("", 15)).toBe(0);
    });

    it("falls back to an average width for glyphs it does not know", () => {
        expect(oracleWidth("字", 10)).toBeGreaterThan(0);
    });
});

describe("fitName", () => {
    it("keeps short names at the full 15 on two lines", () => {
        expect(fitName("Extra Regen")).toEqual({ size: 15, lines: ["Extra", "Regen"] });
        expect(fitName("Grit")).toEqual({ size: 15, lines: ["Grit"] });
    });

    it("shrinks for a word wider than the name box, as the 1440p captures show", () => {
        const juggernaut = fitName("Juggernaut");
        expect(juggernaut.size).toBeLessThan(15);
        expect(juggernaut.size).toBeGreaterThan(13);
        expect(fitName("Transcendent Cooldown").size).toBeLessThan(13.5);
    });

    it("fits every word inside the width at the chosen size", () => {
        for (const name of ["Mystic Vulnerability", "High-Velocity Rounds", "Spellbreaker", "Enchanter's Emblem"]) {
            const { size } = fitName(name);
            for (const word of name.split(" ")) expect(oracleWidth(word, size)).toBeLessThanOrEqual(68.05);
        }
    });

    it("wraps onto three lines only once the size leaves room for them", () => {
        const fit = fitName("A Very Long Item Name Here");
        expect(fit.lines.length * fit.size * NAME_LINE_HEIGHT).toBeLessThanOrEqual(36);
    });

    it("spaces lines one font size apart, as the 1440p captures show (20 px at 15)", () => {
        expect(NAME_LINE_HEIGHT * 15 * (4 / 3)).toBeCloseTo(20, 0);
        // Each word takes its own line; three lines one size apart fit 36 only below 12.
        const measure = (text: string, size: number) => text.length * size * 0.5;
        expect(fitName("abcdefgh abcdefgh abcdefgh", { measure })).toEqual({
            size: 11.75,
            lines: ["abcdefgh", "abcdefgh", "abcdefgh"],
        });
    });

    it("breaks lines where the game does, at the untracked width", () => {
        expect(fitName("Veil Walker").lines).toEqual(["Veil", "Walker"]);
        expect(fitName("Burst Fire").lines).toEqual(["Burst Fire"]);
        expect(fitName("Mystic Vulnerability").lines).toEqual(["Mystic", "Vulnerability"]);
    });

    it("never goes below the minimum", () => {
        expect(fitName("Supercalifragilisticexpialidocious").size).toBe(8);
    });

    it("uses a host measurer and box when given", () => {
        const measure = (text: string, size: number) => text.length * size;
        expect(fitName("abcd", { measure, width: 40 })).toEqual({ size: 10, lines: ["abcd"] });
    });
});

describe("initials", () => {
    it("takes the first letter of the first two words", () => {
        expect(initials("Extra Regen")).toBe("ER");
        expect(initials("Hunter's Aura")).toBe("HA");
        expect(initials("grit")).toBe("G");
        expect(initials("  ")).toBe("");
    });

    it("skips leading punctuation", () => {
        expect(initials("“Quoted” Item")).toBe("QI");
    });
});

describe("romanTier", () => {
    it("writes tiers as numerals", () => {
        expect([1, 2, 3, 4, 5].map((tier) => romanTier(tier as 1 | 2 | 3 | 4 | 5))).toEqual([
            "I",
            "II",
            "III",
            "IV",
            "V",
        ]);
    });
});

describe("plateColor", () => {
    it("has a fallback tone for every slot and tier", () => {
        for (const slot of ["weapon", "vitality", "spirit"] as const) {
            for (const tier of [1, 2, 3, 4, 5] as const) expect(plateColor(slot, tier)).toMatch(/^#[0-9a-f]{6}$/);
        }
    });
});

describe("phaseWash", () => {
    it("washes early and mid phase icons, not late", () => {
        expect(phaseWash("early")).toBe("#99ffd6");
        expect(phaseWash("mid")).toBe("#b1beff");
        expect(phaseWash("late")).toBeNull();
    });
});
