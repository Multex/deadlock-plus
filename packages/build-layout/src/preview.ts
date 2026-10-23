import {
    REFERENCE_HEIGHT,
    categoryGeometry,
    columnsFor,
    flowLayout,
    geometry,
    type BuildCategory,
    type BuildLayout,
    type Geometry,
    type Screen,
} from "./layout";
import { SAFE_MAX_WIDTH, columnsAtEveryScale, minWidthForColumns, sharesRowAtEveryScale } from "./safe";

const SCREEN_HEIGHTS = [1080, 1440, 2160];
const MEASURED_HEIGHT = 1440;

const UI_SCALE_PERCENT = 63;
const DETAILS_WIDTH = 750;
const INFO_PADDING_LEFT = 40;
const INFO_PADDING_RIGHT = 30;
const OVERVIEW_PADDING = 10;

/**
 * The preview multiplies 63% and the screen scale before it rounds, once per length: a 2-unit border is
 * 2 px at 1440p, where rounding at 63% first would give 1. Kept as one division of an integer product so
 * whole and half px stay exact and the rounding never flips on float noise.
 */
function scaled(length: number, screenHeight: number): number {
    return (length * UI_SCALE_PERCENT * screenHeight) / (100 * REFERENCE_HEIGHT);
}

function unitsFor(px: number, screenHeight: number): number {
    return (px * 100 * REFERENCE_HEIGHT) / (UI_SCALE_PERCENT * screenHeight);
}

/** The overview's content box sits outside the 63% scale. */
function contentWidth(screenHeight: number): number {
    const px = (length: number) => Math.round((length * screenHeight) / REFERENCE_HEIGHT);
    return px(DETAILS_WIDTH) - px(INFO_PADDING_LEFT) - px(INFO_PADDING_RIGHT) - 2 * px(OVERVIEW_PADDING);
}

/** `worst` rounds every length not measured at 1440p up, the case that costs columns, rows and row space. */
export function previewGeometry(screenHeight: number, worst = false): Geometry {
    const round = worst && screenHeight !== MEASURED_HEIGHT ? Math.ceil : Math.round;
    return categoryGeometry(contentWidth(screenHeight), (length) => round(scaled(length, screenHeight)));
}

/**
 * Where the Build Browser's Overview draws each category and chip: the shop's own panel under `ui-scale: 63%`,
 * clipped to each stored height. Rounds stored sizes to nearest; whether fractional ones round up here, as
 * they do in the shop at 1440p, is unmeasured.
 */
export function layoutPreview(categories: readonly BuildCategory[], screen: Screen): BuildLayout {
    const size = (length: number) => Math.round(scaled(length, screen.height));
    return flowLayout(categories, previewGeometry(screen.height), size, size);
}

/** Fewest columns `width` gets in the preview at 1080p, 1440p or 2160p. Fractional px count as rounding down. */
export function previewColumnsAtEveryScale(width: number): number {
    return Math.min(
        ...SCREEN_HEIGHTS.map((height) => {
            const g = previewGeometry(height, true);
            return columnsFor(Math.min(Math.floor(scaled(width, height)), g.cap), g);
        }),
    );
}

/** Smallest whole width with `columns` columns in the shop and the preview at every scale, in the worst case. */
export function minWidthForColumnsEverywhere(columns: number): number {
    return Math.max(
        minWidthForColumns(columns),
        ...SCREEN_HEIGHTS.map((height) => {
            const g = previewGeometry(height, true);
            return Math.ceil(unitsFor(2 * g.frame + columns * g.pitch.x, height));
        }),
    );
}

/** Smallest whole height that shows `rows` full chip rows, bottom padding included, in both views at every scale. */
export function minHeightForRowsEverywhere(rows: number): number {
    return Math.max(
        ...SCREEN_HEIGHTS.flatMap((height) => {
            const shop = geometry(height);
            const preview = previewGeometry(height, true);
            return [
                Math.ceil(((2 * shop.frame + shop.header + rows * shop.pitch.y) * REFERENCE_HEIGHT) / height),
                Math.ceil(unitsFor(2 * preview.frame + preview.header + rows * preview.pitch.y, height)),
            ];
        }),
    );
}

/**
 * Whether these stored widths share one flow row in the shop and the preview at every scale. Fractional px
 * round up here, the case that wraps. A row the shop keeps can wrap in the preview; the reverse cannot happen.
 */
export function sharesRowEverywhere(widths: readonly number[]): boolean {
    if (!sharesRowAtEveryScale(widths)) return false;
    if (widths.length <= 1) return true;
    return SCREEN_HEIGHTS.every((height) => {
        const g = previewGeometry(height, true);
        const used = widths.reduce(
            (sum, width) => sum + Math.min(Math.ceil(scaled(width, height)), g.cap) + 2 * g.margin,
            0,
        );
        return used <= g.contentWidth;
    });
}

/** Widest quarter-unit width neither view caps at any scale, with fractional px rounding up. */
export const SAFE_MAX_WIDTH_EVERYWHERE = Math.min(
    SAFE_MAX_WIDTH,
    ...SCREEN_HEIGHTS.map((height) => Math.floor(4 * unitsFor(previewGeometry(height, true).cap, height)) / 4),
);

/** The most columns a width up to `SAFE_MAX_WIDTH_EVERYWHERE` keeps everywhere. */
export const MAX_COLUMNS_EVERYWHERE = (() => {
    let columns = 1;
    while (minWidthForColumnsEverywhere(columns + 1) <= SAFE_MAX_WIDTH_EVERYWHERE) columns++;
    return columns;
})();
