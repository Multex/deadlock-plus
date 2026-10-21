import { describe, expect, it } from "vitest";
import type { Screen } from "@deadlock-plus/build-layout";
import { geometry } from "@deadlock-plus/build-layout/layout";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import { fitSize, shopView } from "../../../shop-view";
import { sizeTag } from "../../../editor/resize";
import { canvasView, categoryBar, dropTarget, itemCaret, slotBoxes, storedSize } from "./geometry";

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
        const empty = fitSize(0);
        const withTile = shopView([...BUILD, category(empty.width, 0, empty.height)], QHD, AVAILABLE, "fit");
        expect(tile).toEqual(withTile.categories.at(-1)!.box);
        expect(view.contentHeight).toBe(withTile.contentHeight);
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
