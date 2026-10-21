import {
    SAFE_MAX_WIDTH,
    columnsAtEveryScale,
    minWidthForColumns,
    type Box,
    type Screen,
} from "@deadlock-plus/build-layout";
import { REFERENCE_HEIGHT, columnsFor, geometry, widthPx } from "@deadlock-plus/build-layout/layout";

/** Fit heights the game stores, measured at 1440p: 162.75 for one chip row, 120 more per row. */
const ONE_ROW_HEIGHT = 162.75;
const ROW_HEIGHT = 120;
const COLUMN_WIDTH = minWidthForColumns(2) - minWidthForColumns(1);

let maxColumns = 1;
while (minWidthForColumns(maxColumns + 1) <= SAFE_MAX_WIDTH) maxColumns++;

function quarter(raw: number): number {
    return Math.round(raw * 4) / 4;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** Exact midpoints snap to the wider width. */
export function snapWidth(raw: number, free: boolean): number {
    if (free) return clamp(quarter(raw), minWidthForColumns(1), SAFE_MAX_WIDTH);
    const columns = Math.round((raw - minWidthForColumns(1)) / COLUMN_WIDTH) + 1;
    return minWidthForColumns(clamp(columns, 1, maxColumns));
}

/** Exact midpoints snap to the taller height. */
export function snapHeight(raw: number, free: boolean): number {
    if (free) return Math.max(ONE_ROW_HEIGHT, quarter(raw));
    const rows = Math.max(1, Math.round((raw - ONE_ROW_HEIGHT) / ROW_HEIGHT) + 1);
    return ONE_ROW_HEIGHT + ROW_HEIGHT * (rows - 1);
}

export interface SizeTag {
    columns: number;
    rows: number;
    /** The items need more chip rows than the height holds. */
    overflow: boolean;
    /** The width draws a different column count at another scale than at this screen. */
    unsafe: boolean;
}

export function sizeTag(width: number, height: number, items: number, screen: Screen): SizeTag {
    const g = geometry(screen.height);
    const columns = columnsFor(Math.min(widthPx(width, screen.height), g.cap), g);
    const heightPx = Math.round((height * screen.height) / REFERENCE_HEIGHT);
    const rows = Math.max(0, Math.floor((heightPx - 2 * g.frame - g.header) / g.pitch.y));
    return {
        columns,
        rows,
        overflow: Math.ceil(items / columns) > rows,
        unsafe: columnsAtEveryScale(width) !== columns,
    };
}

interface Point {
    x: number;
    y: number;
}

/**
 * Rows split at the middle of the gap between them (the middle goes to the lower row); a point at or below the
 * last row's bottom inserts at the end. Within a row, a point on a box's centre counts as after it.
 */
function insertion(rows: readonly (readonly Box[])[], point: Point): number {
    let start = 0;
    for (const [r, row] of rows.entries()) {
        const bottom = Math.max(...row.map((box) => box.y + box.height));
        const next = rows[r + 1];
        const boundary = next ? (bottom + Math.min(...next.map((box) => box.y))) / 2 : bottom;
        if (point.y < boundary) {
            const before = row.findIndex((box) => point.x < box.x + box.width / 2);
            return start + (before === -1 ? row.length : before);
        }
        start += row.length;
    }
    return start;
}

export function chipInsertion(chips: readonly Box[], columns: number, point: Point): number {
    const rows: Box[][] = [];
    for (let i = 0; i < chips.length; i += columns) rows.push(chips.slice(i, i + columns));
    return insertion(rows, point);
}

/** `boxes` in flow order; a box left of or level with the one before it starts a new flow row. */
export function categoryInsertion(boxes: readonly Box[], point: Point): number {
    const rows: Box[][] = [];
    let previous: Box | undefined;
    for (const box of boxes) {
        if (!previous || box.x <= previous.x) rows.push([]);
        rows[rows.length - 1]!.push(box);
        previous = box;
    }
    return insertion(rows, point);
}
