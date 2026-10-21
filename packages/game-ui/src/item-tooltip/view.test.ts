import { describe, expect, it } from "vitest";
import { gameColors } from "../colors";
import { panoramaBlend, panoramaColor } from "../panorama";
import {
    cellValueSize,
    cssUrl,
    diminishBlock,
    headerNameSize,
    iconPaint,
    inlineAttributeStyle,
    roleColor,
    scalingArt,
    scalingColor,
    shrinkFont,
    styleVars,
    tooltipVars,
    variesByHero,
    washColor,
} from "./view";
import { itemTooltipModel } from "./model";

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
        expect(washColor("courageBrightColor&ea")).toBe(panoramaColor("#ec9719&ea", "offBlack"));
        expect(washColor("courageBrightColor&ea", "#59507a")).toBe(panoramaColor("#ec9719&ea", "#59507a"));
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
        expect(inlineAttributeStyle("Spirit", icons).color).toBe(panoramaColor("#e1a0ff&ea", "offBlack"));
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
        expect(scalingColor(null)).toBe(panoramaColor("offWhite&aa", "offBlack"));
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
    it("backs the paper with the typical colour of the slot's backer art", () => {
        expect(tooltipVars("spirit")["--tt-paper"]).toBe("#59507a");
        expect(tooltipVars("vitality")["--tt-paper"]).toBe("#405b44");
        expect(tooltipVars("weapon")["--tt-paper"]).toBe("#795218");
    });

    // The paper beside each element in the 1440p captures, and the element drawn over it.
    it.each([
        ["spirit", "--tt-bar-passive", "#54476e", "#382f49"],
        ["spirit", "--tt-cell", "#59517b", "#463e61"],
        ["spirit", "--tt-stats", "#5c5783", "#484568"],
        ["vitality", "--tt-bar-passive", "#405b44", "#293b2d"],
        ["vitality", "--tt-component-label-bg", "#4c674a", "#1b2419"],
        ["vitality", "--tt-component-list-bg", "#4e694b", "#3a5038"],
        ["vitality", "--tt-bar-active", "#3f5a44", "#253428"],
        ["vitality", "--tt-stats", "#4c674a", "#3b5139"],
        ["weapon", "--tt-cell", "#7e591b", "#634412"],
    ] as const)("draws the %s %s over %s as the game does", (slot, name, under, game) => {
        expect(distance(over(tooltipVars(slot)[name], under), game)).toBeLessThanOrEqual(6);
    });

    it("blends text over the box it sits on", () => {
        const vars = tooltipVars("vitality");
        const label = over(vars["--tt-component-label-bg"], "#4c674a");
        expect(distance(over(vars["--tt-component-label"], label), "#9a9b99")).toBeLessThanOrEqual(5);
        const list = over(vars["--tt-component-list-bg"], "#4e694b");
        expect(distance(over(vars["--tt-component-name"], list), "#c9bfab")).toBeLessThanOrEqual(5);
    });

    it("fades whole elements by their colour over their backdrop", () => {
        const vars = tooltipVars("spirit");
        const paper = vars["--tt-paper"];
        const rowName = withOpacity("#ffffff", vars["--tt-row-name-opacity"]);
        expect(distance(over(rowName, paper), panoramaBlend("#ffffff", 0.5, paper))).toBeLessThanOrEqual(4);
        const bar = panoramaBlend("offBlack", 0x90 / 255, paper);
        const label = withOpacity(gameColors.offWhite, vars["--tt-bar-dim"]);
        expect(distance(over(label, bar), panoramaBlend("offWhite", 0.5, bar))).toBeLessThanOrEqual(4);
    });

    it("joins custom properties into a style attribute", () => {
        expect(styleVars({ "--a": "1", "--b": undefined, "--c": "x" })).toBe("--a: 1; --c: x");
    });

    it("quotes urls for CSS", () => {
        expect(cssUrl('a b".png')).toBe('url("a b\\".png")');
        expect(cssUrl(undefined)).toBeUndefined();
    });
});

describe("diminishBlock", () => {
    const text = (t: string) => ({ kind: "text" as const, text: t });

    it("draws a diminish span as its own block, without the break the block already implies", () => {
        const node = {
            kind: "span" as const,
            styles: ["diminish" as const],
            children: [{ kind: "break" as const }, text("Can be self-cast.")],
        };
        expect(diminishBlock(node)).toEqual([text("Can be self-cast.")]);
        expect(diminishBlock({ ...node, styles: ["small_diminish"] })).toEqual([text("Can be self-cast.")]);
    });

    it("leaves every other node inline", () => {
        expect(diminishBlock({ kind: "span", styles: ["highlight"], children: [text("x")] })).toBeNull();
        expect(diminishBlock(text("x"))).toBeNull();
    });
});

describe("variesByHero", () => {
    const model = (displayType: string | null, where: "important" | "properties") =>
        itemTooltipModel({
            item: { id: 1, name: "Silencer", slot: "weapon", tier: 3, cost: 3200, active: false, imbue: false },
            sections: [
                {
                    kind: "passive",
                    cooldown: null,
                    blocks: [
                        {
                            description: null,
                            values: {},
                            elevated: [],
                            important: [],
                            properties: [],
                            [where]: [
                                {
                                    key: "BuildUpPerShot",
                                    value: 1.04,
                                    unit: "%",
                                    label: "Buildup Per Shot",
                                    signed: false,
                                    cssClass: null,
                                    displayType,
                                    scale: null,
                                    statusEffect: false,
                                },
                            ],
                        },
                    ],
                },
            ],
        });

    it("says whether any cell or row shows a number that varies by hero, for the tooltip's one footnote", () => {
        expect(variesByHero(model("EBuildUpRate", "properties"))).toBe(true);
        expect(variesByHero(model("EBuildUpRate", "important"))).toBe(true);
        expect(variesByHero(model(null, "properties"))).toBe(false);
    });
});

function rgb(value: string): number[] {
    const hex = value in gameColors ? gameColors[value as keyof typeof gameColors] : value;
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function distance(a: string, b: string): number {
    const [x, y] = [rgb(a), rgb(b)];
    return Math.max(...x.map((v, i) => Math.abs(v - y[i])));
}

function withOpacity(hex: string, opacity: string): string {
    return `rgb(${rgb(hex).join(" ")} / ${opacity})`;
}

/** The browser's own blend of a CSS colour (`#rrggbb` or `rgb(r g b / a)`) over an opaque one. */
function over(css: string, under: string): string {
    const m = /^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)$/.exec(css);
    const [c, a] = m ? [[m[1], m[2], m[3]].map(Number), Number(m[4])] : [rgb(css), 1];
    const u = rgb(under);
    return (
        "#" +
        c
            .map((v, i) =>
                Math.round(a * v + (1 - a) * u[i])
                    .toString(16)
                    .padStart(2, "0"),
            )
            .join("")
    );
}
