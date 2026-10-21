import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import type { ModEntryView } from "@deadlock-plus/ipc-types/ModEntryView";
import { describe, expect, it } from "vitest";
import type { ShopItem } from "../catalog";
import {
    addCategory,
    addItems,
    duplicateCategory,
    fitToItems,
    mergeWithNext,
    moveCategory,
    moveItems,
    occurrences,
    removeCategory,
    removeItems,
    sortItems,
    splitCategory,
    updateBuild,
    updateCategory,
    updateItem,
} from "./document";

function mod(abilityId: number, annotation: string | null = null): ModEntryView {
    return { abilityId, annotation, requiredFlexSlots: null, sellPriority: null, imbueTargetAbilityId: null };
}

function cat(name: string, ids: number[], fields: Partial<ModCategoryView> = {}): ModCategoryView {
    return {
        mods: ids.map((id) => mod(id)),
        name,
        description: "",
        width: 340,
        height: 162.75,
        optional: false,
        ...fields,
    };
}

function build(...categories: ModCategoryView[]): BuildView {
    return {
        heroBuildId: 5,
        heroId: 7,
        authorAccountId: 1,
        lastUpdatedTimestamp: null,
        name: "B",
        description: "",
        language: 0,
        version: 1,
        originBuildId: null,
        modCategories: categories,
        abilityOrder: [],
        tags: [],
        developmentBuild: false,
        publishTimestamp: null,
        favorited: false,
    };
}

const ids = (b: BuildView) => b.modCategories.map((c) => c.mods.map((m) => m.abilityId));

/** Runs `fn` on a frozen deep copy, so any mutation of the input throws. */
function pure<T>(input: BuildView, fn: (b: BuildView) => T): T {
    const frozen = structuredClone(input);
    const freeze = (o: unknown) => {
        if (o && typeof o === "object") {
            Object.values(o).forEach(freeze);
            Object.freeze(o);
        }
    };
    freeze(frozen);
    return fn(frozen);
}

const BASE = build(cat("A", [1, 2, 3]), cat("B", [4, 5]), cat("C", []));

describe("addItems", () => {
    it("inserts new entries at the index", () => {
        const next = pure(BASE, (b) => addItems(b, 0, 1, [9, 8]));
        expect(ids(next)).toEqual([[1, 9, 8, 2, 3], [4, 5], []]);
        expect(next.modCategories[0]!.mods[1]).toEqual(mod(9));
    });

    it("allows an item that is already in the build, also twice in one call", () => {
        const next = pure(BASE, (b) => addItems(b, 1, 2, [4, 4]));
        expect(ids(next)[1]).toEqual([4, 5, 4, 4]);
    });

    it("clamps an index past the end", () => {
        expect(ids(pure(BASE, (b) => addItems(b, 2, 99, [1])))[2]).toEqual([1]);
    });
});

describe("moveItems", () => {
    it("moves within a category with a pre-removal index", () => {
        const next = pure(BASE, (b) => moveItems(b, [{ category: 0, index: 0 }], { category: 0, index: 3 }, false));
        expect(ids(next)[0]).toEqual([2, 3, 1]);
        const mid = pure(BASE, (b) => moveItems(b, [{ category: 0, index: 0 }], { category: 0, index: 2 }, false));
        expect(ids(mid)[0]).toEqual([2, 1, 3]);
    });

    it("moves several items across categories in their document order", () => {
        const from = [
            { category: 1, index: 0 },
            { category: 0, index: 2 },
            { category: 0, index: 0 },
        ];
        const next = pure(BASE, (b) => moveItems(b, from, { category: 1, index: 2 }, false));
        expect(ids(next)).toEqual([[2], [5, 1, 3, 4], []]);
    });

    it("copies without removing, keeping duplicates", () => {
        const from = [
            { category: 0, index: 0 },
            { category: 0, index: 1 },
        ];
        const next = pure(BASE, (b) => moveItems(b, from, { category: 0, index: 1 }, true));
        expect(ids(next)[0]).toEqual([1, 1, 2, 2, 3]);
    });

    it("keeps every field of a moved entry", () => {
        const noted = build(cat("A", []), cat("B", []));
        noted.modCategories[0]!.mods.push(mod(3, "late"));
        const next = pure(noted, (b) => moveItems(b, [{ category: 0, index: 0 }], { category: 1, index: 0 }, false));
        expect(next.modCategories[1]!.mods[0]).toEqual(mod(3, "late"));
    });

    it("moves into an empty category", () => {
        const next = pure(BASE, (b) => moveItems(b, [{ category: 1, index: 1 }], { category: 2, index: 0 }, false));
        expect(ids(next)).toEqual([[1, 2, 3], [4], [5]]);
    });
});

describe("removeItems", () => {
    it("removes every ref, across categories", () => {
        const refs = [
            { category: 0, index: 1 },
            { category: 1, index: 0 },
            { category: 0, index: 2 },
        ];
        expect(ids(pure(BASE, (b) => removeItems(b, refs)))).toEqual([[1], [5], []]);
    });
});

describe("updateItem", () => {
    it("patches one entry", () => {
        const next = pure(BASE, (b) => updateItem(b, { category: 1, index: 1 }, { annotation: "x", sellPriority: 2 }));
        expect(next.modCategories[1]!.mods[1]).toEqual({ ...mod(5, "x"), sellPriority: 2 });
        expect(next.modCategories[1]!.mods[0]).toEqual(mod(4));
    });
});

describe("categories", () => {
    it("adds an empty category at the smallest size that is safe in the shop and the Build Browser preview", () => {
        const next = pure(BASE, (b) => addCategory(b, 1, "New"));
        const fit = { width: 99, height: 169, columns: 1 };
        expect(next.modCategories.map((c) => c.name)).toEqual(["A", "New", "B", "C"]);
        expect(next.modCategories[1]).toEqual({
            mods: [],
            name: "New",
            description: "",
            width: fit.width,
            height: fit.height,
            optional: false,
        });
        expect(fit.columns).toBe(1);
    });

    it("removes a category", () => {
        expect(pure(BASE, (b) => removeCategory(b, 0)).modCategories.map((c) => c.name)).toEqual(["B", "C"]);
    });

    it("moves a category to a pre-removal insertion index", () => {
        const names = (b: BuildView) => b.modCategories.map((c) => c.name);
        expect(names(pure(BASE, (b) => moveCategory(b, 0, 2)))).toEqual(["B", "A", "C"]);
        expect(names(pure(BASE, (b) => moveCategory(b, 0, 3)))).toEqual(["B", "C", "A"]);
        expect(names(pure(BASE, (b) => moveCategory(b, 2, 0)))).toEqual(["C", "A", "B"]);
    });

    it("patches a category's fields", () => {
        const next = pure(BASE, (b) => updateCategory(b, 1, { name: "Late", optional: true, width: 94 }));
        expect(next.modCategories[1]).toEqual(cat("Late", [4, 5], { optional: true, width: 94 }));
    });

    it("duplicates a category right after itself", () => {
        const next = pure(BASE, (b) => duplicateCategory(b, 1));
        expect(ids(next)).toEqual([[1, 2, 3], [4, 5], [4, 5], []]);
        expect(next.modCategories[2]).toEqual(next.modCategories[1]);
        expect(next.modCategories[2]!.mods).not.toBe(next.modCategories[1]!.mods);
    });

    it("splits the items from `at` on into an unnamed category of the same size right after", () => {
        const sized = build(cat("A", [1, 2, 3], { width: 504, height: 282.75, description: "d", optional: true }));
        const next = pure(sized, (b) => splitCategory(b, 0, 1));
        expect(ids(next)).toEqual([[1], [2, 3]]);
        expect(next.modCategories[0]).toMatchObject({ name: "A", description: "d", width: 504, height: 282.75 });
        expect(next.modCategories[1]).toMatchObject({
            name: "",
            description: "",
            width: 504,
            height: 282.75,
            optional: true,
        });
    });

    it("merges the next category's items into this one, keeping this one's name and size", () => {
        const next = pure(BASE, (b) => mergeWithNext(b, 0));
        expect(ids(next)).toEqual([[1, 2, 3, 4, 5], []]);
        expect(next.modCategories[0]).toMatchObject({ name: "A", width: 340, height: 162.75 });
    });

    it("leaves the last category alone on merge", () => {
        expect(pure(BASE, (b) => mergeWithNext(b, 2))).toEqual(BASE);
    });

    it("fits a category to its items at everywhere-safe sizes", () => {
        const next = pure(BASE, (b) => fitToItems(b, 0));
        expect(next.modCategories[0]).toMatchObject({ width: 264, height: 169 });
    });
});

describe("sortItems", () => {
    const item = (id: number, tier: 1 | 2 | 3 | 4, cost: number, name: string): ShopItem => ({
        id,
        className: `c${id}`,
        name,
        slot: "weapon",
        tier,
        cost,
        active: false,
        componentIds: [],
        shopable: true,
        disabled: false,
    });
    const byId = new Map(
        [item(1, 3, 3000, "Zeta"), item(2, 1, 800, "Beta"), item(3, 1, 800, "Alpha"), item(4, 1, 500, "Omega")].map(
            (i) => [i.id, i],
        ),
    );

    it("orders by tier, then cost, then name, unknown ids last in their order", () => {
        const b = build(cat("A", [99, 1, 2, 98, 3, 4]));
        expect(ids(pure(b, (x) => sortItems(x, 0, byId)))[0]).toEqual([4, 3, 2, 1, 99, 98]);
    });

    it("keeps equal entries in their order", () => {
        const b = build(cat("A", []));
        b.modCategories[0]!.mods.push(mod(2, "first"), mod(1), mod(2, "second"));
        const sorted = pure(b, (x) => sortItems(x, 0, byId)).modCategories[0]!.mods;
        expect(sorted.map((m) => m.annotation)).toEqual(["first", "second", null]);
    });
});

describe("updateBuild", () => {
    it("patches the build's own fields", () => {
        const next = pure(BASE, (b) => updateBuild(b, { name: "N", tags: [3] }));
        expect(next.name).toBe("N");
        expect(next.tags).toEqual([3]);
        expect(ids(next)).toEqual(ids(BASE));
    });
});

describe("occurrences", () => {
    it("counts every copy", () => {
        const b = build(cat("A", [1, 2, 1]), cat("B", [1, 3]));
        expect(occurrences(b)).toEqual(
            new Map([
                [1, 3],
                [2, 1],
                [3, 1],
            ]),
        );
    });
});
