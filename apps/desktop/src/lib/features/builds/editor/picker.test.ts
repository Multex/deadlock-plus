import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { ItemStats } from "@deadlock-plus/ipc-types/ItemStats";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import { describe, expect, it } from "vitest";
import { buildShopCatalog, type ShopMetadata } from "../catalog";
import { inBuildCounts, nearestCard, pickerGroups, sortByPopularity } from "./picker";

const PRICES = { 1: 800, 2: 1600, 3: 3200, 4: 6400 } as const;

function meta(over: Partial<ShopMetadata> & Pick<ShopMetadata, "id" | "name">): ShopMetadata {
    const tier = over.tier ?? 1;
    return {
        className: `upgrade_${over.id}`,
        slot: "weapon",
        tier,
        cost: PRICES[tier],
        active: false,
        shopable: true,
        disabled: false,
        imbue: false,
        componentIds: [],
        ...over,
    };
}

const ITEMS: ShopMetadata[] = [
    meta({ id: 1, name: "Rapid Rounds", slot: "weapon", tier: 1 }),
    meta({ id: 2, name: "Headshot Booster", slot: "weapon", tier: 1 }),
    meta({ id: 3, name: "Mystic Shot", slot: "weapon", tier: 2 }),
    meta({ id: 4, name: "Extra Health", slot: "vitality", tier: 1 }),
    meta({ id: 5, name: "Extra Spirit", slot: "spirit", tier: 1 }),
    meta({ id: 6, name: "Mystic Burst", slot: "spirit", tier: 2 }),
    meta({ id: 7, name: "Boundless Spirit", slot: "spirit", tier: 4 }),
    meta({ id: 8, name: "Hidden Shot", slot: "weapon", tier: 3, disabled: true }),
    meta({ id: 9, name: "Spirit Strike", slot: "weapon", tier: 2 }),
];

const STATS: ItemStats[] = [
    {
        itemId: 4,
        stats: [
            {
                key: "TechPower",
                value: 4,
                unit: null,
                label: "Spirit Power",
                flat: true,
                provides: "MODIFIER_VALUE_TECH_POWER",
                section: "innate",
            },
        ],
    },
];

const catalog = buildShopCatalog([], ITEMS, {}, STATS);

describe("pickerGroups", () => {
    it("lists the chosen slot as tier rows 1 to 4, each with its tier price", () => {
        const groups = pickerGroups(catalog, "weapon", "");
        expect(groups).toHaveLength(1);
        expect(groups[0]!.slot).toBe("weapon");
        expect(groups[0]!.rows.map((r) => [r.tier, r.price, r.items.map((i) => i.id)])).toEqual([
            [1, 800, [2, 1]],
            [2, 1600, [3, 9]],
            [3, 3200, []],
            [4, 6400, []],
        ]);
    });

    it("leaves items the shop does not sell out", () => {
        const ids = pickerGroups(catalog, "weapon", "").flatMap((g) => g.rows.flatMap((r) => r.items.map((i) => i.id)));
        expect(ids).not.toContain(8);
    });

    it("searches every slot, ranked like the shop search, grouped by slot", () => {
        const groups = pickerGroups(catalog, "vitality", "spirit");
        expect(groups.map((g) => g.slot)).toEqual(["weapon", "vitality", "spirit"]);
        const ids = Object.fromEntries(groups.map((g) => [g.slot, g.rows.flatMap((r) => r.items.map((i) => i.id))]));
        expect(ids).toEqual({ weapon: [9], vitality: [4], spirit: [5, 7] });
    });

    it("keeps the shop search order inside a slot: name prefix first", () => {
        const spirit = pickerGroups(catalog, "weapon", "spirit").find((g) => g.slot === "spirit")!;
        expect(spirit.rows[0]!.items.map((i) => i.name)).toEqual(["Extra Spirit", "Boundless Spirit"]);
        const prefixed = pickerGroups(catalog, "weapon", "b").find((g) => g.slot === "spirit")!;
        expect(prefixed.rows[0]!.items.map((i) => i.name)).toEqual(["Boundless Spirit", "Mystic Burst"]);
    });

    it("drops slots without a hit and shows no tier header in search", () => {
        const groups = pickerGroups(catalog, "weapon", "mystic");
        expect(groups.map((g) => g.slot)).toEqual(["weapon", "spirit"]);
        for (const g of groups) expect(g.rows.map((r) => [r.tier, r.price])).toEqual([[null, null]]);
    });

    it("finds an item by a stat label through the given matchers", () => {
        const none = pickerGroups(catalog, "weapon", "spirit power", []);
        expect(none).toEqual([]);
        const groups = pickerGroups(catalog, "weapon", "spirit power");
        expect(groups.map((g) => [g.slot, g.rows[0]!.items.map((i) => i.id)])).toEqual([["vitality", [4]]]);
    });
});

function category(...ids: number[]): ModCategoryView {
    return {
        mods: ids.map((abilityId) => ({
            abilityId,
            annotation: null,
            requiredFlexSlots: null,
            sellPriority: null,
            imbueTargetAbilityId: null,
        })),
        name: "",
        description: "",
        width: null,
        height: null,
        optional: false,
    };
}

describe("inBuildCounts", () => {
    it("counts every copy of an item across categories", () => {
        const build = { modCategories: [category(1, 2, 1), category(1, 5)] } as BuildView;
        expect(inBuildCounts(build)).toEqual(
            new Map([
                [1, 3],
                [2, 1],
                [5, 1],
            ]),
        );
    });
});

describe("nearestCard", () => {
    // Two lines of three 70 x 90 cards, then a tier row header gap and a line of two.
    const rect = (x: number, y: number) => ({ x, y, width: 70, height: 90 });
    const rects = [rect(0, 0), rect(80, 0), rect(160, 0), rect(0, 100), rect(80, 100), rect(0, 240), rect(80, 240)];

    it("moves left and right in reading order, wrapping across lines", () => {
        expect(nearestCard(rects, 1, "ArrowRight")).toBe(2);
        expect(nearestCard(rects, 2, "ArrowRight")).toBe(3);
        expect(nearestCard(rects, 3, "ArrowLeft")).toBe(2);
        expect(nearestCard(rects, 0, "ArrowLeft")).toBe(0);
        expect(nearestCard(rects, 6, "ArrowRight")).toBe(6);
    });

    it("moves up and down to the closest card on the next line", () => {
        expect(nearestCard(rects, 1, "ArrowDown")).toBe(4);
        expect(nearestCard(rects, 2, "ArrowDown")).toBe(4);
        expect(nearestCard(rects, 4, "ArrowDown")).toBe(6);
        expect(nearestCard(rects, 6, "ArrowUp")).toBe(4);
        expect(nearestCard(rects, 3, "ArrowUp")).toBe(0);
        expect(nearestCard(rects, 0, "ArrowUp")).toBe(0);
        expect(nearestCard(rects, 5, "ArrowDown")).toBe(5);
    });
});

describe("sortByPopularity", () => {
    const score = (id: number) => (({ 1: 30, 3: 5, 9: 60 }) as Record<number, number>)[id];

    it("orders each tier row by pick %, items without data last in shop order", () => {
        const groups = sortByPopularity(pickerGroups(catalog, "weapon", ""), score);
        expect(groups[0]!.rows.map((r) => r.items.map((i) => i.id))).toEqual([[1, 2], [9, 3], [], []]);
    });

    it("keeps the search ranking while searching", () => {
        const searched = pickerGroups(catalog, "weapon", "spirit");
        expect(sortByPopularity(searched, score)).toEqual(searched);
    });

    it("does not reorder the rows it was given", () => {
        const groups = pickerGroups(catalog, "weapon", "");
        sortByPopularity(groups, score);
        expect(groups[0]!.rows[0]!.items.map((i) => i.id)).toEqual([2, 1]);
    });
});
