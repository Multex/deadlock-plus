import { REFERENCE_HEIGHT, columnsFor, geometry, widthPx } from "./layout";

const SCREEN_HEIGHTS = [1080, 1440, 2160];
const MEASURED_HEIGHT = 1440;

/** Widest stored width that no scale caps: 1060 already draws 1413 px against 1412 at 1440p. */
export const SAFE_MAX_WIDTH = 1059;

/** Past 12 columns the width cap wins at every scale. */
export function minWidthForColumns(columns: number): number {
    return 82 * columns + 12;
}

/**
 * Fewest columns `width` gets at 1080p, 1440p or 2160p. Fractional px rounding is measured only at 1440p,
 * so elsewhere it counts as rounding down, the case that loses a column.
 */
export function columnsAtEveryScale(width: number): number {
    return Math.min(
        ...SCREEN_HEIGHTS.map((height) => {
            const g = geometry(height);
            const px =
                height === MEASURED_HEIGHT ? widthPx(width, height) : Math.floor((width * height) / REFERENCE_HEIGHT);
            return columnsFor(Math.min(px, g.cap), g);
        }),
    );
}

/** Whether these stored widths fit one flow row at 1080p, 1440p and 2160p. Fractional px round up, the case that wraps. */
export function sharesRowAtEveryScale(widths: readonly number[]): boolean {
    if (widths.length <= 1) return true;
    return SCREEN_HEIGHTS.every((height) => {
        const g = geometry(height);
        const used = widths.reduce((sum, width) => sum + Math.min(widthPx(width, height), g.cap) + 2 * g.margin, 0);
        return used <= g.contentWidth;
    });
}
