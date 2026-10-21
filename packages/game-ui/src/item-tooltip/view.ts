import type { ShopUiImage } from "@deadlock-plus/ipc-types/ShopUiImage";
import type { PropertyIcon } from "../art";
import { gameColors, type GameColor } from "../colors";
import { oracleWidth } from "../item-card/card";
import type { ItemSlot } from "../item";
import { panoramaAlpha, panoramaColor } from "../panorama";
import type { LabelRole, ScalingArrow, ValueText } from "./model";

/** A url as a CSS `url()` value. */
export function cssUrl(src: string | null | undefined): string | undefined {
    return src ? `url(${JSON.stringify(src)})` : undefined;
}

/** Custom properties as a `style` attribute; undefined values are left out. */
export function styleVars(vars: Record<string, string | undefined>): string {
    return Object.entries(vars)
        .filter((entry): entry is [string, string] => entry[1] !== undefined)
        .map(([name, value]) => `${name}: ${value}`)
        .join("; ");
}

// `citadel_base_styles` names the tooltip stylesheets use that `gameColors` does not carry.
const EXTRA_COLORS: Record<string, string> = {
    white: "#ffffff",
    black: "#000000",
    colorEnemy: gameColors.enemy,
    spiritDarkerColor: "#362147",
    weaponColor: "#e58a00",
    weaponColorMedium: "#c87903",
    techColorMedium: "#009bb2",
};

/**
 * A Panorama colour value as CSS: a base-style name (`spiritBrightColor`, `armorColor`, `offWhite`) or hex, with
 * an optional `&xx` alpha through the alpha rule. Null for `none` and for names it does not know.
 */
export function washColor(value: string | null | undefined): string | null {
    if (!value || value === "none") return null;
    const [name, alpha] = value.split("&");
    let hex: string | undefined;
    if (name.startsWith("#")) hex = name;
    else if (Object.hasOwn(EXTRA_COLORS, name)) hex = EXTRA_COLORS[name];
    else {
        const bare = name.endsWith("Color") ? name.slice(0, -"Color".length) : name;
        if (Object.hasOwn(gameColors, bare)) hex = gameColors[bare as GameColor];
    }
    if (hex === undefined) return null;
    try {
        return panoramaColor(alpha === undefined ? hex : `${hex}&${alpha}`);
    } catch {
        return null;
    }
}

export type IconPaint = { image: string; wash: string | null };

/**
 * How to draw a property icon. Panorama's `wash-color` multiplies the image by the colour; for the game's white
 * glyphs that is the image's shape filled with the colour.
 */
export function iconPaint(icon: PropertyIcon | undefined, wash?: string | null): IconPaint | null {
    if (!icon) return null;
    return { image: cssUrl(icon.url) ?? "none", wash: wash ?? washColor(icon.wash) };
}

export type InlineAttributeStyle = {
    /** A `GameArt.propertyIcons` key whose art is the image the game draws for this keyword. */
    icon: string | null;
    wash: string | null;
    /** The keyword's text colour; null keeps the description's. */
    color: string | null;
};

/** A keyword's entry in `GameArt.propertyIcons`; `color` is the game's label colour for it. */
type KeywordArt = PropertyIcon;

/**
 * `.InlineAttributeIcon.<Name>` and `.InlineAttributeName.<Name>` from the game's base styles, which the host
 * passes in `GameArt.propertyIcons` under the keyword. A keyword without art is plain highlighted text.
 */
export function inlineAttributeStyle(
    name: string,
    icons: Partial<Record<string, KeywordArt>> = {},
): InlineAttributeStyle {
    const art = Object.hasOwn(icons, name) ? icons[name] : undefined;
    if (!art) return { icon: null, wash: null, color: null };
    return { icon: name, wash: washColor(art.wash), color: washColor(art.color) };
}

const ROLE_COLORS: Record<LabelRole, string> = {
    default: gameColors.offWhite,
    weapon: gameColors.courageBright,
    spirit: gameColors.spiritBright,
    vitality: gameColors.armor,
};

export function roleColor(role: LabelRole): string {
    return ROLE_COLORS[role];
}

const SCALING_ART: Record<ScalingArrow, ShopUiImage> = {
    spirit: "keystat_arrow_spirit",
    courage: "keystat_arrow_weapon",
    fortitude: "keystat_arrow_vitality",
    melee: "keystat_arrow_melee",
    boon: "keystat_arrow_boon",
};

export function scalingArt(arrow: ScalingArrow): ShopUiImage {
    return SCALING_ART[arrow];
}

const SCALING_COLORS: Record<ScalingArrow, string> = {
    spirit: gameColors.spiritLight,
    courage: gameColors.courageLight,
    melee: gameColors.courageLight,
    fortitude: gameColors.fortitudeLight,
    boon: "#53e1c4",
};

/** `.ScalingStat_<Stat> Label`; a marker with no known stat keeps `.ScalingStatValue`'s offWhite&aa. */
export function scalingColor(arrow: ScalingArrow | null): string {
    return arrow ? SCALING_COLORS[arrow] : panoramaColor("offWhite&aa");
}

const SHRINK_STEP = 0.25;

/**
 * The single-line size Panorama's `text-overflow: shrink` lands on: the largest size, in 0.25 px steps, at
 * which `text` fits `width`. The default measure estimates Valve Oracle bold.
 */
export function shrinkFont(
    text: string,
    width: number,
    size: number,
    { min = 8, measure = oracleWidth }: { min?: number; measure?: (text: string, size: number) => number } = {},
): number {
    const natural = measure(text, size);
    if (natural <= width) return size;
    const fitted = Math.floor((size * (width / natural)) / SHRINK_STEP) * SHRINK_STEP;
    return Math.max(min, fitted);
}

/** `.LabelsText` is 90 wide and shrinks the important cell's 22 px oracle value to fit. */
export function cellValueSize(value: ValueText): number {
    return shrinkFont(value.prefix + value.number + value.postfix, 90, 22);
}

/** `.ModName`: oracle bold 36, shrunk to the header's width inside its 25 px side padding. */
export function headerNameSize(name: string, width: number): number {
    return shrinkFont(name, width - 50, 36);
}

const SLOT_BRIGHT: Record<ItemSlot, string> = {
    weapon: gameColors.courageBright,
    vitality: gameColors.fortitudeBright,
    spirit: gameColors.spiritBright,
};

// `#ViewImpactBox` and the header fall back to these under their art.
const SLOT_DARK: Record<ItemSlot, string> = {
    weapon: gameColors.courageDark,
    vitality: gameColors.fortitudeDark,
    spirit: "#362147",
};

/**
 * Every colour the item tooltip draws that is not a plain base colour, as `--tt-*` custom properties. Panorama
 * alphas go through the alpha rule here because CSS cannot.
 */
export function tooltipVars(slot: ItemSlot): Record<string, string> {
    const bright = SLOT_BRIGHT[slot];
    const dark = SLOT_DARK[slot];
    return {
        "--tt-slot-bright": bright,
        "--tt-slot-dark": dark,
        "--tt-stacks-wash": panoramaColor(`${bright}&ea`),
        "--tt-affix": panoramaColor("#ffffff50"),
        "--tt-text-shadow": panoramaColor("offBlack&90"),
        "--tt-name-shadow": panoramaColor("#00000030"),
        "--tt-description": "#cdcdcd",
        "--tt-highlight": "#f8f8f8",
        "--tt-diminish": panoramaColor("#bfbbb090"),
        "--tt-negative": "rgb(255 106 106)",
        "--tt-negative-value": "#ff8888",
        "--tt-bar-active": panoramaColor("offBlack&aa"),
        "--tt-bar-passive": panoramaColor("offBlack&90"),
        "--tt-bar-dim": opacity(0.5),
        "--tt-stacks-bg": panoramaColor("offBlack&50"),
        "--tt-cell": panoramaColor("#00000060"),
        "--tt-stats": panoramaColor("#00000066"),
        "--tt-owned": panoramaColor("shard&90"),
        "--tt-imbued": panoramaColor("#000000aa"),
        "--tt-conditional": opacity(0.3),
        "--tt-scaling-x": panoramaColor("#ffffff86"),
        "--tt-modified": "#00ff99",
        "--tt-component-label": panoramaColor("#ffffff50"),
        "--tt-component-label-bg": panoramaColor("offBlack&ea"),
        "--tt-component-list-bg": panoramaColor("offBlack&70"),
        "--tt-component-name": panoramaColor("offWhite&90"),
        "--tt-component-owned-bg": panoramaColor("#00000050"),
        "--tt-details-border": panoramaColor("#00000070"),
        "--tt-scaling-x-opacity": opacity(0.8),
        "--tt-stacks-label-opacity": opacity(0.8),
        "--tt-row-name-opacity": opacity(0.5),
        "--tt-component-icon-opacity": opacity(0.9),
        "--tt-component-owned-opacity": opacity(0.8),
        "--tt-component-owned-icon-opacity": opacity(0.3),
        "--tt-popularity-fallback": panoramaColor("brandGreen&30"),
        "--tt-paper": `color-mix(in srgb, ${dark} 45%, ${gameColors.offBlack})`,
        "--tt-header-fallback": `linear-gradient(100deg, ${bright}, ${dark})`,
    };
}

function opacity(alpha: number): string {
    return String(Math.round(panoramaAlpha(alpha) * 1000) / 1000);
}
