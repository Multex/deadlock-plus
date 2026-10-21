import {
    SAFE_MAX_WIDTH,
    columnsAtEveryScale,
    minWidthForColumns,
    sharesRowAtEveryScale,
    type Box,
    type Screen,
} from "@deadlock-plus/build-layout";
import { REFERENCE_HEIGHT, columnsFor, geometry, widthPx } from "@deadlock-plus/build-layout/layout";
import { FIT_ONE_ROW_HEIGHT, FIT_ROW_HEIGHT, MAX_SAFE_COLUMNS } from "../shop-view";

const COLUMN_WIDTH = minWidthForColumns(2) - minWidthForColumns(1);

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
    return minWidthForColumns(clamp(columns, 1, MAX_SAFE_COLUMNS));
}

/** How far past the row edge, in screen px, the pointer must pull before a category may wrap onto a new row. */
export const BREAK_THROUGH_PX = 64;

export type RowEdge = "inside" | "pulling" | "through";

/** `overshoot` is how far the pointer is past the row edge, in screen px. */
export function rowEdge(overshoot: number): RowEdge {
    if (overshoot <= 0) return "inside";
    return overshoot > BREAK_THROUGH_PX ? "through" : "pulling";
}

/**
 * Widest quarter-unit width, from one column up to `SAFE_MAX_WIDTH`, that shares one flow row with `others` at
 * every scale; null when not even one column fits.
 */
export function widestOnRow(others: readonly number[]): number | null {
    const min = minWidthForColumns(1) * 4;
    for (let quarters = SAFE_MAX_WIDTH * 4; quarters >= min; quarters--) {
        if (sharesRowAtEveryScale([...others, quarters / 4])) return quarters / 4;
    }
    return null;
}

const quarterFloor = (width: number) => Math.floor(width * 4) / 4;

function columnsUnder(limit: number): number {
    let columns = 1;
    while (columns < MAX_SAFE_COLUMNS && minWidthForColumns(columns + 1) <= limit) columns++;
    return columns;
}

export function stopAtEdge(width: number, limit: number, free: boolean): number {
    return Math.min(width, free ? quarterFloor(limit) : minWidthForColumns(columnsUnder(limit)));
}

/**
 * The stop for a resize that starts at `width`, given the row's limit: none when the row already wraps at some
 * scale, since there is no edge left to keep.
 */
export function dragStop(limit: number | null, width: number): number | null {
    if (limit === null || limit < quarterFloor(width)) return null;
    return Math.max(limit, width);
}

/** `raw` is the width under the pointer in game units; `unit` is screen px per game unit. */
export function edgeWidth(
    raw: number,
    free: boolean,
    limit: number | null,
    unit: number,
): { width: number; edge: RowEdge } {
    const width = snapWidth(raw, free);
    if (limit === null || limit >= SAFE_MAX_WIDTH) return { width, edge: "inside" };
    const edge = rowEdge((raw - limit) * unit);
    if (edge !== "through") return { width: stopAtEdge(width, limit, free), edge };
    const past = free
        ? quarterFloor(limit) + 0.25
        : minWidthForColumns(Math.min(MAX_SAFE_COLUMNS, columnsUnder(limit) + 1));
    return { width: Math.max(width, past), edge };
}

/** Exact midpoints snap to the taller height. */
export function snapHeight(raw: number, free: boolean): number {
    if (free) return Math.max(FIT_ONE_ROW_HEIGHT, quarter(raw));
    const rows = Math.max(1, Math.round((raw - FIT_ONE_ROW_HEIGHT) / FIT_ROW_HEIGHT) + 1);
    return FIT_ONE_ROW_HEIGHT + FIT_ROW_HEIGHT * (rows - 1);
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
