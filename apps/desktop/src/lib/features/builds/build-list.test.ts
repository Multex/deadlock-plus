import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import { describe, expect, it } from "vitest";
import { coreItems, moveSelection, pickSelection, withParam } from "./build-list";

function build(categories: { optional?: boolean; items: number[] }[]): BuildView {
    return {
        heroBuildId: 1,
        heroId: 1,
        authorAccountId: 1,
        lastUpdatedTimestamp: null,
        name: "Build",
        description: "",
        language: 0,
        version: 1,
        originBuildId: null,
        modCategories: categories.map((c, i) => ({
            name: `Category ${i}`,
            description: "",
            width: null,
            height: null,
            optional: c.optional ?? false,
            mods: c.items.map((abilityId) => ({
                abilityId,
                annotation: null,
                requiredFlexSlots: null,
                sellPriority: null,
                imbueTargetAbilityId: null,
            })),
        })),
        abilityOrder: [],
        tags: [],
        developmentBuild: false,
        publishTimestamp: null,
        favorited: false,
    };
}

// The id is the price, so a test reads which items cost most at a glance.
const priceIsId = (id: number) => (id >= 9000 ? undefined : id);

describe("coreItems", () => {
    it("picks the most expensive items and lists them in build order", () => {
        const picked = coreItems(build([{ items: [500, 6400, 800] }, { items: [1250, 3200] }]), priceIsId, 3);
        expect(picked).toEqual([6400, 1250, 3200]);
    });

    it("breaks a price tie by build order", () => {
        const price = (id: number) => (id < 10 ? 800 : 3200);
        expect(coreItems(build([{ items: [1, 2, 20] }, { items: [3, 10] }]), price, 3)).toEqual([1, 20, 10]);
    });

    it("leaves out optional categories while the build has other items", () => {
        const picked = coreItems(build([{ items: [500] }, { optional: true, items: [6400] }]), priceIsId, 6);
        expect(picked).toEqual([500]);
    });

    it("falls back to optional categories when they hold every item", () => {
        expect(coreItems(build([{ optional: true, items: [500, 800] }]), priceIsId, 6)).toEqual([500, 800]);
    });

    it("skips items the shop no longer sells and an item listed twice", () => {
        expect(coreItems(build([{ items: [9500, 800, 800] }, { items: [500] }]), priceIsId, 6)).toEqual([800, 500]);
    });

    it("takes six items by default", () => {
        const items = [100, 200, 300, 400, 500, 600, 700, 800];
        expect(coreItems(build([{ items }]), priceIsId)).toEqual([300, 400, 500, 600, 700, 800]);
    });
});

describe("moveSelection", () => {
    const keys = ["a", "b", "c"];

    it("steps down and up through the list", () => {
        expect(moveSelection(keys, "a", 1)).toBe("b");
        expect(moveSelection(keys, "c", -1)).toBe("b");
    });

    it("stops at either end instead of wrapping", () => {
        expect(moveSelection(keys, "c", 1)).toBe("c");
        expect(moveSelection(keys, "a", -1)).toBe("a");
    });

    it("jumps to the first or last row", () => {
        expect(moveSelection(keys, "b", -Infinity)).toBe("a");
        expect(moveSelection(keys, "b", Infinity)).toBe("c");
    });

    it("starts from the first row when nothing is selected, and selects nothing in an empty list", () => {
        expect(moveSelection(keys, null, 1)).toBe("a");
        expect(moveSelection(keys, "gone", 1)).toBe("a");
        expect(moveSelection([], "a", 1)).toBeNull();
    });
});

describe("pickSelection", () => {
    it("keeps the wanted row while the list holds it", () => {
        expect(pickSelection(["a", "b"], "b")).toBe("b");
    });

    it("falls back to the first row, or none in an empty list", () => {
        expect(pickSelection(["a", "b"], "gone")).toBe("a");
        expect(pickSelection(["a", "b"], null)).toBe("a");
        expect(pickSelection([], "a")).toBeNull();
    });
});

describe("withParam", () => {
    it("sets one parameter and keeps the others", () => {
        const out = withParam(new URLSearchParams("hero=13&sort=updated"), "build", "381204");
        expect(out.toString()).toBe("hero=13&sort=updated&build=381204");
    });

    it("removes the parameter for null without touching the input", () => {
        const input = new URLSearchParams("hero=13&build=1");
        expect(withParam(input, "build", null).toString()).toBe("hero=13");
        expect(input.toString()).toBe("hero=13&build=1");
    });
});
