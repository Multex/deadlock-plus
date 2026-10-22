import type { ShopUiImage } from "@deadlock-plus/ipc-types/ShopUiImage";
import type { PropertyIcon } from "../art";
import { gameColors, type GameColor } from "../colors";
import { oracleWidth } from "../item-card/card";
import type { ItemSlot } from "../item";
import type { MarkupNode } from "../markup/markup";
import { panoramaAlpha, panoramaBlend, panoramaColor } from "../panorama";
import type { ItemTooltipModel, LabelRole, ScalingArrow, ValueText } from "./model";

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
 * an optional `&xx` alpha blended over `under`. Null for `none` and for names it does not know.
 */
export function washColor(value: string | null | undefined, under: string = gameColors.offBlack): string | null {
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
        return panoramaColor(alpha === undefined ? hex : `${hex}&${alpha}`, under);
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

/**
 * The children of a `diminish` span, drawn as a block of their own, or null for any other node. Panorama sizes
 * each line to its own text, so the game's 15 px notes pack tighter than the description's 18 px lines; a browser
 * line keeps its paragraph's strut, so the note needs its own block. A block starts its own line already, so a
 * leading break inside it would leave an empty line.
 */
export function diminishBlock(node: MarkupNode): MarkupNode[] | null {
    if (node.kind !== "span" || !node.styles.some((s) => s === "diminish" || s === "small_diminish")) return null;
    const first = node.children.findIndex((child) => child.kind !== "break");
    return first === -1 ? [] : node.children.slice(first);
}

/** Some cell or row shows a base number the game would replace with the hero's own; the tooltip notes it once. */
export function variesByHero(model: ItemTooltipModel): boolean {
    return model.sections.some((section) =>
        section.blocks.some(
            (block) =>
                block.rows.some((row) => row.variesByHero) ||
                block.cells.some((cell) => cell.kind === "important" && cell.variesByHero),
        ),
    );
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

/**
 * `.ScalingStat_<Stat> Label`; a marker with no known stat keeps `.ScalingStatValue`'s offWhite&aa, over the
 * dark box the marker sits in.
 */
export function scalingColor(arrow: ScalingArrow | null): string {
    return arrow ? SCALING_COLORS[arrow] : panoramaColor("offWhite&aa", gameColors.offBlack);
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

// The typical (median) colour of the body of `tooltip_backer_<slot>`, the paper every translucent colour of the
// tooltip blends over. Panorama blends in linear light, so the browser alpha that matches depends on it.
const PAPER: Record<ItemSlot, string> = {
    weapon: "#795218",
    vitality: "#405b44",
    spirit: "#59507a",
};

// The typical colour of `tooltip_header_<slot>`, under the header's own text.
const HEADER: Record<ItemSlot, string> = {
    weapon: "#532400",
    vitality: "#397f50",
    spirit: "#372a6a",
};

const COMPONENT_ICON_BOX = "#009cb3";

// `.AffectedAbilitiesHeader`'s colour under `tooltip_modifies_header_<slot>`.
const MODIFIES_HEADER: Record<ItemSlot, string> = {
    weapon: "#c87903",
    vitality: gameColors.fortitude,
    spirit: gameColors.spirit,
};

// `.AffectedAbilitiesTogglePanel`'s colour under `tooltip_modifies_bg_<slot>`; spirit has no art.
const MODIFIES_BODY: Record<ItemSlot, string> = {
    weapon: gameColors.courageDark,
    vitality: gameColors.fortitudeDark,
    spirit: "#362147",
};

// What the ALT column's labels sit on. Weapon is measured under the rows of a 1440p capture; spirit is its plain
// colour; vitality's art is unmeasured, so its plain colour stands in.
const MODIFIES_TEXT_BODY: Record<ItemSlot, string> = {
    weapon: "#6b4c28",
    vitality: gameColors.fortitudeDark,
    spirit: "#362147",
};

// `colorCommonOffWhite`, measured on the ALT column's row names, which draw it at full opacity.
const COMMON_OFF_WHITE = "#f3f0e7";

// Fitted to the arrow's ink in the 1440p capture; `.AffectedValArrow`'s own 0.25 draws it 9 levels darker.
const DETAILS_ARROW_ALPHA = 0.29;

/**
 * Every colour the item tooltip draws that is not a plain base colour, as `--tt-*` custom properties. Each
 * translucent colour and opacity is fitted to what it sits on, since the browser cannot blend in linear light.
 */
export function tooltipVars(slot: ItemSlot): Record<string, string> {
    const bright = SLOT_BRIGHT[slot];
    const dark = SLOT_DARK[slot];
    const paper = PAPER[slot];
    const header = HEADER[slot];
    const bar = panoramaBlend("offBlack", 0x90 / 255, paper);
    const stacks = panoramaBlend("offBlack", 0x50 / 255, panoramaBlend("offBlack", 0xaa / 255, paper));
    const cell = panoramaBlend("#000000", 0x60 / 255, paper);
    const label = panoramaBlend("offBlack", 0xea / 255, paper);
    const list = panoramaBlend("offBlack", 0x70 / 255, paper);
    const owned = panoramaBlend("#000000", 0x50 / 255, list);
    const modifies = MODIFIES_TEXT_BODY[slot];
    return {
        "--tt-slot-bright": bright,
        "--tt-slot-dark": dark,
        "--tt-stacks-wash": panoramaColor(`${bright}&ea`, stacks),
        "--tt-affix": panoramaColor("#ffffff50", paper),
        "--tt-text-shadow": panoramaColor("offBlack&90", paper),
        "--tt-name-shadow": panoramaColor("#00000030", header),
        "--tt-description": "#cdcdcd",
        "--tt-highlight": "#f8f8f8",
        "--tt-diminish": panoramaColor("#bfbbb090", paper),
        "--tt-negative": "rgb(255 106 106)",
        "--tt-negative-value": "#ff8888",
        "--tt-bar-active": panoramaColor("offBlack&aa", paper),
        "--tt-bar-passive": panoramaColor("offBlack&90", paper),
        "--tt-bar-dim": opacity(0.5, gameColors.offWhite, bar),
        "--tt-stacks-bg": panoramaColor("offBlack&50", stacks),
        "--tt-cell": panoramaColor("#00000060", paper),
        "--tt-stats": panoramaColor("#00000066", paper),
        "--tt-owned": panoramaColor("shard&90", header),
        "--tt-imbued": panoramaColor("#000000aa", header),
        "--tt-cant-afford": "#ffa1a1",
        // The note box sits below the paper, over whatever is behind the tooltip; offBlack stands in for it.
        "--tt-build-note-bg": panoramaColor("buildsDark&ee", gameColors.offBlack),
        "--tt-build-note-shadow": panoramaColor("#00000090", gameColors.buildsDark),
        // `.ScalingStatAltMultiply` is #ffffff86 at 0.8 opacity: one fade of 0x86 x 0.8, drawn by the colour.
        "--tt-scaling-x": panoramaColor(`#ffffff${Math.round(0x86 * 0.8).toString(16)}`, cell),
        "--tt-modified": "#00ff99",
        "--tt-component-label": panoramaColor("#ffffff50", label),
        "--tt-component-label-bg": panoramaColor("offBlack&ea", paper),
        "--tt-component-list-bg": panoramaColor("offBlack&70", paper),
        "--tt-component-name": panoramaColor("offWhite&90", list),
        "--tt-component-owned-bg": panoramaColor("#00000050", list),
        "--tt-details-border": panoramaColor("#00000070", dark),
        "--tt-scaling-x-opacity": "1",
        "--tt-stacks-label-opacity": opacity(0.8, bright, stacks),
        "--tt-row-name-opacity": opacity(0.5, "#ffffff", paper),
        "--tt-component-icon-opacity": opacity(0.9, gameColors.offWhite, COMPONENT_ICON_BOX),
        "--tt-component-owned-opacity": opacity(0.8, gameColors.offWhite, list),
        "--tt-component-owned-icon-opacity": opacity(0.3, gameColors.offWhite, COMPONENT_ICON_BOX),
        "--tt-popularity-fallback": panoramaColor("brandGreen&30", paper),
        "--tt-paper": paper,
        "--tt-header-fallback": `linear-gradient(100deg, ${bright}, ${dark})`,
        "--tt-modifies-header": MODIFIES_HEADER[slot],
        "--tt-modifies-body": MODIFIES_BODY[slot],
        "--tt-modifies-shadow": "#00000060",
        "--tt-details-name": COMMON_OFF_WHITE,
        // Solid: a browser fade of these labels over the column's body misses the capture's hue.
        "--tt-details-current": panoramaBlend(COMMON_OFF_WHITE, 0.5, modifies),
        "--tt-details-arrow": panoramaBlend(COMMON_OFF_WHITE, DETAILS_ARROW_ALPHA, modifies),
        "--tt-details-sub": panoramaBlend("offWhite", 0.8, modifies),
    };
}

function opacity(alpha: number, color: string, under: string): string {
    return String(Math.round(panoramaAlpha(alpha, color, under) * 1000) / 1000);
}
