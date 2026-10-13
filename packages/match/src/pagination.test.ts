import { describe, expect, it } from "vitest";
import { PAGE_SIZE, paginate } from "./pagination";

const items = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("paginate", () => {
    it("has a single empty page for an empty list", () => {
        expect(paginate([], 1)).toEqual({ items: [], page: 1, pageCount: 1, total: 0 });
    });

    it("uses a named default page size", () => {
        const p = paginate(items(PAGE_SIZE * 2), 1);
        expect(p.items).toHaveLength(PAGE_SIZE);
        expect(p.pageCount).toBe(2);
    });

    it("returns a short list on one page", () => {
        expect(paginate(items(3), 1, 10)).toEqual({ items: [0, 1, 2], page: 1, pageCount: 1, total: 3 });
    });

    it("fills a page exactly at the boundary", () => {
        const p = paginate(items(10), 1, 10);
        expect(p.pageCount).toBe(1);
        expect(p.items).toHaveLength(10);
    });

    it("opens a new page one item past the boundary", () => {
        expect(paginate(items(11), 2, 10)).toEqual({ items: [10], page: 2, pageCount: 2, total: 11 });
    });

    it("slices middle pages", () => {
        expect(paginate(items(25), 2, 10).items).toEqual(items(20).slice(10));
    });

    it("clamps a page past the end to the last page", () => {
        expect(paginate(items(25), 99, 10)).toMatchObject({ page: 3, items: [20, 21, 22, 23, 24] });
    });

    it("clamps a page below one to the first page", () => {
        expect(paginate(items(25), 0, 10)).toMatchObject({ page: 1 });
        expect(paginate(items(25), -4, 10)).toMatchObject({ page: 1 });
    });

    it("treats a fractional page as its floor", () => {
        expect(paginate(items(25), 2.7, 10).page).toBe(2);
    });
});
