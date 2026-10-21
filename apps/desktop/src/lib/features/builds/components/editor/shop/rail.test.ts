import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import { describe, expect, it } from "vitest";
import { buildShopCatalog, type ShopMetadata } from "../../../catalog";
import type { GamePopular } from "../../../editor/popularity";
import { addToTarget, flyoutRows, popularRows, RAIL_COLORS, RAIL_TABS, toggleTab } from "./rail";

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

const catalog = buildShopCatalog(
    [],
    [
        meta({ id: 1, name: "Rapid Rounds", slot: "weapon", tier: 1 }),
        meta({ id: 2, name: "Headshot Booster", slot: "weapon", tier: 1 }),
        meta({ id: 3, name: "Mystic Shot", slot: "weapon", tier: 2 }),
        meta({ id: 4, name: "Extra Health", slot: "vitality", tier: 1 }),
        meta({ id: 5, name: "Extra Spirit", slot: "spirit", tier: 1 }),
        meta({ id: 8, name: "Hidden Shot", slot: "weapon", tier: 3, disabled: true }),
    ],
    {},
    [],
);

const ids = (rows: ReturnType<typeof flyoutRows>) => rows.map((r) => r.items.map((i) => i.id));

describe("toggleTab", () => {
    it("opens a closed rail on the clicked tab", () => {
        expect(toggleTab(null, "spirit")).toBe("spirit");
    });

    it("switches to another tab without closing", () => {
        expect(toggleTab("weapon", "popular")).toBe("popular");
    });

    it("closes when the open tab is clicked again", () => {
        expect(toggleTab("vitality", "vitality")).toBeNull();
    });
});

describe("RAIL_COLORS", () => {
    it("paints the slot tabs in the shop's slot colours", () => {
        expect([RAIL_COLORS.weapon, RAIL_COLORS.vitality, RAIL_COLORS.spirit]).toEqual([
            "#ec9719",
            "#7bba1d",
            "#ce90ff",
        ]);
    });

    it("gives every tab its own colour", () => {
        expect(new Set(RAIL_TABS.map((tab) => RAIL_COLORS[tab])).size).toBe(RAIL_TABS.length);
    });
});

describe("popularRows", () => {
    const game = new Map<number, GamePopular[]>([
        [1, [{ phase: "early", pickPct: 20 }]],
        [
            4,
            [
                { phase: "early", pickPct: 45 },
                { phase: "late", pickPct: 3 },
            ],
        ],
        [5, [{ phase: "late", pickPct: 30 }]],
        [99, [{ phase: "early", pickPct: 90 }]],
    ]);

    it("groups the hero's popular items by phase, highest pick % first", () => {
        const rows = popularRows(catalog, game);
        expect(rows.map((r) => r.heading)).toEqual([
            { kind: "phase", phase: "early" },
            { kind: "phase", phase: "late" },
        ]);
        expect(ids(rows)).toEqual([
            [4, 1],
            [5, 4],
        ]);
    });

    it("skips items the shop does not have and phases with nothing in them", () => {
        const rows = popularRows(catalog, new Map([[99, [{ phase: "mid", pickPct: 50 }]]]));
        expect(rows).toEqual([]);
    });

    it("skips disabled items", () => {
        expect(popularRows(catalog, new Map([[8, [{ phase: "mid", pickPct: 50 }]]]))).toEqual([]);
    });
});

describe("flyoutRows", () => {
    const game = new Map<number, GamePopular[]>([[3, [{ phase: "mid", pickPct: 10 }]]]);

    it("lists a slot tab as its non-empty tier rows with the tier price", () => {
        const rows = flyoutRows(catalog, "weapon", "", game);
        expect(rows.map((r) => r.heading)).toEqual([
            { kind: "tier", tier: 1, price: 800 },
            { kind: "tier", tier: 2, price: 1600 },
        ]);
        expect(ids(rows)).toEqual([[2, 1], [3]]);
    });

    it("ignores the query outside the search tab", () => {
        expect(flyoutRows(catalog, "vitality", "rapid", game).flatMap((r) => r.items.map((i) => i.id))).toEqual([4]);
    });

    it("shows nothing on the search tab until something is typed", () => {
        expect(flyoutRows(catalog, "search", "  ", game)).toEqual([]);
    });

    it("lists search hits from every slot under a slot heading", () => {
        const rows = flyoutRows(catalog, "search", "extra", game);
        expect(rows.map((r) => r.heading)).toEqual([
            { kind: "slot", slot: "vitality" },
            { kind: "slot", slot: "spirit" },
        ]);
        expect(ids(rows)).toEqual([[4], [5]]);
    });

    it("lists the popular tab by phase", () => {
        expect(flyoutRows(catalog, "popular", "", game)).toEqual(popularRows(catalog, game));
    });

    it("gives every row a unique key", () => {
        for (const tab of ["popular", "weapon", "search"] as const) {
            const keys = flyoutRows(catalog, tab, "s", game).map((r) => r.key);
            expect(new Set(keys).size).toBe(keys.length);
        }
    });
});

describe("addToTarget", () => {
    const cat = (name: string, ids: number[]): ModCategoryView => ({
        mods: ids.map((abilityId) => ({
            abilityId,
            annotation: null,
            requiredFlexSlots: null,
            sellPriority: null,
            imbueTargetAbilityId: null,
        })),
        name,
        description: "",
        width: 340,
        height: 162.75,
        optional: false,
    });
    const build = (...modCategories: ModCategoryView[]): BuildView => ({
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
    });
    const items = (b: BuildView) => b.modCategories.map((c) => c.mods.map((m) => m.abilityId));

    it("appends to the active category", () => {
        expect(items(addToTarget(build(cat("A", [1]), cat("B", [2])), 0, [9]))).toEqual([[1, 9], [2]]);
    });

    it("appends to the last category when none is active", () => {
        expect(items(addToTarget(build(cat("A", [1]), cat("B", [2])), null, [9]))).toEqual([[1], [2, 9]]);
    });

    it("appends to the last category when the active one is gone", () => {
        expect(items(addToTarget(build(cat("A", [1])), 4, [9]))).toEqual([[1, 9]]);
    });

    it("creates a category for a build without one", () => {
        expect(items(addToTarget(build(), null, [9]))).toEqual([[9]]);
    });

    it("adds an item the build already holds again", () => {
        expect(items(addToTarget(build(cat("A", [9])), 0, [9]))).toEqual([[9, 9]]);
    });
});
