import { describe, expect, it } from "vitest";
import type { Screen } from "@deadlock-plus/build-layout";
import { REFERENCE_HEIGHT, geometry } from "@deadlock-plus/build-layout/layout";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import { fitSize, shopView } from "../../../shop-view";
import { sizeTag } from "../../../editor/resize";
import { canvasView, categoryBar, chipShifts, dropTarget, itemCaret, slotBoxes, storedSize } from "./geometry";
import { fitEverywhere } from "../../../editor/row-ops";

const QHD: Screen = { width: 2560, height: 1440 };
const AVAILABLE = 713;

function category(width: number | null, items: number, height: number | null = 162.75): ModCategoryView {
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

const BUILD = [category(340, 3, 282.75), category(176, 0), category(500, 2)];

function centre(box: { x: number; y: number; width: number; height: number }) {
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

describe("canvasView", () => {
    it("lays out the build as the shop does and puts the new-category tile after it", () => {
        const { view, tile } = canvasView(BUILD, QHD, AVAILABLE);
        const shop = shopView(BUILD, QHD, AVAILABLE, "fit");
        expect(view.categories).toEqual(shop.categories);
        const empty = fitEverywhere(0);
        const withTile = shopView([...BUILD, category(empty.width, 0, empty.height)], QHD, AVAILABLE, "fit");
        expect(tile).toEqual(withTile.categories.at(-1)!.box);
        expect(view.contentHeight).toBe(withTile.contentHeight);
    });

    it("also reports the height without the tile, for when no drag shows it", () => {
        const wide = [category(1000, 3), category(1000, 2)];
        const { view, bareHeight } = canvasView(wide, QHD, AVAILABLE);
        expect(bareHeight).toBeCloseTo(shopView(wide, QHD, AVAILABLE, "fit").contentHeight, 6);
        expect(bareHeight).toBeLessThan(view.contentHeight);
    });

    it("fills the available width at every resolution", () => {
        for (const screen of [{ width: 1920, height: 1080 }, QHD, { width: 3840, height: 2160 }]) {
            expect(canvasView(BUILD, screen, AVAILABLE).view.contentWidth).toBeCloseTo(AVAILABLE, 6);
        }
    });
});

describe("slotBoxes", () => {
    it("continues the chip grid past the last chip", () => {
        const { view } = canvasView(BUILD, QHD, AVAILABLE);
        const first = view.categories[0]!;
        expect(first.columns).toBe(4);
        const slots = slotBoxes(view, first, 6, QHD);
        expect(slots.slice(0, 3)).toEqual(first.chips);
        const pitch = slots[1]!.x - slots[0]!.x;
        expect(slots[3]!.x - slots[2]!.x).toBeCloseTo(pitch, 10);
        expect(slots[3]!.y).toBe(slots[0]!.y);
        expect(slots[4]!.x).toBeCloseTo(slots[0]!.x, 10);
        expect(slots[4]!.y - slots[0]!.y).toBeGreaterThan(first.chips[0]!.height);
    });

    it("starts an empty category's grid where its first chip would sit", () => {
        const { view } = canvasView(BUILD, QHD, AVAILABLE);
        const withItem = canvasView([BUILD[0]!, category(176, 1)], QHD, AVAILABLE).view;
        expect(slotBoxes(view, view.categories[1]!, 1, QHD)[0]).toEqual(withItem.categories[1]!.chips[0]);
    });
});

describe("storedSize", () => {
    it("uses the stored size when the file has one", () => {
        const { view } = canvasView(BUILD, QHD, AVAILABLE);
        expect(storedSize(BUILD[0]!, view.categories[0]!, view.unit)).toEqual({ width: 340, height: 282.75 });
    });

    it("falls back to our Fit width and the drawn height", () => {
        const fallback = [category(null, 4, null), category(176, 3, null)];
        const { view } = canvasView(fallback, QHD, AVAILABLE);
        const fit = storedSize(fallback[0]!, view.categories[0]!, view.unit);
        expect(fit.width).toBe(fitSize(4).width);
        const derived = storedSize(fallback[1]!, view.categories[1]!, view.unit);
        expect(derived.width).toBe(176);
        expect(sizeTag(derived.width, derived.height, 3, QHD).rows).toBe(view.categories[1]!.rows);
    });
});

describe("dropTarget", () => {
    const { view, tile } = canvasView(BUILD, QHD, AVAILABLE);
    const first = view.categories[0]!;

    it("inserts items before the chip under the pointer's left half", () => {
        const chip = first.chips[1]!;
        const point = { x: chip.x + chip.width * 0.25, y: chip.y + chip.height / 2 };
        expect(dropTarget(view, tile, "items", point)).toEqual({ kind: "items", category: 0, index: 1 });
    });

    it("appends items dropped on an empty part of a category", () => {
        const empty = view.categories[1]!;
        expect(dropTarget(view, tile, "items", centre(empty.box))).toEqual({ kind: "items", category: 1, index: 0 });
    });

    it("makes a new category for items dropped on the tile", () => {
        expect(dropTarget(view, tile, "items", centre(tile))).toEqual({ kind: "new-category" });
    });

    it("drops nothing outside every category", () => {
        expect(dropTarget(view, tile, "items", { x: -50, y: -50 })).toBeNull();
    });

    it("makes a new category for items dropped anywhere on an empty canvas", () => {
        const empty = canvasView([], QHD, AVAILABLE);
        expect(dropTarget(empty.view, empty.tile, "items", { x: 600, y: 400 })).toEqual({ kind: "new-category" });
    });

    it("reorders a category to the gap nearest the pointer", () => {
        const third = view.categories[2]!;
        const point = { x: third.box.x + 2, y: third.box.y + 2 };
        expect(dropTarget(view, tile, "category", point)).toEqual({ kind: "category", index: 2 });
    });
});

describe("categoryBar", () => {
    const { view } = canvasView(BUILD, QHD, AVAILABLE);
    const margin = geometry(QHD.height).margin * view.scale;

    it("sits in the gap before the category it inserts before", () => {
        const box = view.categories[1]!.box;
        expect(categoryBar(view, 1, QHD)).toEqual({ x: box.x - margin, y: box.y, height: box.height });
    });

    it("sits after the last category for the end", () => {
        const box = view.categories[2]!.box;
        expect(categoryBar(view, 3, QHD)).toEqual({ x: box.x + box.width + margin, y: box.y, height: box.height });
    });
});

describe("itemCaret", () => {
    it("sits in the margin left of the slot it inserts before", () => {
        const { view } = canvasView(BUILD, QHD, AVAILABLE);
        const slots = slotBoxes(view, view.categories[0]!, 4, QHD);
        const margin = geometry(QHD.height).chipMargin * view.scale;
        expect(itemCaret(slots, 3, view, QHD)).toEqual({
            x: slots[3]!.x - margin,
            y: slots[3]!.y,
            height: slots[3]!.height,
        });
    });
});

describe("chipShifts", () => {
    const row = (y: number, count: number) =>
        Array.from({ length: count }, (_, i) => ({ x: i * 100, y, width: 90, height: 120 }));
    const chips = [...row(0, 4), ...row(130, 2)];

    it("opens a gap at the caret: the chip before it moves left, the rest of its row moves right", () => {
        expect(chipShifts(chips, 2, 4)).toEqual([0, -4, 4, 4, 0, 0]);
    });

    it("moves only the caret's row", () => {
        expect(chipShifts(chips, 4, 4)).toEqual([0, 0, 0, 0, 4, 4]);
    });

    it("moves nothing with no caret or when appending", () => {
        expect(chipShifts(chips, null, 4)).toEqual([0, 0, 0, 0, 0, 0]);
        expect(chipShifts(chips, 6, 4)).toEqual([0, 0, 0, 0, 0, 0]);
    });
});

describe("canvasView at a zoom", () => {
    const WIDE = 2400;
    const zoomed = canvasView(BUILD, QHD, WIDE, 0.75);
    const native = shopView(BUILD, QHD, 0, "native");

    it("draws the game's px at that resolution times the zoom", () => {
        expect(zoomed.view.scale).toBeCloseTo(0.75, 10);
        expect(zoomed.view.contentWidth).toBeCloseTo(geometry(QHD.height).contentWidth * 0.75, 6);
        expect(zoomed.view.unit).toBeCloseTo((QHD.height / REFERENCE_HEIGHT) * 0.75, 10);
        zoomed.view.categories.forEach((category, i) => {
            const box = native.categories[i]!.box;
            expect(category.box.x).toBeCloseTo(box.x * 0.75, 6);
            expect(category.box.width).toBeCloseTo(box.width * 0.75, 6);
        });
    });

    it("is relative to the game's px at the previewed resolution", () => {
        const uhd = canvasView(BUILD, { width: 3840, height: 2160 }, 4000, 0.5).view;
        expect(uhd.scale).toBeCloseTo(0.5, 10);
        expect(uhd.unit).toBeCloseTo((2160 / REFERENCE_HEIGHT) * 0.5, 10);
    });

    it("falls back to Fit when the zoom would overflow the column", () => {
        const capped = canvasView(BUILD, QHD, AVAILABLE, 1);
        expect(capped.view).toEqual(canvasView(BUILD, QHD, AVAILABLE, "fit").view);
        expect(capped.view.contentWidth).toBeCloseTo(AVAILABLE, 6);
    });

    it("reports the Fit scale for the zoom control", () => {
        expect(zoomed.fit).toBeCloseTo(WIDE / geometry(QHD.height).contentWidth, 10);
    });

    it("turns a drag in px into the same game units at every zoom", () => {
        for (const screen of [{ width: 1920, height: 1080 }, QHD, { width: 3840, height: 2160 }]) {
            const pitch = geometry(screen.height).pitch.x;
            const fit = canvasView(BUILD, screen, AVAILABLE, "fit").view;
            const { view } = canvasView(BUILD, screen, 5000, 0.6);
            expect(view.scale).toBeCloseTo(0.6, 10);
            expect((pitch * view.scale) / view.unit).toBeCloseTo((pitch * fit.scale) / fit.unit, 6);
        }
    });

    it("hit-tests chips, the tile and category gaps in the zoomed px", () => {
        const { view, tile } = zoomed;
        const chip = view.categories[0]!.chips[1]!;
        expect(dropTarget(view, tile, "items", { x: chip.x + chip.width * 0.25, y: chip.y + chip.height / 2 })).toEqual(
            { kind: "items", category: 0, index: 1 },
        );
        expect(dropTarget(view, tile, "items", { x: chip.x + chip.width * 0.75, y: chip.y + chip.height / 2 })).toEqual(
            { kind: "items", category: 0, index: 2 },
        );
        expect(dropTarget(view, tile, "items", centre(tile))).toEqual({ kind: "new-category" });
        const third = view.categories[2]!;
        expect(dropTarget(view, tile, "category", { x: third.box.x + 2, y: third.box.y + 2 })).toEqual({
            kind: "category",
            index: 2,
        });
        const right = view.categories.at(-1)!.box;
        expect(dropTarget(view, tile, "items", { x: right.x + right.width + 40, y: right.y + 4 })).toBeNull();
    });

    it("places carets, bars and empty slots on the zoomed grid", () => {
        const { view } = zoomed;
        const g = geometry(QHD.height);
        const first = view.categories[0]!;
        const slots = slotBoxes(view, first, 6, QHD);
        expect(slots[3]!.x - slots[2]!.x).toBeCloseTo(g.pitch.x * 0.75, 6);
        expect(slots[4]!.y - slots[0]!.y).toBeCloseTo(g.pitch.y * 0.75, 6);
        expect(itemCaret(slots, 3, view, QHD).x).toBeCloseTo(slots[3]!.x - g.chipMargin * 0.75, 6);
        const box = view.categories[1]!.box;
        expect(categoryBar(view, 1, QHD).x).toBeCloseTo(box.x - g.margin * 0.75, 6);
    });

    it("reads the same stored size at every zoom", () => {
        const fallback = [category(176, 3, null)];
        const fit = canvasView(fallback, QHD, AVAILABLE, "fit").view;
        const near = canvasView(fallback, QHD, WIDE, 0.9).view;
        expect(storedSize(fallback[0]!, near.categories[0]!, near.unit).height).toBeCloseTo(
            storedSize(fallback[0]!, fit.categories[0]!, fit.unit).height,
            6,
        );
    });
});
