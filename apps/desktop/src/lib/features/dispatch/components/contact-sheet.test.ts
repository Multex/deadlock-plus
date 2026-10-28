import { describe, expect, it } from "vitest";
import { contactSheet } from "./contact-sheet";

const tall = (id: string) => ({ id, r: 0.75 });
const wide = (id: string) => ({ id, r: 1.6 });

describe("contact sheet", () => {
    it("keeps every page, in order", () => {
        const tiles = [tall("a"), tall("b"), wide("c"), tall("d"), wide("e")];
        const rows = contactSheet(tiles, 320, 600, 8, 30);
        expect(rows.flatMap((r) => r.tiles.map((t) => t.id))).toEqual(["a", "b", "c", "d", "e"]);
    });

    it("fits every row inside the width and all rows with captions inside the height", () => {
        const tiles = Array.from({ length: 7 }, (_, i) => (i % 3 === 2 ? wide(`p${i}`) : tall(`p${i}`)));
        const rows = contactSheet(tiles, 320, 520, 8, 30);
        for (const row of rows) {
            const width = row.tiles.reduce((s, t) => s + t.w, 0) + 8 * (row.tiles.length - 1);
            expect(width).toBeLessThanOrEqual(320);
        }
        const height = rows.reduce((s, r) => s + r.h + 30, 0) + 8 * (rows.length - 1);
        expect(height).toBeLessThanOrEqual(520);
    });

    it("grows the tiles when there is room", () => {
        const tiles = [tall("a"), tall("b"), tall("c")];
        const small = contactSheet(tiles, 320, 200, 8, 30);
        const big = contactSheet(tiles, 320, 700, 8, 30);
        expect(Math.max(...big.map((r) => r.h))).toBeGreaterThan(Math.max(...small.map((r) => r.h)));
    });

    it("never draws a tile wider than the sheet", () => {
        const rows = contactSheet([{ id: "strip", r: 6 }], 300, 600, 8, 30);
        expect(rows[0].tiles[0].w).toBeLessThanOrEqual(300);
    });

    it("lays nothing out for nothing", () => {
        expect(contactSheet([], 300, 600, 8, 30)).toEqual([]);
    });
});
