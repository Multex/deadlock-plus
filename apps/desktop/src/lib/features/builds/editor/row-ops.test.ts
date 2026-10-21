import { describe, expect, it } from "vitest";
import {
    MAX_COLUMNS_EVERYWHERE,
    SAFE_MAX_WIDTH_EVERYWHERE,
    layoutBuild,
    layoutPreview,
    minHeightForRowsEverywhere,
    minWidthForColumns,
    minWidthForColumnsEverywhere,
    sharesRowEverywhere,
    type Screen,
} from "@deadlock-plus/build-layout";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import {
    equalRows,
    equalWidths,
    equalizeHeights,
    fillRow,
    fillRowProportionally,
    fitEverywhere,
    heightForRows,
    pasteSize,
    rowLimit,
    rowOf,
    setSize,
    sizeOf,
} from "./row-ops";

const FHD: Screen = { width: 1920, height: 1080 };
const QHD: Screen = { width: 2560, height: 1440 };
const UHD: Screen = { width: 3840, height: 2160 };

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
const ew = (n: number) => minWidthForColumnsEverywhere(n);
/** The column count whose everywhere-safe width is `width`. */
function columnsOf(width: number | null): number {
    const n = Array.from({ length: MAX_COLUMNS_EVERYWHERE }, (_, i) => i + 1).find((c) => ew(c) === width);
    expect(n, `${width} is an everywhere-safe width`).toBeDefined();
    return n!;
}

describe("heightForRows", () => {
    it("is the smallest height that holds whole rows in the shop and the Build Browser preview", () => {
        expect(heightForRows(1)).toBe(169);
        expect(heightForRows(3)).toBe(410);
        expect(heightForRows(0)).toBe(169);
        expect(heightForRows(5)).toBe(minHeightForRowsEverywhere(5));
    });
});

describe("fitEverywhere", () => {
    it("fits up to the most everywhere-safe columns on one row", () => {
        expect(fitEverywhere(0)).toEqual({ width: 99, height: 169, columns: 1, rows: 1 });
        expect(fitEverywhere(4)).toEqual({ width: 347, height: 169, columns: 4, rows: 1 });
        expect(fitEverywhere(MAX_COLUMNS_EVERYWHERE)).toMatchObject({ width: ew(MAX_COLUMNS_EVERYWHERE), rows: 1 });
    });

    it("splits more items over the fewest rows, columns as even as they go", () => {
        const fit = fitEverywhere(MAX_COLUMNS_EVERYWHERE + 1);
        expect(fit.rows).toBe(2);
        expect(fit.columns).toBe(Math.ceil((MAX_COLUMNS_EVERYWHERE + 1) / 2));
        expect(fit).toMatchObject({ width: ew(fit.columns), height: 289 });
    });

    it("never goes past the everywhere-safe cap", () => {
        expect(fitEverywhere(40).width).toBeLessThanOrEqual(SAFE_MAX_WIDTH_EVERYWHERE);
    });
});

describe("rowOf", () => {
    it("groups the categories the flow draws on one row", () => {
        const b = build(category(cols(3)), category(cols(3)), category(cols(3)), category(cols(3)));
        expect(rowOf(b, 1, QHD)).toEqual([0, 1, 2]);
        expect(rowOf(b, 3, QHD)).toEqual([3]);
    });
});

/** The flow row of every category at `screen`, as row numbers. */
function rows(widths: readonly number[], screen: Screen): number[] {
    const placed = layoutBuild(
        widths.map((width) => ({ width, height: 162.75, items: 1 })),
        screen,
    ).categories;
    const tops = [...new Set(placed.map((c) => c.box.y))];
    return placed.map((c) => tops.indexOf(c.box.y));
}

function previewRows(widths: readonly number[], screen: Screen): number[] {
    const placed = layoutPreview(
        widths.map((width) => ({ width, height: 162.75, items: 1 })),
        screen,
    ).categories;
    const tops = [...new Set(placed.map((c) => c.box.y))];
    return placed.map((c) => tops.indexOf(c.box.y));
}

function withWidth(b: BuildView, index: number, width: number): number[] {
    return b.modCategories.map((c, i) => (i === index ? width : c.width!));
}

describe("rowLimit", () => {
    it("stops the second of two categories at the row edge of the shop and the preview", () => {
        const b = build(category(cols(3)), category(cols(4)));
        const limit = rowLimit(b, 1, QHD)!;
        expect(sharesRowEverywhere([cols(3), limit])).toBe(true);
        expect(sharesRowEverywhere([cols(3), limit + 0.25])).toBe(false);
    });

    it("keeps every row member on its row in the shop and the preview at 1080p, 1440p and 2160p", () => {
        const cases: [BuildView, number][] = [
            [build(category(cols(3)), category(cols(4))), 1],
            [build(category(cols(3)), category(cols(4))), 0],
            [build(category(cols(3)), category(cols(4)), category(cols(3))), 1],
            [build(category(cols(3)), category(cols(4)), category(cols(3))), 2],
            [build(category(257.75), category(cols(2)), category(175.5)), 1],
        ];
        for (const [b, index] of cases) {
            const limit = rowLimit(b, index, QHD)!;
            const before = b.modCategories.map((c) => c.width!);
            const row = rowOf(b, index, QHD);
            for (const screen of [FHD, QHD, UHD]) {
                expect(rows(withWidth(b, index, limit), screen)).toEqual(rows(before, screen));
                expect(previewRows(withWidth(b, index, limit), screen)).toEqual(rows(before, screen));
            }
            const wider = withWidth(b, index, limit + 0.25);
            expect(sharesRowEverywhere(row.map((i) => wider[i]!))).toBe(false);
        }
    });

    it("limits the first category by the ones it would push", () => {
        const b = build(category(cols(3)), category(cols(4)), category(cols(3)));
        const limit = rowLimit(b, 0, QHD)!;
        expect(sharesRowEverywhere([limit, cols(4), cols(3)])).toBe(true);
        expect(sharesRowEverywhere([limit + 0.25, cols(4), cols(3)])).toBe(false);
    });

    it("ignores the categories on other rows", () => {
        const b = build(category(cols(3)), category(cols(3)), category(cols(3)), category(cols(3)), category(cols(4)));
        expect(rowOf(b, 3, QHD)).toEqual([3, 4]);
        expect(rowLimit(b, 3, QHD)).toBe(rowLimit(build(category(cols(3)), category(cols(4))), 0, QHD));
    });

    it("is the safe maximum for a category alone on its row", () => {
        const b = build(category(cols(3)), category(cols(3)), category(cols(3)), category(cols(3)));
        expect(rowLimit(b, 3, QHD)).toBe(SAFE_MAX_WIDTH_EVERYWHERE);
    });

    it("counts a category without a stored width at its Fit width", () => {
        const b = build(category(null, null, 3), category(cols(4)));
        expect(rowLimit(b, 1, QHD)).toBe(rowLimit(build(category(cols(3)), category(cols(4))), 1, QHD));
    });
});

describe("fillRow", () => {
    it("takes the widest everywhere-safe column width under the row limit", () => {
        const b = build(category(cols(3)), category(cols(4)));
        const width = fillRow(b, 1, QHD).modCategories[1]!.width!;
        const limit = rowLimit(b, 1, QHD)!;
        const n = columnsOf(width);
        expect(width).toBeLessThanOrEqual(limit);
        expect(ew(n + 1)).toBeGreaterThan(limit);
    });

    it("widens a lone category to the widest everywhere-safe width", () => {
        const b = build(category(cols(3)), category(cols(3)), category(cols(3)), category(cols(3)));
        const next = fillRow(b, 3, QHD);
        expect(next.modCategories[3]!.width).toBe(ew(MAX_COLUMNS_EVERYWHERE));
        expect(next.modCategories[3]!.width).toBeLessThanOrEqual(SAFE_MAX_WIDTH_EVERYWHERE);
        expect(widths(next).slice(0, 3)).toEqual([cols(3), cols(3), cols(3)]);
    });

    it("takes the most columns that still share the row at every scale", () => {
        const b = build(category(cols(3)), category(cols(3)), category(cols(3)), category(cols(3)));
        const next = fillRow(b, 0, QHD);
        const n = columnsOf(next.modCategories[0]!.width);
        expect(n).toBeGreaterThan(3);
        expect(sharesRowEverywhere([ew(n), cols(3), cols(3)])).toBe(true);
        expect(sharesRowEverywhere([ew(n + 1), cols(3), cols(3)])).toBe(false);
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
        expect(widths(next)).toEqual([ew(3), ew(3), ew(3), cols(12)]);
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
        expect(sharesRowEverywhere([ew(a), ew(c)])).toBe(true);
        expect(sharesRowEverywhere([ew(a + 1), ew(c)])).toBe(false);
        expect(sharesRowEverywhere([ew(a), ew(c + 1)])).toBe(false);
        expect(next.modCategories[2]!.width).toBe(cols(12));
    });

    it("hands the columns a whole factor leaves over to the category furthest behind", () => {
        const b = build(category(cols(2)), category(cols(2)), category(cols(3)), category(cols(12)));
        expect(rowOf(b, 0, QHD)).toEqual([0, 1, 2]);
        const next = fillRowProportionally(b, 2, QHD);
        const n = next.modCategories.slice(0, 3).map((c) => columnsOf(c.width));
        expect(sharesRowEverywhere(n.map(ew))).toBe(true);
        for (const i of [0, 1, 2]) {
            expect(sharesRowEverywhere(n.map((c, j) => ew(j === i ? c + 1 : c)))).toBe(false);
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
        expect(heights(equalizeHeights(b, 1, QHD))).toEqual([402.75, 402.75]);
    });
});

describe("equalRows", () => {
    it("snaps the row to the whole chip rows the tallest holds", () => {
        const b = build(category(cols(3), 162.75), category(cols(3), 300), category(cols(12)));
        expect(heights(equalRows(b, 0, QHD))).toEqual([heightForRows(2), heightForRows(2), 162.75]);
    });
});

describe("setSize and sizeOf", () => {
    it("writes the everywhere-safe width for the columns and height for the rows", () => {
        const next = setSize(build(category(300, 500)), 0, 4, 2);
        expect(next.modCategories[0]).toMatchObject({ width: 347, height: 289 });
    });

    it("clamps the columns to the everywhere-safe maximum", () => {
        const next = setSize(build(category(300, 500)), 0, 40, 1);
        expect(next.modCategories[0]!.width).toBe(ew(MAX_COLUMNS_EVERYWHERE));
    });

    it("reads a category back as columns at every scale and whole rows", () => {
        const b = build(category(ew(4), heightForRows(2)), category(null, null, 3));
        expect(sizeOf(b, 0, QHD)).toEqual({ columns: 4, rows: 2, width: ew(4), height: heightForRows(2) });
        expect(sizeOf(b, 1, QHD)).toEqual({ columns: 3, rows: 1, width: cols(3), height: 162.75 });
    });

    it("pastes a copied size", () => {
        const next = pasteSize(build(category(null, null)), 0, { width: 400.5, height: 222 });
        expect(next.modCategories[0]).toMatchObject({ width: 400.5, height: 222 });
    });
});
