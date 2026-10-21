import type { Box } from "@deadlock-plus/build-layout";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import { romanTier } from "../item-tooltip/item-tooltip";
import type { ChipItem, ChipSlot, ShopView } from "../../shop-view";

type Tier = ChipItem["tier"];

/** Game units of a chip's art: square art fills the top 71 edge to edge, active art is a circle up to 74 wide. */
export const ART_HEIGHT = 71;
const ACTIVE_ART = 74;
/** `tier_corner_cap`, measured 29 units at 1440p. */
export const CORNER_SIZE = 29;
const CHIP_RADIUS = 3;
/** Below this many CSS px a glyph is a smudge, so the preview draws no text at all. */
export const MIN_TEXT_PX = 7;

/** The name plate per slot and tier, sampled from in-game 1440p shots (the same tones as `item-chip.svelte`). */
export const PLATES: Readonly<Record<ChipSlot, Readonly<Record<Tier, string>>>> = {
    weapon: { 1: "#e0c28a", 2: "#b2905b", 3: "#9f734b", 4: "#342d26" },
    vitality: { 1: "#cbd28e", 2: "#9ba676", 3: "#81905f", 4: "#3f3d30" },
    spirit: { 1: "#e7d4eb", 2: "#a49cb7", 3: "#827da8", 4: "#3a3434" },
};
const BRIGHT: Readonly<Record<ChipSlot, string>> = { weapon: "#ec9719", vitality: "#7bba1d", spirit: "#ce90ff" };
const OFF_BLACK = "#10130d";
/** Tier 4 cards are dark with light names, as the game's `ModTier4` rules set them. */
const TIER_4_NAME: Readonly<Record<ChipSlot, string>> = { weapon: "#e4c5a1", vitality: "#c2e7cd", spirit: "#e3d4f2" };

/** Theme colours resolved to plain CSS colours a canvas accepts, and the font families. */
export interface PreviewPalette {
    border: string;
    category: string;
    optional: string;
    header: string;
    name: string;
    warning: string;
    removed: string;
    sans: string;
    heading: string;
}

export type PreviewOp =
    | { kind: "box"; x: number; y: number; width: number; height: number; fill: string; radius?: number }
    | {
          kind: "frame";
          x: number;
          y: number;
          width: number;
          height: number;
          color: string;
          lineWidth: number;
          dashed?: boolean;
      }
    | {
          kind: "art";
          src: string;
          x: number;
          y: number;
          width: number;
          height: number;
          round: boolean;
          fill: string;
      }
    /** A right triangle hanging from the top-right corner at (`x`, `y`), with the tier numeral when legible. */
    | {
          kind: "corner";
          x: number;
          y: number;
          size: number;
          fill: string;
          /** Right-aligned at (`x`, `y`), top baseline. */
          label?: { text: string; x: number; y: number; font: string; color: string };
      }
    | {
          kind: "text";
          lines: string[];
          /** The left edge, or the centre for centred text. */
          x: number;
          /** Top of the first line. */
          y: number;
          lineHeight: number;
          size: number;
          font: string;
          color: string;
          align: "left" | "center";
          /** A line wider than this is squeezed to it. */
          maxWidth?: number;
          clip?: Box;
      };

export interface PreviewLayer {
    clip: Box;
    ops: PreviewOp[];
}

export type Measure = (text: string, font: string) => number;

export interface PlanInput {
    view: ShopView;
    categories: readonly Pick<ModCategoryView, "name" | "optional">[];
    /** One per chip; undefined for an item the game no longer has. */
    items: readonly (readonly (ChipItem | undefined)[])[];
    palette: PreviewPalette;
    measure: Measure;
    /** The name drawn on a chip whose item the game no longer has. */
    removedLabel?: string;
}

/** Share of the shop's width the categories reach: the preview crops the empty right side away. */
export function usedShare(view: ShopView): number {
    const right = Math.max(0, ...view.categories.map(({ box }) => box.x + box.width));
    return right > 0 && view.contentWidth > 0 ? Math.min(1, right / view.contentWidth) : 1;
}

/** The source rectangle that scales an image to cover `box` and crops the overflow evenly. */
export function coverRect(
    width: number,
    height: number,
    box: Pick<Box, "width" | "height">,
): { sx: number; sy: number; sw: number; sh: number } {
    const scale = Math.max(box.width / width, box.height / height);
    const sw = box.width / scale;
    const sh = box.height / scale;
    return { sx: (width - sw) / 2, sy: (height - sh) / 2, sw, sh };
}

/** Breaks at spaces and, with `breakWords`, inside a word longer than the room, as the category header does. */
function wrap(text: string, room: number, fits: (text: string) => boolean, breakWords = true): string[] {
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/).filter(Boolean)) {
        const joined = line ? `${line} ${word}` : word;
        if (fits(joined)) {
            line = joined;
            continue;
        }
        if (line) lines.push(line);
        let rest = word;
        while (breakWords && rest.length > 1 && !fits(rest)) {
            let cut = rest.length - 1;
            while (cut > 1 && !fits(rest.slice(0, cut))) cut--;
            lines.push(rest.slice(0, cut));
            rest = rest.slice(cut);
        }
        line = rest;
    }
    if (line || lines.length === 0) lines.push(line);
    return room > 0 ? lines : [];
}

function mix(a: string, b: string, share: number): string {
    const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    const out = [0, 1, 2].map((i) => Math.round(channel(a, i) * share + channel(b, i) * (1 - share)));
    return `#${out.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

const NAME_SIZE = 15;
const NAME_PADDING = 3;
const AVG_GLYPH_EM = 0.56;
const MIN_NAME_SIZE = 8;
const MAX_NAME_LINES = 3;

/** Panorama shrinks the label to fit; the same glyph-count estimate as `item-chip.svelte`, in game units. */
function chipNameSize(label: string, width: number): number {
    const available = Math.max(1, width - 2 * NAME_PADDING);
    const longestWord = Math.max(...label.split(/\s+/).map((word) => word.length), 1);
    const forWord = available / (longestWord * AVG_GLYPH_EM);
    const forLines = (available * MAX_NAME_LINES) / (label.length * AVG_GLYPH_EM * 1.15);
    return Math.max(MIN_NAME_SIZE, Math.min(NAME_SIZE, forWord, forLines));
}

function chipOps(
    chip: Box,
    item: ChipItem | undefined,
    unit: number,
    palette: PreviewPalette,
    measure: Measure,
    removedLabel: string,
): PreviewOp[] {
    const ops: PreviewOp[] = [];
    const artHeight = ART_HEIGHT * unit;
    const label = item ? item.name : removedLabel;
    if (!item) {
        ops.push({ kind: "box", ...chip, fill: palette.removed, radius: CHIP_RADIUS * unit });
        ops.push({ kind: "frame", ...chip, color: palette.warning, lineWidth: 1, dashed: true });
    } else {
        const plate = PLATES[item.slot][item.tier];
        ops.push({ kind: "box", ...chip, fill: plate, radius: CHIP_RADIUS * unit });
        const fill = item.tier === 4 ? mix(plate, "#000000", 0.7) : mix(plate, "#ffffff", 0.55);
        if (item.active) {
            const size = Math.min(chip.width, ACTIVE_ART * unit);
            if (item.art) {
                const x = chip.x + (chip.width - size) / 2;
                ops.push({ kind: "art", src: item.art, x, y: chip.y, width: size, height: size, round: true, fill });
            }
        } else if (item.art) {
            ops.push({ kind: "art", src: item.art, ...chip, height: artHeight, round: false, fill });
        } else {
            ops.push({ kind: "box", ...chip, height: artHeight, fill });
        }
        const numeral = 11 * unit;
        ops.push({
            kind: "corner",
            x: chip.x + chip.width,
            y: chip.y,
            size: CORNER_SIZE * unit,
            fill: BRIGHT[item.slot],
            label:
                numeral >= MIN_TEXT_PX
                    ? {
                          text: romanTier(item.tier),
                          x: chip.x + chip.width - 4 * unit,
                          y: chip.y + 3.5 * unit,
                          font: `700 ${numeral}px ${palette.sans}`,
                          color: OFF_BLACK,
                      }
                    : undefined,
        });
    }

    // Names show on every chip or on none: a long name is not dropped while its neighbours' short ones show.
    if (NAME_SIZE * unit < MIN_TEXT_PX) return ops;
    const size = Math.max(MIN_TEXT_PX, chipNameSize(label, chip.width / unit) * unit);
    const font = `600 ${size}px ${palette.heading}`;
    const room = chip.width - 2 * NAME_PADDING * unit;
    const lines = wrap(label, room, (text) => measure(text, font) <= room, false).slice(0, MAX_NAME_LINES);
    const lineHeight = size * 0.92;
    const top = item ? chip.y + artHeight : chip.y + chip.height - 43 * unit;
    const color = !item
        ? palette.warning
        : item.tier === 4
          ? TIER_4_NAME[item.slot]
          : item.slot === "weapon" && item.tier === 3
            ? "#000000"
            : OFF_BLACK;
    ops.push({
        kind: "text",
        lines,
        x: chip.x + chip.width / 2,
        y: (top + chip.y + chip.height) / 2 - (lines.length * lineHeight) / 2,
        lineHeight,
        size,
        font,
        color,
        align: "center",
        maxWidth: room,
        clip: { x: chip.x, y: top, width: chip.width, height: chip.y + chip.height - top },
    });
    return ops;
}

/** Everything a build preview draws, category by category, in CSS px of the preview. */
export function previewPlan({
    view,
    categories,
    items,
    palette,
    measure,
    removedLabel = "",
}: PlanInput): PreviewLayer[] {
    const { unit, border } = view;
    return view.categories.map((layout) => {
        const category = categories[layout.index]!;
        const { box } = layout;
        const inner = {
            x: box.x + border,
            y: box.y + border,
            width: box.width - 2 * border,
            height: box.height - 2 * border,
        };
        const header = { ...inner, height: layout.header };
        const ops: PreviewOp[] = [
            { kind: "box", ...box, fill: category.optional ? palette.optional : palette.category },
            { kind: "box", ...header, fill: palette.header },
        ];

        const nameSize = 16 * unit;
        if (category.name && nameSize >= MIN_TEXT_PX) {
            const font = `700 ${nameSize}px ${palette.sans}`;
            const room = inner.width - 16 * unit;
            ops.push({
                kind: "text",
                lines: wrap(category.name, room, (text) => measure(text, font) <= room),
                x: inner.x + 12 * unit,
                y: inner.y + 6 * unit,
                lineHeight: 21 * unit,
                size: nameSize,
                font,
                color: palette.name,
                align: "left",
                clip: header,
            });
        }

        const row = items[layout.index] ?? [];
        layout.chips.forEach((chip, i) => ops.push(...chipOps(chip, row[i], unit, palette, measure, removedLabel)));
        ops.push({ kind: "frame", ...box, color: palette.border, lineWidth: border });
        return { clip: box, ops };
    });
}

export interface ImageCache {
    /** Starts loading `src` once; resolves when it decoded or failed. */
    request(src: string): Promise<unknown>;
    /** The decoded image, once it is. */
    get(src: string): HTMLImageElement | undefined;
    /** Whether loading `src` finished, decoded or not: a failed source is never asked for again. */
    settled(src: string): boolean;
}

export function createImageCache(load: (src: string) => Promise<HTMLImageElement>): ImageCache {
    const pending = new Map<string, Promise<HTMLImageElement | null>>();
    const ready = new Map<string, HTMLImageElement>();
    const done = new Set<string>();
    return {
        request(src) {
            let entry = pending.get(src);
            if (!entry) {
                entry = load(src).then(
                    (image) => {
                        ready.set(src, image);
                        done.add(src);
                        return image;
                    },
                    () => {
                        done.add(src);
                        return null;
                    },
                );
                pending.set(src, entry);
            }
            return entry;
        },
        get: (src) => ready.get(src),
        settled: (src) => done.has(src),
    };
}

function decodeImage(src: string): Promise<HTMLImageElement> {
    const image = new Image();
    image.decoding = "async";
    image.src = src;
    return image.decode().then(() => image);
}

/** One decoded image per item art, shared by every preview on the page. */
export const previewImages = createImageCache(decodeImage);
