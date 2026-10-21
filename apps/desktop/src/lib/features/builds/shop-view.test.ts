import { describe, expect, it } from "vitest";
import { columnsAtEveryScale, layoutBuild, type Screen } from "@deadlock-plus/build-layout";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import { closestResolution, deviceScreen, fitSize, screenDifferences, shopView } from "./shop-view";

const QHD: Screen = { width: 2560, height: 1440 };
const FHD: Screen = { width: 1920, height: 1080 };
const UHD: Screen = { width: 3840, height: 2160 };

function category(width: number | null, items: number, height: number | null = 183.75): ModCategoryView {
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

const BUILD = [category(600, 3), category(449, 1), category(257.25, 6, 282.75), category(1200, 9, 900)];

describe("shopView", () => {
    it("draws native at scale 1 with layoutBuild's boxes", () => {
        const view = shopView(BUILD, QHD, 500, "native");
        const layout = layoutBuild(
            BUILD.map((c) => ({ width: c.width!, height: c.height!, items: c.mods.length })),
            QHD,
        );
        expect(view.scale).toBe(1);
        expect(view.contentWidth).toBe(layout.contentWidth);
        expect(view.categories.map((c) => c.box)).toEqual(layout.categories.map((c) => c.box));
        expect(view.categories.map((c) => c.chips)).toEqual(layout.categories.map((c) => c.chips));
        expect(view.categories.map((c) => c.index)).toEqual([0, 1, 2, 3]);
        expect(view.categories[3].capped).toBe(true);
    });

    it("scales layoutBuild's boxes to the available width in fit mode", () => {
        const native = shopView(BUILD, QHD, 0, "native");
        const view = shopView(BUILD, QHD, 713, "fit");
        expect(view.scale).toBeCloseTo(713 / 1426, 10);
        expect(view.contentWidth).toBeCloseTo(713, 10);
        expect(view.contentHeight).toBeCloseTo(native.contentHeight * view.scale, 10);
        view.categories.forEach((c, i) => {
            const n = native.categories[i];
            expect(c.columns).toBe(n.columns);
            expect(c.rows).toBe(n.rows);
            for (const key of ["x", "y", "width", "height"] as const) {
                expect(c.box[key]).toBeCloseTo(n.box[key] * view.scale, 10);
                c.chips.forEach((chip, j) => expect(chip[key]).toBeCloseTo(n.chips[j][key] * view.scale, 10));
            }
        });
    });

    it("measures content height to the bottom margin of the lowest row", () => {
        const view = shopView([category(600, 1, 162.75), category(600, 1, 300)], QHD, 0, "native");
        // Rows wrap: second category starts at 7 + 217 + 7 + 7 and ends 400 px later, plus its margin.
        expect(view.contentHeight).toBe(238 + 400 + 7);
    });

    it("passes the 1440p golden Fit build through unchanged", () => {
        const view = shopView(
            [category(100, 1, 162.75), category(257.25, 6, 282.75), category(257.25, 9, 402.75)],
            QHD,
            0,
            "native",
        );
        expect(view.categories.map((c) => c.box.width)).toEqual([133, 343, 343]);
        expect(view.categories.map((c) => c.box.height)).toEqual([217, 377, 537]);
        expect(view.categories.map((c) => c.columns)).toEqual([1, 3, 3]);
        expect(view.categories.map((c) => c.rows)).toEqual([1, 2, 3]);
        expect(view.categories[0].chips[0]).toEqual({ x: 19, y: 60, width: 101, height: 152 });
    });

    it.each([
        [600, 800],
        [449, 599],
        [451, 601],
        [187.75, 251],
        [275.5, 368],
        [277, 369],
    ])("draws golden stored width %s as %s px at 1440p", (width, px) => {
        expect(shopView([category(width, 1)], QHD, 0, "native").categories[0].box.width).toBe(px);
    });

    it("lays out a category with no stored size at our Fit size", () => {
        const fit = fitSize(4);
        const view = shopView([category(null, 4, null)], QHD, 0, "native");
        const direct = shopView([category(fit.width, 4, fit.height)], QHD, 0, "native");
        expect(view.categories[0]).toEqual(direct.categories[0]);
        expect(view.categories[0].columns).toBe(4);
        expect(view.categories[0].rows).toBe(1);
    });

    it("fills a missing width or height on its own", () => {
        const view = shopView([category(null, 2, 400), category(500, 2, null)], QHD, 0, "native");
        expect(view.categories[0].box).toMatchObject({
            width: shopView([category(176, 2, 400)], QHD, 0, "native").categories[0].box.width,
            height: 533,
        });
        expect(view.categories[1].box).toMatchObject({ width: 667, height: 217 });
    });
});

describe("shopView, wrapped category names", () => {
    it("grows each category's header by its name's lines and moves its chips down, scaled", () => {
        const flat = shopView(BUILD, QHD, 713, "fit");
        const view = shopView(BUILD, QHD, 713, "fit", [1, 2]);
        expect(view.categories.map((c) => c.header)).toEqual([41, 69, 41, 41].map((px) => px * view.scale));
        expect(view.categories[1]!.chips[0]!.y - flat.categories[1]!.chips[0]!.y).toBeCloseTo(28 * view.scale);
        expect(view.categories[0]!.chips).toEqual(flat.categories[0]!.chips);
        expect(view.categories.map((c) => c.box)).toEqual(flat.categories.map((c) => c.box));
    });

    it("reports the chip rows the stored height cuts off", () => {
        const view = shopView([category(264, 3, 162.75)], QHD, 1, "native", [2]);
        expect(view.categories[0]!.clippedRows).toBe(1);
    });
});

describe("a stored width with no stored height (our rule, not the game's)", () => {
    it("sizes the height to the rows the stored width gives", () => {
        const narrow = shopView([category(176, 4, null)], QHD, 0, "native").categories[0];
        expect(narrow.columns).toBe(2);
        expect(narrow.rows).toBe(2);
        expect(narrow.box.height).toBe(Math.round(((162.75 + 120) * 1440) / 1080));
    });

    it("keeps every chip inside its box at widths 94 to 1059", () => {
        for (const screen of [FHD, QHD, UHD]) {
            for (let items = 1; items <= 30; items++) {
                for (let width = 94; width <= 1059; width += 7) {
                    const [drawn] = shopView([category(width, items, null)], screen, 0, "native").categories;
                    const bottom = drawn.box.y + drawn.box.height;
                    for (const chip of drawn.chips) {
                        expect(
                            chip.y + chip.height,
                            `${items} items, width ${width}, ${screen.height}p`,
                        ).toBeLessThanOrEqual(bottom);
                    }
                }
            }
        }
    });
});

describe("fitSize (our rule, not the game's)", () => {
    it.each([
        [0, 94, 1],
        [1, 94, 1],
        [4, 340, 4],
        [12, 996, 12],
    ])("puts %s items in one row at the smallest safe width", (items, width, columns) => {
        expect(fitSize(items)).toEqual({ width, height: 162.75, columns, rows: 1 });
    });

    it.each([
        [13, 7, 2],
        [24, 12, 2],
        [25, 9, 3],
    ])("makes a grid when %s items do not fit one row", (items, columns, rows) => {
        const fit = fitSize(items);
        expect(fit.columns).toBe(columns);
        expect(fit.rows).toBe(rows);
        expect(fit.height).toBe(162.75 + 120 * (rows - 1));
    });

    it("keeps its columns at every scale", () => {
        for (let items = 0; items <= 40; items++) {
            const fit = fitSize(items);
            expect(columnsAtEveryScale(fit.width), `${items} items`).toBe(fit.columns);
            for (const screen of [FHD, QHD, UHD]) {
                const drawn = shopView([category(null, items, null)], screen, 0, "native").categories[0];
                expect(drawn.columns, `${items} items at ${screen.height}p`).toBe(fit.columns);
                expect(drawn.rows, `${items} items at ${screen.height}p`).toBe(Math.ceil(items / fit.columns));
                expect(drawn.capped).toBe(false);
            }
        }
    });
});

describe("closestResolution", () => {
    it.each([
        [720, "1080"],
        [1080, "1080"],
        [1200, "1080"],
        [1440, "1440"],
        [1600, "1440"],
        [2160, "2160"],
        [2880, "2160"],
    ] as const)("picks the closest preset for a %s px tall screen", (height, resolution) => {
        expect(closestResolution(height)).toBe(resolution);
    });
});

describe("deviceScreen", () => {
    it("measures the screen in device px, rounded", () => {
        expect(deviceScreen({ width: 1707, height: 960, devicePixelRatio: 1.5 })).toEqual({
            width: 2561,
            height: 1440,
        });
        expect(deviceScreen({ width: 1920, height: 1080, devicePixelRatio: 2 })).toEqual({
            width: 3840,
            height: 2160,
        });
    });
});

describe("screenDifferences", () => {
    it("is empty on a 1440p screen", () => {
        expect(screenDifferences(BUILD, QHD)).toEqual([]);
    });

    it("flags a category whose columns differ on the user's screen from 1440p", () => {
        const build = [category(600, 3), category(339, 4), category(null, 5, null)];
        expect(shopView(build, QHD, 0, "native").categories[1].columns).toBe(4);
        expect(shopView(build, FHD, 0, "native").categories[1].columns).toBe(3);
        expect(screenDifferences(build, FHD)).toEqual([{ index: 1, columns: 3, referenceColumns: 4 }]);
        expect(screenDifferences(build, UHD)).toEqual([{ index: 1, columns: 3, referenceColumns: 4 }]);
    });
});
