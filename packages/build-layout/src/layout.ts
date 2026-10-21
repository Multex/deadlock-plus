/** A category as the build file stores it: border box in game units, at the 1080p reference. */
export interface BuildCategory {
    width: number;
    height: number;
    items: number;
}

/** Only `height` moves the layout. Aspect ratios other than 16:9 are unmeasured. */
export interface Screen {
    width: number;
    height: number;
}

/** Device px, relative to the top-left of the category container's content box. */
export interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface CategoryLayout {
    box: Box;
    /** The stored width is wider than the container lets a category draw. */
    capped: boolean;
    columns: number;
    rows: number;
    chips: Box[];
}

export interface BuildLayout {
    contentWidth: number;
    categories: CategoryLayout[];
}

const PAGE_WIDTH = 1110;
const CONTAINER_PADDING = 20;
const CATEGORY_MARGIN = 5;
const CATEGORY_BORDER = 2;
const HEADER_HEIGHT = 30.75;
const MODS_PADDING = 4;
const CHIP_WIDTH = 76;
const CHIP_HEIGHT = 114;
const CHIP_MARGIN = 3;

/** Panorama scales lengths by screen height over 1080 (player reports; only 1440p is measured). */
export const REFERENCE_HEIGHT = 1080;

/** Each CSS length rounds to whole px on its own before it adds up. */
function cssPx(length: number, screenHeight: number): number {
    return Math.round((length * screenHeight) / REFERENCE_HEIGHT);
}

/**
 * Measured at 1440p: whole-unit widths round to nearest, fractional ones round up
 * (277 -> 369.33 -> 369, but 275.5 -> 367.33 -> 368). Why is unknown.
 */
export function widthPx(width: number, screenHeight: number): number {
    const exact = (width * screenHeight) / REFERENCE_HEIGHT;
    return Number.isInteger(width) ? Math.round(exact) : Math.ceil(exact);
}

export interface Geometry {
    contentWidth: number;
    margin: number;
    /** Widest a category draws: the content box less its own margins. */
    cap: number;
    /** Border plus mods padding, on each side of the chip grid. */
    frame: number;
    header: number;
    chipMargin: number;
    chip: { width: number; height: number };
    pitch: { x: number; y: number };
}

export function geometry(screenHeight: number): Geometry {
    const px = (length: number) => cssPx(length, screenHeight);
    return categoryGeometry(px(PAGE_WIDTH) - 2 * px(CONTAINER_PADDING), px);
}

/** The category rules in a content box of `contentWidth` px, each CSS length turned into px by `px`. */
export function categoryGeometry(contentWidth: number, px: (length: number) => number): Geometry {
    const margin = px(CATEGORY_MARGIN);
    const chipMargin = px(CHIP_MARGIN);
    const chip = { width: px(CHIP_WIDTH), height: px(CHIP_HEIGHT) };
    return {
        contentWidth,
        margin,
        cap: contentWidth - 2 * margin,
        frame: px(CATEGORY_BORDER) + px(MODS_PADDING),
        header: px(HEADER_HEIGHT),
        chipMargin,
        chip,
        pitch: { x: chip.width + 2 * chipMargin, y: chip.height + 2 * chipMargin },
    };
}

export function columnsFor(drawnWidth: number, { frame, pitch }: Geometry): number {
    return Math.max(1, Math.floor((drawnWidth - 2 * frame) / pitch.x));
}

function chipBoxes(box: Box, items: number, columns: number, g: Geometry): Box[] {
    const left = box.x + g.frame + g.chipMargin;
    const top = box.y + g.frame + g.header + g.chipMargin;
    return Array.from({ length: items }, (_, i) => ({
        x: left + (i % columns) * g.pitch.x,
        y: top + Math.floor(i / columns) * g.pitch.y,
        width: g.chip.width,
        height: g.chip.height,
    }));
}

/** Where the shop's build page draws each category and chip: a right-wrapping flow, rows as tall as their tallest. */
export function layoutBuild(categories: readonly BuildCategory[], screen: Screen): BuildLayout {
    return flowLayout(
        categories,
        geometry(screen.height),
        (width) => widthPx(width, screen.height),
        (height) => cssPx(height, screen.height),
    );
}

/** `widthPx` and `heightPx` turn a category's stored size into px. */
export function flowLayout(
    categories: readonly BuildCategory[],
    g: Geometry,
    widthPx: (width: number) => number,
    heightPx: (height: number) => number,
): BuildLayout {
    const placed: CategoryLayout[] = [];
    let x = 0;
    let y = 0;
    let rowHeight = 0;
    for (const { width, height, items } of categories) {
        const stored = widthPx(width);
        const drawn = Math.min(stored, g.cap);
        const outer = drawn + 2 * g.margin;
        if (x > 0 && x + outer > g.contentWidth) {
            y += rowHeight;
            x = 0;
            rowHeight = 0;
        }
        const box = { x: x + g.margin, y: y + g.margin, width: drawn, height: heightPx(height) };
        const columns = columnsFor(drawn, g);
        placed.push({
            box,
            capped: stored > g.cap,
            columns,
            rows: Math.ceil(items / columns),
            chips: chipBoxes(box, items, columns, g),
        });
        x += outer;
        rowHeight = Math.max(rowHeight, box.height + 2 * g.margin);
    }
    return { contentWidth: g.contentWidth, categories: placed };
}
