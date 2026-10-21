import { describe, expect, it } from "vitest";
import { layoutBuild, type BuildCategory, type BuildLayout, type Screen } from "./layout";

const QHD: Screen = { width: 2560, height: 1440 };
const FHD: Screen = { width: 1920, height: 1080 };
const UHD: Screen = { width: 3840, height: 2160 };

function category(width: number, items = 3, height = 183.75): BuildCategory {
    return { width, height, items };
}

function only(width: number, screen: Screen = QHD) {
    return layoutBuild([category(width)], screen).categories[0];
}

/** Categories per flow row, top to bottom. */
function rowSizes(layout: BuildLayout): number[] {
    const sizes = new Map<number, number>();
    for (const { box } of layout.categories) sizes.set(box.y, (sizes.get(box.y) ?? 0) + 1);
    return [...sizes.entries()].sort(([a], [b]) => a - b).map(([, size]) => size);
}

const BUILD_06 = [187.25, 187.5, 187.75, 188, 188.25, 188.5, 188.75, 189, 189.25];
const BUILD_07 = [275, 275.25, 275.5, 275.75, 276, 276.25];
const BUILD_08 = [276.5, 276.75, 277, 277.5, 278, 278.5];

describe("layoutBuild, golden 1440p", () => {
    it.each([
        [600, 800],
        [449, 599],
        [451, 601],
        [511, 681],
        [512, 683],
        [187.25, 250],
        [187.5, 250],
        [187.75, 251],
        [188, 251],
        [188.25, 251],
        [188.5, 252],
        [188.75, 252],
        [189, 252],
        [189.25, 253],
        [275, 367],
        [275.25, 367],
        [275.5, 368],
        [275.75, 368],
        [276, 368],
        [276.25, 369],
        [276.5, 369],
        [276.75, 369],
        [277, 369],
        [277.5, 370],
        [278, 371],
        [278.5, 372],
        [200, 267],
        [360, 480],
        [100, 133],
        [257.25, 343],
    ])("draws stored width %s as %s px", (width, px) => {
        const drawn = only(width);
        expect(drawn.box.width).toBe(px);
        expect(drawn.capped).toBe(false);
    });

    it.each([1060, 1069, 1071, 1132, 1200])("caps stored width %s at 1412 px", (width) => {
        const drawn = only(width);
        expect(drawn.box.width).toBe(1412);
        expect(drawn.capped).toBe(true);
    });

    it("has a 1426 px content box", () => {
        expect(layoutBuild([], QHD).contentWidth).toBe(1426);
    });

    it.each([
        ["01", 449],
        ["02", 451],
        ["03", 511],
        ["04", 512],
    ])("wraps build %s's second category onto row 2", (_, second) => {
        expect(rowSizes(layoutBuild([category(600), category(second)], QHD))).toEqual([1, 1]);
    });

    it("puts build 06 in rows of 5 and 4, every category 2 columns", () => {
        const layout = layoutBuild(
            BUILD_06.map((width) => category(width, 2, 330)),
            QHD,
        );
        expect(rowSizes(layout)).toEqual([5, 4]);
        expect(layout.categories.map((c) => c.columns)).toEqual(BUILD_06.map(() => 2));
    });

    it.each([
        ["07", BUILD_07],
        ["08", BUILD_08],
    ])("puts build %s in rows of 3 and 3, every category 3 columns", (_, widths) => {
        const layout = layoutBuild(
            widths.map((width) => category(width, 3, 330)),
            QHD,
        );
        expect(rowSizes(layout)).toEqual([3, 3]);
        expect(layout.categories.map((c) => c.columns)).toEqual(widths.map(() => 3));
    });

    it("puts each of build 09's capped categories on its own row", () => {
        const layout = layoutBuild(
            [1069, 1071, 1132, 1200].map((width) => category(width)),
            QHD,
        );
        expect(rowSizes(layout)).toEqual([1, 1, 1, 1]);
    });

    it.each([
        ["10", 449],
        ["11", 511],
    ])("wraps build %s's second category and its capped tall one", (_, second) => {
        const layout = layoutBuild([category(600), category(second), category(1060, 3, 900)], QHD);
        expect(rowSizes(layout)).toEqual([1, 1, 1]);
        expect(layout.categories[2].box).toMatchObject({ width: 1412, height: 1200 });
    });

    it("lays out build 12 as loaded on one row with 4 columns at 360", () => {
        const layout = layoutBuild([category(200, 1, 300), category(360, 6, 400), category(360, 9, 500)], QHD);
        expect(rowSizes(layout)).toEqual([3]);
        expect(layout.categories.map((c) => c.columns)).toEqual([2, 4, 4]);
        expect(layout.categories.map((c) => c.rows)).toEqual([1, 2, 3]);
        expect(layout.categories.map((c) => c.box.height)).toEqual([400, 533, 667]);
    });

    it("draws build 12 after Fit as 57 + 160 px per item row", () => {
        const layout = layoutBuild(
            [category(100, 1, 162.75), category(257.25, 6, 282.75), category(257.25, 9, 402.75)],
            QHD,
        );
        expect(rowSizes(layout)).toEqual([3]);
        expect(layout.categories.map((c) => c.columns)).toEqual([1, 3, 3]);
        expect(layout.categories.map((c) => c.rows)).toEqual([1, 2, 3]);
        expect(layout.categories.map((c) => c.box.height)).toEqual([217, 377, 537]);
        for (const c of layout.categories) expect(c.box.height).toBe(57 + 160 * c.rows);
    });

    it("draws build 05 border to border at 800 x 245", () => {
        expect(only(600).box).toEqual({ x: 7, y: 7, width: 800, height: 245 });
    });

    it("leaves a 14 px gap between categories across and down", () => {
        const across = layoutBuild(
            BUILD_07.map((width) => category(width, 3, 330)),
            QHD,
        ).categories.map((c) => c.box);
        expect(across[1].x - (across[0].x + across[0].width)).toBe(14);
        expect(across[2].x - (across[1].x + across[1].width)).toBe(14);
        expect(across[3].y - (across[0].y + across[0].height)).toBe(14);

        const [first, second] = layoutBuild([category(600), category(449)], QHD).categories.map((c) => c.box);
        expect(second.x).toBe(first.x);
        expect(second.y - (first.y + first.height)).toBe(14);
    });

    it("places chips on a 109 x 160 pitch, the first at (12, 53) inside the border box", () => {
        const [drawn] = layoutBuild([category(360, 6, 400)], QHD).categories;
        const { x, y } = drawn.box;
        expect(drawn.chips).toEqual([
            { x: x + 12, y: y + 53, width: 101, height: 152 },
            { x: x + 12 + 109, y: y + 53, width: 101, height: 152 },
            { x: x + 12 + 218, y: y + 53, width: 101, height: 152 },
            { x: x + 12 + 327, y: y + 53, width: 101, height: 152 },
            { x: x + 12, y: y + 53 + 160, width: 101, height: 152 },
            { x: x + 12 + 109, y: y + 53 + 160, width: 101, height: 152 },
        ]);
    });
});

describe("layoutBuild, predicted 1080p and 2160p (unmeasured, integer widths only)", () => {
    it("scales the content box to 1070 and 2140 px", () => {
        expect(layoutBuild([], FHD).contentWidth).toBe(1070);
        expect(layoutBuild([], UHD).contentWidth).toBe(2140);
    });

    it("caps at 1060 px at 1080p and 2120 px at 2160p", () => {
        expect(only(1069, FHD).box.width).toBe(1060);
        expect(only(1069, UHD).box.width).toBe(2120);
        expect(only(1060, FHD).capped).toBe(false);
        expect(only(1061, FHD).capped).toBe(true);
    });

    it.each([
        ["1080p", FHD],
        ["2160p", UHD],
    ])("keeps 600 + 449 on one row at %s and wraps 600 + 451", (_, screen) => {
        expect(rowSizes(layoutBuild([category(600), category(449)], screen))).toEqual([2]);
        expect(rowSizes(layoutBuild([category(600), category(451)], screen))).toEqual([1, 1]);
    });

    it("keeps 600 + 450 on one row at 1080p, filling the 1070 px content box exactly", () => {
        expect(rowSizes(layoutBuild([category(600), category(450)], FHD))).toEqual([2]);
    });

    it("draws stored widths at exactly 1x and 2x", () => {
        expect(only(449, FHD).box.width).toBe(449);
        expect(only(449, UHD).box.width).toBe(898);
    });

    it("places chips on an 82 x 120 pitch at 1080p and 164 x 240 at 2160p", () => {
        for (const [screen, across, down] of [
            [FHD, 82, 120],
            [UHD, 164, 240],
        ] as const) {
            const [drawn] = layoutBuild([category(360, 6, 400)], screen).categories;
            expect(drawn.chips[1].x - drawn.chips[0].x).toBe(across);
            expect(drawn.chips[4].y - drawn.chips[0].y).toBe(down);
        }
    });

    it("gives 3 columns from 258 at 1080p and 2160p", () => {
        expect(only(258, FHD).columns).toBe(3);
        expect(only(257, FHD).columns).toBe(2);
        expect(only(258, UHD).columns).toBe(3);
        expect(only(257, UHD).columns).toBe(2);
    });
});
