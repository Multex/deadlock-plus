import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import { describe, expect, it } from "vitest";
import type { ShopItem } from "../../../catalog";
import { updateItem } from "../../../editor/document";
import { fitEverywhere } from "../../../editor/row-ops";
import { compactAll, duplicateItems, parseCount, setTagSlot, swapChoices, swapItem } from "./actions";

function cat(items: number, width: number | null = 900, height: number | null = 600): ModCategoryView {
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
        heroBuildId: 5,
        heroId: 7,
        authorAccountId: 1,
        lastUpdatedTimestamp: null,
        name: "B",
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

describe("compactAll", () => {
    it("fits every category to its items", () => {
        const before = build(cat(2), cat(0, null, null), cat(9));
        const after = compactAll(before);
        after.modCategories.forEach((category, i) => {
            const fit = fitEverywhere(before.modCategories[i]!.mods.length);
            expect([category.width, category.height]).toEqual([fit.width, fit.height]);
        });
        expect(before.modCategories[0]!.width).toBe(900);
        expect(after.modCategories[0]).toMatchObject({ width: 181, height: 169 });
    });

    it("hands back the same build when nothing changes, so it costs no undo step", () => {
        const fitted = compactAll(build(cat(3), cat(5)));
        expect(compactAll(fitted)).toBe(fitted);
        const empty = build();
        expect(compactAll(empty)).toBe(empty);
    });
});

describe("setTagSlot", () => {
    it("fills a slot past the stored tags, padding the gap with empty slots", () => {
        expect(setTagSlot([], 2, 44)).toEqual([0, 0, 44]);
        expect(setTagSlot([11], 1, 44)).toEqual([11, 44]);
    });

    it("replaces and clears a slot in place", () => {
        expect(setTagSlot([11, 22, 33], 1, 44)).toEqual([11, 44, 33]);
        expect(setTagSlot([11, 22, 33], 0, 0)).toEqual([0, 22, 33]);
    });

    it("moves a tag already in another slot instead of keeping it twice", () => {
        expect(setTagSlot([11, 22, 33], 2, 11)).toEqual([0, 22, 11]);
    });

    it("ignores a slot the build page does not have", () => {
        const tags = [11];
        expect(setTagSlot(tags, 3, 44)).toBe(tags);
        expect(setTagSlot(tags, -1, 44)).toBe(tags);
    });
});

function shopItem(id: number, patch: Partial<ShopItem> = {}): ShopItem {
    return {
        id,
        className: `item_${id}`,
        name: `Item ${id}`,
        slot: "weapon",
        tier: 1,
        cost: 800,
        active: false,
        componentIds: [],
        shopable: true,
        disabled: false,
        ...patch,
    };
}

const ids = (build: BuildView) => build.modCategories.map((c) => c.mods.map((m) => m.abilityId));

describe("duplicateItems", () => {
    it("puts a copy right after the item and hands back where it went", () => {
        const after = duplicateItems(build(cat(3)), [{ category: 0, index: 0 }]);
        expect(ids(after.build)).toEqual([[1, 1, 2, 3]]);
        expect(after.copies).toEqual([{ category: 0, index: 1 }]);
    });

    it("puts copies of a selection after its last item in the earliest category it touches", () => {
        const refs = [
            { category: 1, index: 0 },
            { category: 0, index: 2 },
            { category: 1, index: 1 },
        ];
        const after = duplicateItems(build(cat(3), cat(3)), refs);
        expect(after.copies).toEqual([3, 4, 5].map((index) => ({ category: 0, index })));
        expect(ids(after.build)).toEqual([
            [1, 2, 3, 3, 1, 2],
            [1, 2, 3],
        ]);
    });

    it("hands back the same build for an empty selection", () => {
        const before = build(cat(2));
        expect(duplicateItems(before, [])).toEqual({ build: before, copies: [] });
        expect(duplicateItems(before, []).build).toBe(before);
    });
});

describe("swapChoices", () => {
    it("lists the shop's upgrades and components of an item", () => {
        const byId = new Map(
            [
                shopItem(1),
                shopItem(2),
                shopItem(3, { componentIds: [1, 2] }),
                shopItem(4, { componentIds: [3] }),
                shopItem(5, { componentIds: [3], disabled: true }),
                shopItem(6, { componentIds: [3], shopable: false }),
            ].map((i) => [i.id, i]),
        );
        const choices = swapChoices(byId.get(3), byId);
        expect(choices.upgrades.map((i) => i.id)).toEqual([4]);
        expect(choices.components.map((i) => i.id)).toEqual([1, 2]);
    });

    it("leaves out components the shop does not sell", () => {
        const byId = new Map(
            [shopItem(1, { disabled: true }), shopItem(3, { componentIds: [1, 9] })].map((i) => [i.id, i]),
        );
        expect(swapChoices(byId.get(3), byId)).toEqual({ upgrades: [], components: [] });
        expect(swapChoices(undefined, byId)).toEqual({ upgrades: [], components: [] });
    });
});

describe("swapItem", () => {
    it("replaces the item and keeps its other settings", () => {
        const before = build(cat(2));
        const notes = updateItem(before, { category: 0, index: 1 }, { annotation: "late", imbueTargetAbilityId: 9 });
        const after = swapItem(notes, { category: 0, index: 1 }, shopItem(7, { imbue: true }));
        expect(after.modCategories[0]!.mods[1]).toMatchObject({
            abilityId: 7,
            annotation: "late",
            imbueTargetAbilityId: 9,
        });
    });

    it("drops the imbue target when the new item takes none", () => {
        const before = updateItem(build(cat(1)), { category: 0, index: 0 }, { imbueTargetAbilityId: 9 });
        const after = swapItem(before, { category: 0, index: 0 }, shopItem(7));
        expect(after.modCategories[0]!.mods[0]).toMatchObject({ abilityId: 7, imbueTargetAbilityId: null });
    });
});

describe("parseCount", () => {
    it("reads blank as cleared and a whole number as itself", () => {
        expect(parseCount("  ")).toBeNull();
        expect(parseCount(" 3 ")).toBe(3);
        expect(parseCount("4294967295")).toBe(4294967295);
    });

    it("rejects what the file's uint32 cannot hold", () => {
        expect(parseCount("-1")).toBeUndefined();
        expect(parseCount("1.5")).toBeUndefined();
        expect(parseCount("abc")).toBeUndefined();
        expect(parseCount("4294967296")).toBeUndefined();
    });
});
