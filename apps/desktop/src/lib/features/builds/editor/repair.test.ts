import { describe, expect, it } from "vitest";
import {
    MAX_COLUMNS_EVERYWHERE,
    minHeightForRowsEverywhere,
    minWidthForColumns,
    minWidthForColumnsEverywhere,
    sharesRowEverywhere,
    type Screen,
} from "@deadlock-plus/build-layout";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import { fitRowColumns, layoutIssues, repairLayout } from "./repair";

const FHD: Screen = { width: 1920, height: 1080 };

function category(width: number | null, height: number | null = 162.75, items = 1, name = ""): ModCategoryView {
    return {
        mods: Array.from({ length: items }, (_, i) => ({
            abilityId: i + 1,
            annotation: null,
            requiredFlexSlots: null,
            sellPriority: null,
            imbueTargetAbilityId: null,
        })),
        name,
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
const ew = (n: number) => minWidthForColumnsEverywhere(n);
const eh = (r: number) => minHeightForRowsEverywhere(r);
const widths = (b: BuildView) => b.modCategories.map((c) => c.width);
const heights = (b: BuildView) => b.modCategories.map((c) => c.height);

describe("layoutIssues", () => {
    it("finds nothing in a build of everywhere-safe widths whose heights hold their items", () => {
        const b = build(category(ew(3), 162.75, 3), category(ew(2), 282.75, 4), category(ew(1)));
        expect(layoutIssues(b)).toEqual([]);
    });

    it("flags a width whose columns differ between 1080p, 1440p and 4K", () => {
        // 1440p's Fit width for 3 items: 3 columns there, 2 at 1080p.
        const b = build(category(257.25, 162.75, 3), category(ew(3), 162.75, 3));
        expect(layoutIssues(b)).toEqual([{ index: 0, kinds: ["columns"] }]);
    });

    it("flags a shop-safe width that the Build Browser preview shows with fewer columns", () => {
        const b = build(category(cols(3), 162.75, 3), category(ew(3), 162.75, 3));
        expect(layoutIssues(b)).toEqual([{ index: 0, kinds: ["preview_columns"] }]);
    });

    it("flags every category of a row that wraps only in the Build Browser preview", () => {
        // 520 keeps 6 columns in both views; two share a shop row at every scale but not the preview's.
        const b = build(category(520), category(520));
        expect(layoutIssues(b)).toEqual([
            { index: 0, kinds: ["preview_row"] },
            { index: 1, kinds: ["preview_row"] },
        ]);
    });

    it("flags every category of a row that wraps differently at another scale", () => {
        // 1440p wraps 600 + 449 by 1 px; 1080p fits them on one row.
        const b = build(category(600), category(449), category(cols(1)));
        const issues = layoutIssues(b);
        expect(issues.filter((issue) => issue.kinds.includes("row")).map((issue) => issue.index)).toEqual([0, 1, 2]);
    });

    it("flags a width over the safe cap, not its columns", () => {
        const b = build(category(1200, 162.75, 4));
        expect(layoutIssues(b)).toEqual([{ index: 0, kinds: ["cap"] }]);
    });

    it("flags a height shorter than its items' rows", () => {
        const b = build(category(ew(2), 162.75, 4));
        expect(layoutIssues(b)).toEqual([{ index: 0, kinds: ["height"] }]);
    });

    it("flags a category stored without a width or a height", () => {
        const b = build(category(null, null, 2), category(ew(2), null, 2), category(null, 162.75, 1));
        expect(layoutIssues(b)).toEqual([
            { index: 0, kinds: ["unsized"] },
            { index: 1, kinds: ["unsized"] },
            { index: 2, kinds: ["unsized"] },
        ]);
    });

    it("lists one category's kinds in a fixed order", () => {
        const b = build(category(257.25, 162.75, 6));
        expect(layoutIssues(b)).toEqual([{ index: 0, kinds: ["columns", "height"] }]);
    });
});

describe("fitRowColumns", () => {
    it("keeps column counts whose safe widths already share a row", () => {
        expect(fitRowColumns([3, 4, 2])).toEqual([3, 4, 2]);
    });

    it("drops a column from the widest member first, the later one on a tie", () => {
        expect(fitRowColumns([10, 5])).toEqual([6, 5]);
        expect(sharesRowEverywhere([7, 5].map(ew))).toBe(false);
        expect(fitRowColumns([6, 6, 1])).toEqual([5, 5, 1]);
        expect(sharesRowEverywhere([6, 5, 1].map(ew))).toBe(false);
    });
});

describe("repairLayout", () => {
    it("returns the same build when nothing needs repair", () => {
        const b = build(category(ew(3), 162.75, 3), category(ew(1)));
        expect(repairLayout(b)).toBe(b);
    });

    it("flags a one-column width whose chip the Build Browser preview clips", () => {
        expect(layoutIssues(build(category(cols(1))))).toEqual([{ index: 0, kinds: ["preview_columns"] }]);
    });

    it("gives an unsafe width the everywhere-safe width of its 1440p columns", () => {
        const b = build(category(257.25, 162.75, 3));
        expect(widths(repairLayout(b))).toEqual([ew(3)]);
    });

    it("gives a shop-safe width the everywhere-safe width of the same columns", () => {
        const b = build(category(cols(4), 162.75, 4), category(cols(1)));
        expect(widths(repairLayout(b))).toEqual([347, 99]);
    });

    it("brings a width over the cap down to the everywhere-safe width of the columns it shows", () => {
        const b = build(category(1200, 162.75, 4));
        expect(widths(repairLayout(b))).toEqual([ew(MAX_COLUMNS_EVERYWHERE)]);
    });

    it("narrows a row that wraps differently to everywhere-safe widths, so it lays out alike everywhere", () => {
        const b = build(category(600), category(449));
        const repaired = repairLayout(b);
        expect(widths(repaired)).toEqual([ew(7), ew(5)]);
        expect(layoutIssues(repaired)).toEqual([]);
    });

    it("narrows a row that wraps only in the Build Browser preview by its everywhere-safe columns", () => {
        const b = build(category(520), category(520));
        const repaired = repairLayout(b);
        expect(fitRowColumns([6, 6])).toEqual([6, 5]);
        expect(widths(repaired)).toEqual([ew(6), ew(5)]);
        expect(layoutIssues(repaired)).toEqual([]);
    });

    it("leaves categories without an issue as they are", () => {
        const b = build(category(300, 162.75, 3), category(257.25, 162.75, 3));
        const repaired = repairLayout(b);
        expect(repaired.modCategories[0]).toBe(b.modCategories[0]);
        expect(widths(repaired)).toEqual([300, ew(3)]);
    });

    it("grows a short height to the everywhere-safe height of its items' rows and keeps a taller one", () => {
        const b = build(category(ew(2), 162.75, 4), category(ew(2), 600, 4));
        expect(heights(repairLayout(b))).toEqual([289, 600]);
    });

    it("sizes a height to the columns the repaired width keeps", () => {
        // 6 items at 257.25: 3 columns at 1440p, 2 rows needed.
        const b = build(category(257.25, 162.75, 6));
        const repaired = repairLayout(b);
        expect(widths(repaired)).toEqual([ew(3)]);
        expect(heights(repaired)).toEqual([eh(2)]);
    });

    it("gives a missing width and height the everywhere-safe size of the columns and rows it shows", () => {
        const b = build(category(null, null, 5), category(ew(2), null, 4), category(null, 282.75, 1));
        const repaired = repairLayout(b);
        expect(widths(repaired)).toEqual([ew(5), ew(2), ew(1)]);
        expect(heights(repaired)).toEqual([169, 289, 282.75]);
    });

    it("never reorders categories or items", () => {
        const b = build(
            category(600, 162.75, 1, "a"),
            category(449, 100, 3, "b"),
            category(null, null, 2, "c"),
            category(1200, 162.75, 2, "d"),
        );
        const repaired = repairLayout(b);
        expect(repaired.modCategories.map((c) => c.name)).toEqual(["a", "b", "c", "d"]);
        expect(repaired.modCategories.map((c) => c.mods)).toEqual(b.modCategories.map((c) => c.mods));
    });

    it("keeps the columns another reference resolution shows", () => {
        // 339 draws 4 columns at 1440p and 3 at 1080p.
        const b = build(category(339, 282.75, 4));
        expect(widths(repairLayout(b))).toEqual([ew(4)]);
        expect(widths(repairLayout(b, { reference: FHD }))).toEqual([ew(3)]);
    });

    it("is idempotent and leaves no issue, over many random builds", () => {
        let seed = 7;
        const random = () => {
            seed = (seed * 1103515245 + 12345) % 2147483648;
            return seed / 2147483648;
        };
        for (let run = 0; run < 400; run++) {
            const count = 1 + Math.floor(random() * 7);
            const categories = Array.from({ length: count }, () => {
                const items = Math.floor(random() * 14);
                const width = random() < 0.1 ? null : Math.round((60 + random() * 1200) * 4) / 4;
                const height = random() < 0.1 ? null : Math.round((100 + random() * 500) * 4) / 4;
                return category(width, height, items);
            });
            const b = build(...categories);
            const once = repairLayout(b);
            expect(layoutIssues(once), JSON.stringify(widths(b))).toEqual([]);
            expect(repairLayout(once)).toBe(once);
        }
    });
});
