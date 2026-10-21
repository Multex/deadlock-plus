import { describe, expect, it } from "vitest";
import { SAFE_MAX_WIDTH, minWidthForColumns, sharesRowAtEveryScale, type Screen } from "@deadlock-plus/build-layout";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import {
    equalRows,
    equalWidths,
    equalizeHeights,
    fillRow,
    fillRowProportionally,
    heightForRows,
    pasteSize,
    rowOf,
    setSize,
    sizeOf,
} from "./row-ops";

const QHD: Screen = { width: 2560, height: 1440 };

function category(width: number | null, height: number | null = 162.75, items = 1): ModCategoryView {
    return {
        mods: Array.from({ length: items }, (_, i) => ({
            abilityId: i + 1,
            annotation: null,
            requiredFlexSlots: null,
            sellPriority: null,
            imbueTargetAbilityId: null,
        })),
        name: "",
        description: "",
        width,
        height,
        optional: false,
    };
}

function build(...modCategories: ModCategoryView[]): BuildView {
    return {
        heroBuildId: 1,
        heroId: 1,
        authorAccountId: 1,
        lastUpdatedTimestamp: null,
        name: "",
        description: "",
        language: 0,
        version: 1,
        originBuildId: null,
        modCategories,
        abilityOrder: [],
        tags: [],
        developmentBuild: false,
        publishTimestamp: null,
        favorited: false,
    };
}

const cols = (n: number) => minWidthForColumns(n);
const widths = (b: BuildView) => b.modCategories.map((c) => c.width);
const heights = (b: BuildView) => b.modCategories.map((c) => c.height);
const columnsOf = (width: number | null) => (width! - 12) / 82;

describe("heightForRows", () => {
    it("is the measured Fit height: 162.75 for one row, 120 more per row", () => {
        expect(heightForRows(1)).toBe(162.75);
        expect(heightForRows(3)).toBe(402.75);
    });
});

describe("rowOf", () => {
    it("groups the categories the flow draws on one row", () => {
        const b = build(category(cols(3)), category(cols(3)), category(cols(3)), category(cols(3)));
        expect(rowOf(b, 1, QHD)).toEqual([0, 1, 2]);
        expect(rowOf(b, 3, QHD)).toEqual([3]);
    });
});

describe("fillRow", () => {
    it("widens a lone category to the widest safe width", () => {
        const b = build(category(cols(3)), category(cols(3)), category(cols(3)), category(cols(3)));
        const next = fillRow(b, 3, QHD);
        expect(next.modCategories[3]!.width).toBe(minWidthForColumns(12));
        expect(next.modCategories[3]!.width).toBeLessThanOrEqual(SAFE_MAX_WIDTH);
        expect(widths(next).slice(0, 3)).toEqual([cols(3), cols(3), cols(3)]);
    });

    it("takes the most columns that still share the row at every scale", () => {
        const b = build(category(cols(3)), category(cols(3)), category(cols(3)), category(cols(3)));
        const next = fillRow(b, 0, QHD);
        const n = columnsOf(next.modCategories[0]!.width);
        expect(n).toBeGreaterThan(3);
        expect(sharesRowAtEveryScale([cols(n), cols(3), cols(3)])).toBe(true);
        expect(sharesRowAtEveryScale([cols(n + 1), cols(3), cols(3)])).toBe(false);
    });

    it("never mutates its input", () => {
        const b = build(category(cols(3)), category(cols(3)));
        fillRow(b, 0, QHD);
        expect(widths(b)).toEqual([cols(3), cols(3)]);
    });
});

describe("equalWidths", () => {
    it("gives every category on the row the average column count", () => {
        const b = build(category(cols(2)), category(cols(3)), category(cols(5)), category(cols(12)));
        expect(rowOf(b, 0, QHD)).toEqual([0, 1, 2]);
        const next = equalWidths(b, 1, QHD);
        expect(widths(next)).toEqual([cols(3), cols(3), cols(3), cols(12)]);
    });
});

describe("fillRowProportionally", () => {
    it("grows the row to fill keeping the column ratio", () => {
        const b = build(category(cols(2)), category(cols(4)), category(cols(12)));
        expect(rowOf(b, 0, QHD)).toEqual([0, 1]);
        const next = fillRowProportionally(b, 0, QHD);
        const [a, c] = [columnsOf(next.modCategories[0]!.width), columnsOf(next.modCategories[1]!.width)];
        expect(a).toBeGreaterThan(2);
        expect(c).toBeGreaterThanOrEqual(2 * a - 1);
        expect(sharesRowAtEveryScale([cols(a), cols(c)])).toBe(true);
        expect(sharesRowAtEveryScale([cols(a + 1), cols(c)])).toBe(false);
        expect(sharesRowAtEveryScale([cols(a), cols(c + 1)])).toBe(false);
        expect(next.modCategories[2]!.width).toBe(cols(12));
    });

    it("hands the columns a whole factor leaves over to the category furthest behind", () => {
        const b = build(category(cols(2)), category(cols(2)), category(cols(3)), category(cols(12)));
        expect(rowOf(b, 0, QHD)).toEqual([0, 1, 2]);
        const next = fillRowProportionally(b, 2, QHD);
        const n = next.modCategories.slice(0, 3).map((c) => columnsOf(c.width));
        expect(sharesRowAtEveryScale(n.map(cols))).toBe(true);
        for (const i of [0, 1, 2]) {
            expect(sharesRowAtEveryScale(n.map((c, j) => cols(j === i ? c + 1 : c)))).toBe(false);
        }
    });
});

describe("equalizeHeights", () => {
    it("matches every height on the row to the tallest", () => {
        const b = build(category(cols(3), 162.75), category(cols(3), 300), category(cols(3), 200), category(cols(12)));
        expect(heights(equalizeHeights(b, 0, QHD))).toEqual([300, 300, 300, 162.75]);
    });

    it("reads a stored-without-height category at its drawn Fit height", () => {
        const b = build(category(cols(1), null, 3), category(cols(3), 162.75));
        expect(heights(equalizeHeights(b, 1, QHD))).toEqual([heightForRows(3), heightForRows(3)]);
    });
});

describe("equalRows", () => {
    it("snaps the row to the whole chip rows the tallest holds", () => {
        const b = build(category(cols(3), 162.75), category(cols(3), 300), category(cols(12)));
        expect(heights(equalRows(b, 0, QHD))).toEqual([heightForRows(2), heightForRows(2), 162.75]);
    });
});

describe("setSize and sizeOf", () => {
    it("writes the safe width for the columns and the Fit height for the rows", () => {
        const next = setSize(build(category(300, 500)), 0, 4, 2);
        expect(next.modCategories[0]).toMatchObject({ width: cols(4), height: heightForRows(2) });
    });

    it("reads a category back as columns at every scale and whole rows", () => {
        const b = build(category(cols(4), heightForRows(2)), category(null, null, 3));
        expect(sizeOf(b, 0, QHD)).toEqual({ columns: 4, rows: 2, width: cols(4), height: heightForRows(2) });
        expect(sizeOf(b, 1, QHD)).toEqual({ columns: 3, rows: 1, width: cols(3), height: heightForRows(1) });
    });

    it("pastes a copied size", () => {
        const next = pasteSize(build(category(null, null)), 0, { width: 400.5, height: 222 });
        expect(next.modCategories[0]).toMatchObject({ width: 400.5, height: 222 });
    });
});
