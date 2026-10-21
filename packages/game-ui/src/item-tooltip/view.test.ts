import { describe, expect, it } from "vitest";
import { gameColors } from "../colors";
import { panoramaAlpha, panoramaColor } from "../panorama";
import {
    cellValueSize,
    cssUrl,
    headerNameSize,
    iconPaint,
    inlineAttributeStyle,
    roleColor,
    scalingArt,
    scalingColor,
    shrinkFont,
    styleVars,
    tooltipVars,
    washColor,
} from "./view";

describe("washColor", () => {
    it("resolves the base-style colour names the game's stylesheets wash icons with", () => {
        expect(washColor("spiritBrightColor")).toBe(gameColors.spiritBright);
        expect(washColor("armorColor")).toBe(gameColors.armor);
        expect(washColor("colorEnemy")).toBe(gameColors.enemy);
        expect(washColor("offWhite")).toBe(gameColors.offWhite);
        expect(washColor("spiritDarkerColor")).toBe("#362147");
    });

    it("takes hex and a Panorama alpha suffix through the alpha rule", () => {
        expect(washColor("#99f051")).toBe("#99f051");
        expect(washColor("courageBrightColor&ea")).toBe(panoramaColor("#ec9719&ea"));
    });

    it("is null for no wash and for names it does not know", () => {
        expect(washColor("none")).toBeNull();
        expect(washColor(null)).toBeNull();
        expect(washColor("notAColour")).toBeNull();
    });
});

describe("inlineAttributeStyle", () => {
    // Shaped like the host's map of `game_property_icon_art`: keyword entries carry hex from the base styles.
    const icons = {
        SpiritDamage: { url: "/a/spirit_damage.svg", wash: "#ffefd7", color: "#ce90ff" },
        PureDamage: { url: "/a/force.svg", wash: "white", color: "white" },
        Spirit: { url: "/a/spirit.svg", wash: "#ce90ff", color: "#e1a0ff&ea" },
        Curse: { url: "/a/curse.svg", wash: "#ff410d", color: null },
        tech_damage: { url: "/a/tech.svg", wash: "spiritBrightColor" },
    };

    it("draws a typed keyword with the image, wash and label colour the game's base styles give it", () => {
        expect(inlineAttributeStyle("SpiritDamage", icons)).toEqual({
            icon: "SpiritDamage",
            wash: "#ffefd7",
            color: "#ce90ff",
        });
        expect(inlineAttributeStyle("PureDamage", icons)).toEqual({
            icon: "PureDamage",
            wash: "#ffffff",
            color: "#ffffff",
        });
        expect(inlineAttributeStyle("Spirit", icons).color).toBe(panoramaColor("#e1a0ff&ea"));
    });

    it("keeps the description's colour for a keyword the game gives no label colour", () => {
        expect(inlineAttributeStyle("Curse", icons)).toEqual({ icon: "Curse", wash: "#ff410d", color: null });
    });

    it("keeps a keyword without game art semi-bold in the text colour, with no icon", () => {
        expect(inlineAttributeStyle("Fortitude", icons)).toEqual({ icon: null, wash: null, color: null });
        expect(inlineAttributeStyle("SpiritDamage")).toEqual({ icon: null, wash: null, color: null });
    });
});

describe("roleColor", () => {
    it("colours important cell labels by their property class", () => {
        expect(roleColor("weapon")).toBe(gameColors.courageBright);
        expect(roleColor("spirit")).toBe(gameColors.spiritBright);
        expect(roleColor("vitality")).toBe(gameColors.armor);
        expect(roleColor("default")).toBe(gameColors.offWhite);
    });
});

describe("scaling marker", () => {
    it("picks the keystat arrow art and the light stat colour", () => {
        expect(scalingArt("spirit")).toBe("keystat_arrow_spirit");
        expect(scalingArt("courage")).toBe("keystat_arrow_weapon");
        expect(scalingArt("fortitude")).toBe("keystat_arrow_vitality");
        expect(scalingColor("spirit")).toBe(gameColors.spiritLight);
        expect(scalingColor("melee")).toBe(gameColors.courageLight);
        expect(scalingColor("boon")).toBe("#53e1c4");
        expect(scalingColor(null)).toBe(panoramaColor("offWhite&aa"));
    });
});

describe("shrinkFont", () => {
    const measure = (text: string, size: number) => text.length * size * 0.5;

    it("keeps the size when the text fits", () => {
        expect(shrinkFont("Spirit Burn", 400, 36, { measure })).toBe(36);
    });

    it("shrinks to the width like Panorama's text-overflow: shrink", () => {
        // 20 glyphs at 0.5 em: 10 em wide, so 90 px fits at 9 px.
        expect(shrinkFont("x".repeat(20), 90, 22, { measure })).toBe(9);
    });

    it("never goes below the floor", () => {
        expect(shrinkFont("x".repeat(200), 90, 22, { measure, min: 10 })).toBe(10);
    });
});

describe("text sizes", () => {
    it("shrinks an important cell's value to the 90 px `.LabelsText` from 22", () => {
        expect(cellValueSize({ prefix: "", number: "500", postfix: "" })).toBe(22);
        const long = { prefix: "+", number: "123456789.25", postfix: "%" };
        expect(cellValueSize(long)).toBe(shrinkFont("+123456789.25%", 90, 22));
        expect(cellValueSize(long)).toBeLessThan(22);
    });

    it("shrinks the item name to the header's width inside its 25 px padding, from 36", () => {
        expect(headerNameSize("Spirit Burn", 420)).toBe(36);
        const long = "Extraordinarily Long Item Name Here";
        expect(headerNameSize(long, 420)).toBe(shrinkFont(long, 370, 36));
        expect(headerNameSize(long, 420)).toBeLessThan(36);
    });
});

describe("iconPaint", () => {
    it("draws a washed icon as a mask filled with the wash", () => {
        expect(iconPaint({ url: "a.svg", wash: "spiritBrightColor" })).toEqual({
            image: 'url("a.svg")',
            wash: gameColors.spiritBright,
        });
    });

    it("lets the caller's wash win and draws an unwashed icon as is", () => {
        expect(iconPaint({ url: "a.svg", wash: null })).toEqual({ image: 'url("a.svg")', wash: null });
        expect(iconPaint({ url: "a.svg", wash: "armorColor" }, "#ffffff")).toEqual({
            image: 'url("a.svg")',
            wash: "#ffffff",
        });
    });

    it("is null without an icon", () => {
        expect(iconPaint(undefined)).toBeNull();
    });
});

describe("tooltip colours", () => {
    it("dims every Panorama alpha colour through the alpha rule", () => {
        const vars = tooltipVars("spirit");
        expect(vars["--tt-affix"]).toBe(panoramaColor("#ffffff50"));
        expect(vars["--tt-diminish"]).toBe(panoramaColor("#bfbbb090"));
        expect(vars["--tt-bar-active"]).toBe(panoramaColor("offBlack&aa"));
        expect(vars["--tt-bar-passive"]).toBe(panoramaColor("offBlack&90"));
        expect(vars["--tt-stacks-wash"]).toBe(panoramaColor("#ce90ff&ea"));
        expect(vars["--tt-slot-bright"]).toBe(gameColors.spiritBright);
        expect(vars["--tt-bar-dim"]).toBe(String(Math.round(panoramaAlpha(0.5) * 1000) / 1000));
        expect(vars["--tt-conditional"]).toBe(String(Math.round(panoramaAlpha(0.3) * 1000) / 1000));
    });

    it("joins custom properties into a style attribute", () => {
        expect(styleVars({ "--a": "1", "--b": undefined, "--c": "x" })).toBe("--a: 1; --c: x");
    });

    it("quotes urls for CSS", () => {
        expect(cssUrl('a b".png')).toBe('url("a b\\".png")');
        expect(cssUrl(undefined)).toBeUndefined();
    });
});
