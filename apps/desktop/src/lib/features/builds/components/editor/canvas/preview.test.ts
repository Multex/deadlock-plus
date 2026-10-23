import { describe, expect, it } from "vitest";
import type { Screen } from "@deadlock-plus/build-layout";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import { fitSize } from "../../../shop-view";
import { previewView } from "./preview";

const QHD: Screen = { width: 2560, height: 1440 };
const FHD: Screen = { width: 1920, height: 1080 };

function category(width: number | null, height: number | null, items: number): ModCategoryView {
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

// The stored sizes of Lane, Mid and Late in the one Build Browser screenshot, at 1440p.
const SHOT = [category(258, 162.75, 2), category(340, 162.75, 3), category(176, 282.75, 3)];

describe("previewView", () => {
    it("draws the Build Browser's boxes and chips at the measured 1440p sizes", () => {
        const { view } = previewView(SHOT, QHD, 881, 1);
        expect(view.contentWidth).toBe(881);
        expect(view.categories.map((c) => [c.box.x, c.box.width, c.box.height])).toEqual([
            [4, 217, 137],
            [229, 286, 137],
            [523, 148, 238],
        ]);
        expect(view.categories.map((c) => c.columns)).toEqual([2, 3, 1]);
        expect(view.categories[0]!.chips[0]).toMatchObject({ x: 4 + 8, width: 64, height: 96 });
        expect(view.categories[0]!.chips[1]!.x - view.categories[0]!.chips[0]!.x).toBe(70);
        expect(view.header).toBe(26);
        expect(view.border).toBe(2);
        expect(view.unit).toBeCloseTo(0.84);
    });

    it("fits the content to the available width, and a zoom under fit draws at that fraction", () => {
        const fitted = previewView(SHOT, QHD, 440.5, "fit");
        expect(fitted.fit).toBeCloseTo(0.5);
        expect(fitted.view.scale).toBeCloseTo(0.5);
        expect(fitted.view.categories[0]!.box.width).toBeCloseTo(108.5);
        const zoomed = previewView(SHOT, QHD, 881, 0.75);
        expect(zoomed.view.scale).toBe(0.75);
        expect(zoomed.view.unit).toBeCloseTo(0.63);
    });

    it("is as tall as the lowest box plus its margin", () => {
        const { view } = previewView(SHOT, QHD, 881, 1);
        expect(view.contentHeight).toBe(4 + 238 + 4);
    });

    it("fills a missing size the way the shop view does", () => {
        const { view } = previewView([category(null, null, 3), category(340, null, 5)], QHD, 881, 1);
        const fit = fitSize(3);
        expect(view.categories[0]!.box.width).toBe(
            previewView([category(fit.width, fit.height, 3)], QHD, 881, 1).view.categories[0]!.box.width,
        );
        // 340 shows 4 columns in the shop at 1440p, so 5 items get two Fit rows: 282.75.
        expect(view.categories[1]!.box.height).toBe(Math.round(282.75 * 0.84));
    });

    it("scales with the screen", () => {
        const { view } = previewView(SHOT, FHD, 660, 1);
        expect(view.contentWidth).toBe(660);
        expect(view.unit).toBeCloseTo(0.63);
    });
});
