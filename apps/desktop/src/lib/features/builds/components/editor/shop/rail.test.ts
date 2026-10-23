import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import type { ShopItem as GameShopItem } from "@deadlock-plus/ipc-types/ShopItem";
import { describe, expect, it, vi } from "vitest";

const { loadShopItems } = vi.hoisted(() => ({ loadShopItems: vi.fn() }));
vi.mock("$lib/features/gamedata/vdata", () => ({ loadShopItems, loadItemStats: vi.fn() }));

import { buildShopCatalog, shopMetadata, type ShopMetadata } from "../../../catalog";
import type { GamePopular } from "../../../editor/popularity";
import { addToTarget, flyoutRows, popularRows, RAIL_COLORS, RAIL_TABS, toggleTab, type FlyoutView } from "./rail";

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
        shopFilters: [],
        disabledShopFilters: [],
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

const ids = (rows: ReturnType<typeof flyoutRows>) =>
    rows.flatMap((r) => r.cells.flatMap((c) => c.items.map((i) => i.id)));
const cells = (rows: ReturnType<typeof flyoutRows>) =>
    rows.map((r) => [r.tier, Object.fromEntries(r.cells.map((c) => [c.slot, c.items.map((i) => i.id)]))]);
const view = (over: Partial<FlyoutView> = {}): FlyoutView => ({
    query: "",
    phase: null,
    categories: new Set(),
    ...over,
});

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
        [3, [{ phase: "mid", pickPct: 10 }]],
        [99, [{ phase: "early", pickPct: 90 }]],
    ]);

    it("lays the hero's popular items out like the game's page: tier rows of Weapon, Spirit, Vitality", () => {
        expect(cells(popularRows(catalog, game, null))).toEqual([
            [1, { weapon: [1], spirit: [5], vitality: [4] }],
            [2, { weapon: [3], spirit: [], vitality: [] }],
        ]);
    });

    it("lists each popular item once even when several phases list it", () => {
        expect(ids(popularRows(catalog, game, null)).filter((id) => id === 4)).toHaveLength(1);
    });

    it("narrows to one phase", () => {
        expect(cells(popularRows(catalog, game, "late"))).toEqual([[1, { weapon: [], spirit: [5], vitality: [4] }]]);
        expect(ids(popularRows(catalog, game, "mid"))).toEqual([3]);
    });

    it("skips items the shop does not have", () => {
        expect(popularRows(catalog, new Map([[99, [{ phase: "mid", pickPct: 50 }]]]), null)).toEqual([]);
    });

    it("skips disabled items", () => {
        expect(popularRows(catalog, new Map([[8, [{ phase: "mid", pickPct: 50 }]]]), null)).toEqual([]);
    });
});

describe("flyoutRows", () => {
    const game = new Map<number, GamePopular[]>([[3, [{ phase: "mid", pickPct: 10 }]]]);

    it("keeps a slot tab to that slot's tier rows with the tier price", () => {
        const rows = flyoutRows(catalog, "weapon", view(), game);
        expect(rows.map((r) => [r.tier, r.price, r.cells.map((c) => c.slot)])).toEqual([
            [1, 800, ["weapon"]],
            [2, 1600, ["weapon"]],
        ]);
        expect(ids(rows)).toEqual([2, 1, 3]);
    });

    it("ignores the query and the categories outside the search tab", () => {
        const narrowed = view({ query: "rapid", categories: new Set(["misc"]) });
        expect(ids(flyoutRows(catalog, "vitality", narrowed, game))).toEqual([4]);
    });

    it("shows the whole shop on the search tab before anything is typed", () => {
        expect(cells(flyoutRows(catalog, "search", view({ query: "  " }), game))).toEqual([
            [1, { weapon: [2, 1], spirit: [5], vitality: [4] }],
            [2, { weapon: [3], spirit: [], vitality: [] }],
        ]);
    });

    it("filters the search grid by the query, keeping the grid's places", () => {
        expect(cells(flyoutRows(catalog, "search", view({ query: "extra" }), game))).toEqual([
            [1, { weapon: [], spirit: [5], vitality: [4] }],
        ]);
    });

    it("filters the search grid by the picked categories", () => {
        const tagged = (id: number) => (id === 1 ? ["EShopFilterWeaponFireRate"] : id === 4 ? ["EShopFilterHP"] : []);
        const rows = flyoutRows(
            catalog,
            "search",
            view({ categories: new Set(["physical"]), filtersOf: (item) => tagged(item.id) }),
            game,
        );
        expect(ids(rows)).toEqual([1]);
    });

    it("applies the query and the categories together", () => {
        const both = view({ query: "extra", categories: new Set(["misc"]), filtersOf: () => [] });
        expect(flyoutRows(catalog, "search", both, game)).toEqual([]);
    });

    it("passes the phase to the popular tab", () => {
        expect(flyoutRows(catalog, "popular", view({ phase: "mid" }), game)).toEqual(popularRows(catalog, game, "mid"));
    });

    it("gives every row a unique key", () => {
        for (const tab of ["popular", "weapon", "search"] as const) {
            const keys = flyoutRows(catalog, tab, view(), game).map((r) => r.key);
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

describe("items the game's shop does not sell", () => {
    function game(over: Partial<GameShopItem> & Pick<GameShopItem, "id" | "className">): GameShopItem {
        return {
            slot: "vitality",
            tier: 1,
            cost: 800,
            active: false,
            components: [],
            disabled: false,
            shopable: true,
            imbue: false,
            shopFilters: [],
            disabledShopFilters: [],
            ...over,
        };
    }

    // Shaped like `abilities.vdata` of build 6805: every tier 5 row is a Street Brawl item priced 9999, most of
    // them with a shop icon and not disabled.
    const rows = [
        game({ id: 1, className: "upgrade_extra_health" }),
        game({ id: 2, className: "upgrade_infinite_rounds", slot: "weapon", tier: 5, cost: 9999 }),
        game({ id: 3, className: "upgrade_shadow_step", tier: 5, cost: 9999, disabled: true, shopable: false }),
        game({ id: 4, className: "upgrade_old_health", disabled: true, shopable: false }),
        game({ id: 5, className: "upgrade_iconless_health", shopable: false }),
    ];
    const names = rows.map((r) => ({
        id: r.id,
        className: r.className,
        name: `Health ${r.id}`,
        localised: true,
        kind: "upgrade" as const,
    }));

    async function gameCatalog() {
        loadShopItems.mockResolvedValue(rows);
        return buildShopCatalog(names, await shopMetadata(), {});
    }

    const offered = (
        catalog: Awaited<ReturnType<typeof gameCatalog>>,
        popular: ReadonlyMap<number, readonly GamePopular[]>,
    ) =>
        [
            ...(["weapon", "vitality", "spirit"] as const).flatMap((tab) => flyoutRows(catalog, tab, view(), popular)),
            ...flyoutRows(catalog, "search", view(), popular),
            ...flyoutRows(catalog, "search", view({ query: "health" }), popular),
            ...flyoutRows(catalog, "popular", view(), popular),
        ].flatMap((r) => r.cells.flatMap((c) => c.items.map((i) => i.id)));

    it("offers only the items the shop sells on every tab, in search and among popular items", async () => {
        const popular = new Map<number, GamePopular[]>(rows.map((r) => [r.id, [{ phase: "early", pickPct: r.id }]]));
        const ids = offered(await gameCatalog(), popular);
        expect(ids.length).toBeGreaterThan(0);
        expect(new Set(ids)).toEqual(new Set([1]));
    });

    it("leaves Street Brawl items out of the catalog, so a build holding one shows it as removed", async () => {
        const catalog = await gameCatalog();
        expect(catalog.byId.has(2)).toBe(false);
        expect(catalog.byId.has(4)).toBe(true);
    });
});
