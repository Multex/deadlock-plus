export interface Tile {
    id: string;
    /** Width over height. */
    r: number;
}

export interface Row {
    h: number;
    tiles: { id: string; w: number }[];
}

/**
 * Lays tiles in justified rows, like a photographer's contact sheet: each full row fills `width`, and the tallest
 * row height that keeps every row, plus `extra` per row for its captions, inside `height` wins.
 */
export function contactSheet(
    tiles: Tile[],
    width: number,
    height: number,
    gap: number,
    extra: number,
    most = 200,
): Row[] {
    if (tiles.length === 0 || width <= 0) return [];
    let best: Row[] = [];
    for (let h = most; h >= 24; h -= 2) {
        const rows: Tile[][] = [];
        let cur: Tile[] = [];
        let curW = 0;
        for (const tile of tiles) {
            const w = Math.min(width, tile.r * h);
            if (cur.length > 0 && curW + gap + w > width) {
                rows.push(cur);
                cur = [];
                curW = 0;
            }
            curW += (cur.length > 0 ? gap : 0) + w;
            cur.push(tile);
        }
        if (cur.length) rows.push(cur);
        const laid = rows.map((row, i): Row => {
            const natural = row.reduce((s, t) => s + t.r * h, 0);
            const room = width - gap * (row.length - 1);
            // The last row keeps its height instead of stretching a lone tile across the sheet.
            const s = Math.min(i === rows.length - 1 ? 1 : 1.3, room / natural);
            const rh = Math.floor(h * s);
            return { h: rh, tiles: row.map((t) => ({ id: t.id, w: Math.min(width, Math.floor(t.r * rh)) })) };
        });
        best = laid;
        const total = laid.reduce((s, r) => s + r.h + extra, 0) + gap * (laid.length - 1);
        if (total <= height) return laid;
    }
    return best;
}
