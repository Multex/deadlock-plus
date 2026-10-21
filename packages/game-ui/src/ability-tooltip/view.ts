import type { ShopUiImage } from "@deadlock-plus/ipc-types/ShopUiImage";
import { gameColors } from "../colors";
import { shrinkFont } from "../item-tooltip/view";
import { panoramaAlpha, panoramaBlend, panoramaColor } from "../panorama";
import type { UpgradeState } from "./model";

/** The classes the game puts on `CitadelAbilityUpgradeButton`; a card can carry several. */
export type UpgradeCardClass =
    "hasUpgrade" | "UpgradeAvailable" | "canAffordUpgrade" | "cantAffordUpgrade" | "abilityNotTrained";

const STATE_CLASSES: Record<UpgradeState, readonly UpgradeCardClass[]> = {
    has: ["hasUpgrade"],
    available: ["UpgradeAvailable"],
    canAfford: ["canAffordUpgrade"],
    cantAfford: ["cantAffordUpgrade"],
    notTrained: ["abilityNotTrained"],
};

export function upgradeCardClasses(state: UpgradeState): readonly UpgradeCardClass[] {
    return STATE_CLASSES[state];
}

/** Every colour as CSS; opacities through the alpha rule. A null `body` leaves the card's own fill. */
export type UpgradeCardStyle = {
    art: ShopUiImage;
    body: string | null;
    strip: string;
    bolt: { art: ShopUiImage; wash: string; size: number };
    /** The points label's colour; null once trained, when it collapses. */
    cost: string | null;
    bonus: { color: string; opacity: string };
    desc: { color: string; opacity: string };
};

type Declarations = {
    art?: ShopUiImage;
    body?: string;
    contentColor?: string;
    strip?: string;
    boltArt?: ShopUiImage;
    boltWash?: string;
    boltSize?: number;
    cost?: string;
    costShown?: boolean;
    bonusColor?: string;
    bonusOpacity?: number;
    descColor?: string;
    descOpacity?: number;
};

// The typical colour of each `ability_upgrade_rect_*` art, the backdrop of the card's dimmed text.
const ART_TONE: Partial<Record<ShopUiImage, string>> = {
    ability_upgrade_rect_default: "#131313",
    ability_upgrade_rect_cant_afford: "#191213",
    ability_upgrade_rect_available: "#f8fdff",
};

/** `@define colorCommonOffWhite: rgb(243, 240, 231)`. */
const COMMON_OFF_WHITE = "#f3f0e7";

/**
 * `citadel_tooltip_ability_upgrade_button.css` in source order. `on` is the button classes a selector needs;
 * `weight` its specificity as id*100 + class*10 + type, `CitadelAbilityUpgradeButton` counting as a type.
 */
const RULES: readonly { on: readonly UpgradeCardClass[]; weight: number; set: Declarations }[] = [
    { on: [], weight: 1, set: { cost: gameColors.offWhite, costShown: true, bonusOpacity: 1 } },
    { on: [], weight: 10, set: { strip: gameColors.offBlack } },
    { on: ["hasUpgrade"], weight: 20, set: { strip: gameColors.deadlockGreenDarker } },
    { on: [], weight: 10, set: { boltArt: "ability_point", boltWash: gameColors.deadlockGreen, boltSize: 16 } },
    { on: [], weight: 100, set: { descColor: gameColors.offWhite, descOpacity: 0.6 } },
    { on: [], weight: 10, set: { bonusColor: gameColors.offWhite } },
    { on: [], weight: 11, set: { art: "ability_upgrade_rect_default" } },
    {
        on: ["cantAffordUpgrade"],
        weight: 21,
        set: { body: "#5a2020", art: "ability_upgrade_rect_cant_afford", contentColor: gameColors.offBlack },
    },
    {
        on: ["UpgradeAvailable"],
        weight: 21,
        set: { art: "ability_upgrade_rect_available", contentColor: gameColors.offBlack },
    },
    { on: ["canAffordUpgrade"], weight: 21, set: { art: "ability_upgrade_rect_default" } },
    { on: ["abilityNotTrained"], weight: 21, set: { art: "ability_upgrade_rect_default" } },
    { on: ["abilityNotTrained", "cantAffordUpgrade"], weight: 31, set: { art: "ability_upgrade_rect_default" } },
    { on: ["cantAffordUpgrade"], weight: 111, set: { descColor: COMMON_OFF_WHITE, descOpacity: 0.5 } },
    { on: ["cantAffordUpgrade"], weight: 21, set: { bonusColor: COMMON_OFF_WHITE, bonusOpacity: 0.5 } },
    { on: ["canAffordUpgrade"], weight: 111, set: { descColor: COMMON_OFF_WHITE, descOpacity: 0.5 } },
    { on: ["canAffordUpgrade"], weight: 21, set: { bonusColor: COMMON_OFF_WHITE, bonusOpacity: 0.5 } },
    { on: ["cantAffordUpgrade"], weight: 21, set: { boltWash: gameColors.enemy } },
    { on: ["cantAffordUpgrade"], weight: 20, set: { cost: gameColors.enemy } },
    { on: ["hasUpgrade"], weight: 21, set: { body: gameColors.offBlack, contentColor: gameColors.offBlack } },
    { on: ["hasUpgrade"], weight: 110, set: { descOpacity: 1 } },
    { on: ["hasUpgrade"], weight: 20, set: { bonusOpacity: 1 } },
    {
        on: ["hasUpgrade"],
        weight: 20,
        set: { boltArt: "ability_upgrade_check", boltWash: gameColors.fortitudeBright, boltSize: 20 },
    },
    { on: ["hasUpgrade"], weight: 20, set: { costShown: false } },
];

function cascade(classes: readonly UpgradeCardClass[]): Declarations {
    const won: Declarations = {};
    const weights: Partial<Record<keyof Declarations, number>> = {};
    for (const rule of RULES) {
        if (!rule.on.every((c) => classes.includes(c))) continue;
        for (const [key, value] of Object.entries(rule.set) as [keyof Declarations, never][]) {
            if ((weights[key] ?? -1) > rule.weight) continue;
            weights[key] = rule.weight;
            won[key] = value;
        }
    }
    return won;
}

/** A card's look for its button classes, by the game's cascade: the heavier selector wins, then the later. */
export function upgradeCardStyle(classes: readonly UpgradeCardClass[]): UpgradeCardStyle {
    const d = cascade(classes) as Required<Declarations>;
    // The labels' own offWhite would vanish on the near-white available art; there the content's offBlack
    // is the text colour. Over the dark arts the labels keep their own.
    const ink = d.art === "ability_upgrade_rect_available" ? d.contentColor : undefined;
    const under = ART_TONE[d.art] ?? d.body ?? gameColors.offBlack;
    const bonus = panoramaColor(ink ?? d.bonusColor);
    const desc = panoramaColor(ink ?? d.descColor);
    return {
        art: d.art,
        body: d.body === undefined ? null : panoramaColor(d.body),
        strip: panoramaColor(d.strip),
        bolt: { art: d.boltArt, wash: panoramaColor(d.boltWash), size: d.boltSize },
        cost: d.costShown ? panoramaColor(d.cost) : null,
        bonus: { color: bonus, opacity: opacity(d.bonusOpacity, bonus, under) },
        desc: { color: desc, opacity: opacity(d.descOpacity, desc, under) },
    };
}

/** `.abilityUpgradeContent`'s `ap_rect_*` art for a card state. */
export function upgradeArt(state: UpgradeState): ShopUiImage {
    return upgradeCardStyle(upgradeCardClasses(state)).art;
}

/** `.AbilityName`: oracle bold 36, shrunk to fit its 370 max width. */
export function abilityNameSize(name: string): number {
    return shrinkFont(name, 370, 36);
}

function opacity(alpha: number, color: string, under: string): string {
    return String(Math.round(panoramaAlpha(alpha, color, under) * 1000) / 1000);
}

function radial(from: string, to: string, under: string): string {
    return `radial-gradient(circle at 50% 50%, ${panoramaColor(from, under)}, ${panoramaColor(to, under)})`;
}

// The typical (median) colour of `ability_tooltip_bg`, the panel every translucent colour of the tooltip
// blends over. Panorama blends in linear light, so the browser alpha that matches depends on it.
const PANEL = "#141414";

/**
 * Every colour the ability tooltip draws that is not a plain base colour, as `--at-*` custom properties, plus
 * the `--tt-*` ones the shared scaling marker reads. Each translucent colour and opacity is fitted to what it
 * sits on, since the browser cannot blend in linear light.
 */
export function abilityTooltipVars(): Record<string, string> {
    const cell = panoramaBlend("offWhite", 0x08 / 255, PANEL);
    return {
        "--at-description": gameColors.silvered,
        "--at-highlight": gameColors.offWhite,
        "--at-weapon": "#ff9900",
        "--at-tech": gameColors.tech,
        "--at-armor": gameColors.armor,
        "--at-courage": gameColors.courageBright,
        "--at-spirit": gameColors.spiritBright,
        "--at-fortitude": gameColors.fortitudeBright,
        "--at-special": "#e9a34e",
        "--at-diminish": panoramaColor("#bfbbb050", PANEL),
        "--at-affix": "#a4a4a4",
        "--at-chip": panoramaColor("#ffffff05", PANEL),
        "--at-chip-dim": panoramaColor("#ffffff03", PANEL),
        "--at-cell": panoramaColor("offWhite&08", PANEL),
        "--at-spirit-border": panoramaColor("spirit&40", PANEL),
        "--at-spirit-fill": radial("#00000080", "spiritDark&50", PANEL),
        "--at-weapon-border": panoramaColor("courage&30", PANEL),
        "--at-weapon-fill": radial("#00000080", "courageDark&30", PANEL),
        "--at-boon-border": panoramaColor("shard&10", PANEL),
        "--at-boon-fill": radial("#00000080", "shard&10", PANEL),
        "--at-group-title": "#909090",
        "--at-imbued": gameColors.spiritBright,
        "--at-card": panoramaColor("offWhite&05", gameColors.offBlack),
        "--at-recommended": gameColors.buildsDark,
        "--at-icon-opacity": opacity(0.3, "#ffffff", cell),
        "--at-name-opacity": opacity(0.8, gameColors.offWhite, cell),
        "--at-status-opacity": opacity(0.5, gameColors.offWhite, cell),
        // `.ScalingStatAltMultiply` is #ffffff86 at 0.8 opacity: one fade of 0x86 x 0.8, drawn by the colour.
        "--tt-scaling-x": panoramaColor(`#ffffff${Math.round(0x86 * 0.8).toString(16)}`, cell),
        "--tt-scaling-x-opacity": "1",
    };
}
