import type { ShopUiImage } from "@deadlock-plus/ipc-types/ShopUiImage";
import { gameColors } from "../colors";
import type { GameItem, ItemSlot } from "../item";
import { panoramaAlpha, panoramaColor } from "../panorama";

export type ItemTier = GameItem["tier"];

/**
 * Where the card sits. `shop` is the shop grid: active cards arch over their round art and passive art gets the
 * grid's icon masks. `build` is a build's item list: active cards round only their top-left corner.
 */
export type CardLayout = "shop" | "build";

export type CardFlags = {
    owned?: boolean;
    usedAsComponent?: boolean;
    disabled?: boolean;
};

export type PopularPhase = "early" | "mid" | "late";

/** A stable texture index from the item name, for hosts that have no position to cycle textures by. */
export function textureVariant(name: string): number {
    return [...name].reduce((hash, c) => (hash * 31 + c.charCodeAt(0)) >>> 0, 7);
}

export type CardLayers = {
    backer: ShopUiImage | null;
    paper: ShopUiImage;
    wear: { image: ShopUiImage; wash: string | null; opacity: number } | null;
    iconMask: ShopUiImage | null;
    numeral: ShopUiImage | null;
};

const HALF = panoramaAlpha(0.5);

function wearWash(slot: ItemSlot, tier: ItemTier): { wash: string | null; opacity: number } {
    switch (tier) {
        case 1:
            if (slot === "vitality") return { wash: "#f3e1cc", opacity: 1 };
            if (slot === "spirit") return { wash: "rgb(247 232 213)", opacity: 1 };
            return { wash: null, opacity: HALF };
        case 2:
            return { wash: "rgb(230 209 191)", opacity: HALF };
        case 3:
            return { wash: "rgb(206 173 155)", opacity: HALF };
        case 4:
            return { wash: "rgb(105 97 92)", opacity: HALF };
        case 5:
            return { wash: null, opacity: 1 };
    }
}

/**
 * The game's card images for an item. `variant` stands in for the card's position: the game cycles paper
 * textures and icon masks by `3n+k` and paper wear by `4n+k`.
 */
export function cardLayers(
    item: Pick<GameItem, "slot" | "tier" | "active">,
    {
        variant,
        layout = "shop",
        owned = false,
        usedAsComponent = false,
    }: { variant: number; layout?: CardLayout } & CardFlags,
): CardLayers {
    const spent = owned || usedAsComponent;
    const index = Math.abs(Math.trunc(variant));
    const mask = ((index % 3) + 1) as 1 | 2 | 3;
    return {
        backer: spent || item.tier === 5 ? null : `card_backer_${item.slot}_t${item.tier}`,
        paper: `paper_texture_${mask}`,
        wear: spent
            ? null
            : { image: `paper_wear_${((index % 4) + 1) as 1 | 2 | 3 | 4}`, ...wearWash(item.slot, item.tier) },
        iconMask: layout === "shop" && !item.active ? `icon_mask_${mask}` : null,
        numeral: item.tier === 5 ? null : `tier_number_${item.tier}`,
    };
}

/** `TierContainer` is drawn at 140% ui-scale. */
export const TIER_SCALE = 1.4;

/** Width and right margin of the `tier_numbers_small_0n` numeral, in card px. */
export function tierNumeral(tier: Exclude<ItemTier, 5>): { width: number; right: number } {
    return { width: (3 + tier * 2) * TIER_SCALE, right: (5 - tier) * TIER_SCALE };
}

/** Corner radii in card px, clockwise from the top left. */
export function cardRadius(active: boolean, layout: CardLayout): [number, number, number, number] {
    if (!active) return [2, 2, 2, 2];
    return layout === "shop" ? [50, 50, 2, 2] : [40, 2, 2, 2];
}

export type NameTone = { color: string; shadow: string | null; italic: boolean; opacity: number };

const TIER4_NAME: Record<ItemSlot, string> = { weapon: "#e4c5a1", vitality: "#c2e7cd", spirit: "#e3d4f2" };

export function nameTone(slot: ItemSlot, tier: ItemTier, flags: CardFlags): NameTone {
    const italic = !!flags.disabled;
    if (flags.usedAsComponent) return { color: gameColors.offWhite, shadow: null, italic: true, opacity: HALF };
    if (flags.owned) return { color: panoramaColor("offWhite&80"), shadow: null, italic, opacity: 1 };
    if (tier === 4) return { color: TIER4_NAME[slot], shadow: null, italic, opacity: 1 };
    if (tier === 3 && slot === "weapon") return { color: "#000000", shadow: "#aa8470", italic, opacity: 1 };
    return { color: gameColors.offBlack, shadow: null, italic, opacity: 1 };
}

export type CardState = {
    opacity: number;
    /** Opacity of the card face (backer, art, paper); the name stays at `opacity`. */
    cardOpacity: number;
    /** Panorama's `brightness`, a multiply in linear light like its alpha. */
    artBrightness: number;
    saturation: number;
    shadow: boolean;
    outline: string | null;
    popularity: boolean;
    newTag: boolean;
};

export function cardState({ owned = false, usedAsComponent = false, disabled = false }: CardFlags): CardState {
    const spent = owned || usedAsComponent;
    if (disabled && !spent) {
        return {
            opacity: panoramaAlpha(0.2),
            cardOpacity: 1,
            artBrightness: 1,
            saturation: 0,
            shadow: false,
            outline: null,
            popularity: true,
            newTag: true,
        };
    }
    return {
        opacity: spent ? panoramaAlpha(0.7) : 1,
        cardOpacity: spent ? HALF : 1,
        artBrightness: owned ? HALF : 1,
        saturation: 1,
        shadow: !spent,
        outline: spent ? gameColors.offBlack : null,
        popularity: !owned,
        newTag: !owned,
    };
}

// Advance widths of the bundled Valve Oracle semibold (what the browser draws for the game's bold) in
// thousandths of an em, for the glyphs item names use.
const ORACLE_GLYPHS =
    " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~’‘“”éèáàíóúñüöäçÉ";
const ORACLE_ADVANCES = [
    220, 329, 479, 635, 524, 650, 746, 249, 375, 375, 600, 397, 228, 337, 327, 483, 568, 413, 505, 546, 579, 582, 582,
    492, 578, 582, 327, 327, 369, 397, 369, 474, 1060, 591, 606, 510, 658, 527, 536, 561, 632, 277, 533, 591, 504, 778,
    624, 589, 590, 583, 614, 524, 529, 628, 575, 831, 546, 531, 521, 373, 483, 393, 440, 565, 323, 499, 538, 484, 551,
    470, 450, 500, 561, 288, 291, 545, 272, 862, 570, 511, 546, 541, 474, 446, 463, 557, 546, 826, 523, 524, 441, 413,
    282, 413, 489, 170, 170, 299, 299, 470, 470, 499, 499, 278, 511, 557, 570, 557, 511, 499, 484, 527,
];
const ADVANCE = new Map([...ORACLE_GLYPHS].map((glyph, i) => [glyph, ORACLE_ADVANCES[i]]));
const AVERAGE_ADVANCE = 511;
const WIDE_ADVANCE = 1000;

/** Estimated width in px of `text` in the card name font at `size` px. */
export function oracleWidth(text: string, size: number): number {
    let total = 0;
    for (const glyph of text) {
        total += ADVANCE.get(glyph) ?? (glyph.codePointAt(0)! >= 0x2e80 ? WIDE_ADVANCE : AVERAGE_ADVANCE);
    }
    return (total / 1000) * size;
}

export type NameFit = { size: number; lines: number };

export type FitOptions = {
    /** px; the name area is 76 wide with 2 padding, the label another 2 each side. */
    width?: number;
    /** px; the name area is 40 tall with 2 padding. */
    height?: number;
    max?: number;
    min?: number;
    lineHeight?: number;
    /** Width of `text` at `size` px; a host with a canvas can measure the real font. */
    measure?: (text: string, size: number) => number;
};

const FIT_STEP = 0.25;

function wrap(words: string[], size: number, width: number, measure: FitOptions["measure"] & {}): number | null {
    let lines = 0;
    let line = "";
    for (const word of words) {
        if (measure(word, size) > width) return null;
        const joined = line ? `${line} ${word}` : word;
        if (line && measure(joined, size) > width) {
            lines += 1;
            line = word;
        } else {
            line = joined;
        }
    }
    return lines + (line ? 1 : 0);
}

/**
 * The name size Panorama's `text-overflow: shrink` lands on: the largest size at which every word fits the
 * width and the wrapped lines fit the height. CSS has no shrink-to-fit, so the host renders at this size.
 */
export function fitName(name: string, options: FitOptions = {}): NameFit {
    const { width = 68, height = 36, max = 15, min = 8, lineHeight = 0.92, measure = oracleWidth } = options;
    const words = name.split(/\s+/).filter(Boolean);
    for (let size = max; size >= min; size -= FIT_STEP) {
        const lines = wrap(words, size, width, measure);
        if (lines !== null && lines * size * lineHeight <= height) return { size, lines };
    }
    return { size: min, lines: wrap(words, min, width, measure) ?? Math.max(1, words.length) };
}

/** Up to two letters for a card whose art is missing. */
export function initials(name: string): string {
    return name
        .split(/\s+/)
        .map((word) => word.match(/[\p{L}\p{N}]/u)?.[0])
        .filter((letter): letter is string => !!letter)
        .slice(0, 2)
        .map((letter) => letter.toUpperCase())
        .join("");
}

const ROMAN = ["I", "II", "III", "IV", "V"] as const;

export function romanTier(tier: ItemTier): string {
    return ROMAN[tier - 1];
}

// Card face tones sampled from in-game 1440p shots, drawn when the backer art is missing.
const PLATES: Record<ItemSlot, readonly [string, string, string, string]> = {
    weapon: ["#e0c28a", "#b2905b", "#9f734b", "#342d26"],
    vitality: ["#cbd28e", "#9ba676", "#81905f", "#3f3d30"],
    spirit: ["#e7d4eb", "#a49cb7", "#827da8", "#3a3434"],
};

export function plateColor(slot: ItemSlot, tier: ItemTier): string {
    return PLATES[slot][Math.min(tier, 4) - 1];
}

export function phaseWash(phase: PopularPhase): string | null {
    if (phase === "early") return gameColors.shard;
    if (phase === "mid") return "#b1beff";
    return null;
}
