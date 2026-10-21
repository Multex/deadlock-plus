import type { AssetItem } from "@deadlock-plus/deadlock-api";
import type { ItemEntry } from "@deadlock-plus/ipc-types/ItemEntry";
import type { ShopItem as GameShopItem } from "@deadlock-plus/ipc-types/ShopItem";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { items, command, loadItemArt } = vi.hoisted(() => ({
    items: vi.fn(),
    command: vi.fn(),
    loadItemArt: vi.fn(),
}));
vi.mock("$lib/core/deadlock-api", () => ({ deadlockApi: { items } }));
vi.mock("$lib/core/tauri", () => ({ command, fileSrc: (p: string) => p }));
vi.mock("$lib/features/gamedata/gamedata", () => ({ loadItemArt }));

import {
    buildShopCatalog,
    chainCost,
    loadShopCatalog,
    searchItems,
    shopMetadata,
    type ShopItem,
    type ShopMetadata,
} from "./catalog";

function meta(over: Partial<ShopMetadata> & Pick<ShopMetadata, "id" | "className">): ShopMetadata {
    return {
        name: over.className,
        slot: "spirit",
        tier: 1,
        cost: 800,
        active: false,
        shopable: true,
        disabled: false,
        imbue: false,
        componentIds: [],
        ...over,
    };
}

const entry = (id: number, className: string, name: string, localised = true): ItemEntry => ({
    id,
    className,
    name,
    localised,
    kind: "upgrade",
});

function asset(over: Partial<AssetItem> & Pick<AssetItem, "id" | "class_name">): AssetItem {
    return {
        name: over.class_name,
        type: "upgrade",
        heroes: [],
        item_slot_type: "spirit",
        item_tier: 1,
        cost: 800,
        is_active_item: false,
        shopable: true,
        ...over,
    };
}

function game(over: Partial<GameShopItem> & Pick<GameShopItem, "id" | "className">): GameShopItem {
    return {
        slot: "spirit",
        tier: 1,
        cost: 800,
        active: false,
        components: [],
        disabled: false,
        shopable: true,
        imbue: false,
        ...over,
    };
}

/** Answers each command by name; a missing or `Error` answer rejects. */
function answer(replies: Record<string, unknown>) {
    command.mockImplementation(async (name: string) => {
        const reply = replies[name];
        if (reply === undefined || reply instanceof Error) throw reply ?? new Error(`unexpected ${name}`);
        return reply;
    });
}

beforeEach(() => {
    items.mockReset();
    command.mockReset();
    loadItemArt.mockReset();
    answer({ game_shop_items: [] });
});

describe("shopMetadata", () => {
    it("reads the game files and leaves the API alone", async () => {
        answer({
            game_shop_items: [
                game({ id: 1, className: "upgrade_a", slot: "weapon" }),
                game({
                    id: 2,
                    className: "upgrade_b",
                    tier: 2,
                    cost: 1600,
                    active: true,
                    components: [1],
                    imbue: true,
                }),
                game({ id: 3, className: "upgrade_old", disabled: true, shopable: false }),
                game({ id: 4, className: "upgrade_unreleased", tier: 5, cost: 9999 }),
            ],
        });
        const rows = await shopMetadata();
        expect(items).not.toHaveBeenCalled();
        expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
        expect(rows[0]).toEqual({
            id: 1,
            className: "upgrade_a",
            slot: "weapon",
            tier: 1,
            cost: 800,
            active: false,
            shopable: true,
            disabled: false,
            imbue: false,
            componentIds: [],
        });
        expect(rows[1]).toMatchObject({ tier: 2, cost: 1600, active: true, componentIds: [1], imbue: true });
        expect(rows[2]).toMatchObject({ disabled: true, shopable: false });
    });

    it("falls back to the API when the game files give no items", async () => {
        items.mockResolvedValue([asset({ id: 1, class_name: "upgrade_a" })]);
        const rows = await shopMetadata();
        expect(command).toHaveBeenCalledWith("game_shop_items");
        expect(rows.map((r) => r.id)).toEqual([1]);
    });

    it("falls back to the API when the game files cannot be asked", async () => {
        answer({ game_shop_items: new Error("no backend") });
        items.mockResolvedValue([asset({ id: 1, class_name: "upgrade_a" })]);
        expect((await shopMetadata()).map((r) => r.id)).toEqual([1]);
    });

    it("marks API items that imbue an ability", async () => {
        items.mockResolvedValue([
            { ...asset({ id: 1, class_name: "upgrade_a" }), imbue: "imbue_modifier_value" },
            asset({ id: 2, class_name: "upgrade_b" }),
        ]);
        expect((await shopMetadata()).map((r) => r.imbue)).toEqual([true, false]);
    });

    it("keeps shop tiers 1 to 4 of API upgrades and resolves component class names to ids", async () => {
        items.mockResolvedValue([
            asset({ id: 1, class_name: "upgrade_a" }),
            asset({
                id: 2,
                class_name: "upgrade_b",
                item_tier: 2,
                cost: 1600,
                is_active_item: true,
                component_items: ["upgrade_a"],
            }),
            asset({
                id: 3,
                class_name: "upgrade_unreleased",
                item_tier: 5,
                cost: 9999,
                shopable: false,
                disabled: true,
            }),
            asset({ id: 4, class_name: "ability_x", type: "ability", item_slot_type: undefined, item_tier: undefined }),
        ]);
        const rows = await shopMetadata();
        expect(rows.map((r) => r.id)).toEqual([1, 2]);
        expect(rows[1]).toMatchObject({ slot: "spirit", tier: 2, cost: 1600, active: true, componentIds: [1] });
    });
});

describe("buildShopCatalog", () => {
    const metas = [
        meta({ id: 1, className: "upgrade_a", name: "Alpha", cost: 800, slot: "weapon" }),
        meta({ id: 2, className: "upgrade_b", name: "Beta", tier: 2, cost: 1600, slot: "weapon", componentIds: [1] }),
        meta({ id: 3, className: "upgrade_c", name: "Gamma", slot: "vitality", cost: 800 }),
        meta({ id: 4, className: "upgrade_old", name: "Old", disabled: true, shopable: false }),
        meta({ id: 5, className: "upgrade_hidden", name: "Hidden", shopable: false }),
    ];
    const entries = [
        entry(1, "upgrade_a", "Alfa (de)"),
        entry(2, "upgrade_b", "beta", false),
        entry(9, "other", "Other"),
    ];
    const catalog = buildShopCatalog(entries, metas, { upgrade_a: "asset://a" });

    it("takes localised names from the game files and falls back to the API name", () => {
        expect(catalog.byId.get(1)?.name).toBe("Alfa (de)");
        expect(catalog.byId.get(2)?.name).toBe("Beta");
        expect(catalog.byId.get(3)?.name).toBe("Gamma");
    });

    it("names a game row without a localised name after its game entry, else its class name", () => {
        const rows = [
            { ...meta({ id: 1, className: "upgrade_a" }), name: undefined },
            { ...meta({ id: 2, className: "upgrade_b" }), name: undefined },
        ];
        const named = buildShopCatalog([entry(1, "upgrade_a", "Alpha", false)], rows, {});
        expect(named.byId.get(1)?.name).toBe("Alpha");
        expect(named.byId.get(2)?.name).toBe("upgrade_b");
    });

    it("carries the imbue flag", () => {
        const flagged = buildShopCatalog([], [meta({ id: 1, className: "upgrade_a", imbue: true })], {});
        expect(flagged.byId.get(1)?.imbue).toBe(true);
    });

    it("attaches art when the game has it", () => {
        expect(catalog.byId.get(1)?.art).toBe("asset://a");
        expect(catalog.byId.get(2)?.art).toBeUndefined();
    });

    it("keeps non-shop items in byId and out of the shop listing", () => {
        expect(catalog.byId.get(4)).toMatchObject({ disabled: true, shopable: false });
        expect(catalog.byId.has(5)).toBe(true);
        expect(catalog.byId.has(9)).toBe(false);
        const listed = Object.values(catalog.itemsBySlotTier()).flatMap((tiers) => Object.values(tiers).flat());
        expect(listed.map((i) => i.id).sort()).toEqual([1, 2, 3]);
    });

    it("groups the shop by slot and tier, cheapest then name first", () => {
        const grouped = buildShopCatalog(
            [],
            [
                meta({ id: 10, className: "x", name: "Zed", slot: "weapon" }),
                meta({ id: 11, className: "y", name: "Ann", slot: "weapon" }),
                meta({ id: 12, className: "z", name: "Mid", slot: "weapon", cost: 700 }),
            ],
            {},
        ).itemsBySlotTier();
        expect(grouped.weapon[1].map((i) => i.id)).toEqual([12, 11, 10]);
        expect(grouped.weapon[2]).toEqual([]);
        expect(grouped.spirit[4]).toEqual([]);
    });
});

describe("loadShopCatalog", () => {
    const upgrade = () => asset({ id: 1, class_name: "upgrade_a", name: "Alpha", shop_image_webp: "https://x/a.webp" });

    it("merges game names, game metadata and shop art for the locale", async () => {
        answer({
            game_shop_items: [game({ id: 1, className: "upgrade_a" })],
            game_items: [entry(1, "upgrade_a", "Alfa")],
        });
        loadItemArt.mockResolvedValue({ upgrade_a: "asset://a" });
        const catalog = await loadShopCatalog("german");
        expect(items).not.toHaveBeenCalled();
        expect(command).toHaveBeenCalledWith("game_items", { locale: "german" });
        expect(catalog.byId.get(1)).toMatchObject({ name: "Alfa", art: "asset://a" });
    });

    it("merges game names, API metadata and shop art when the game has no shop items", async () => {
        items.mockResolvedValue([upgrade()]);
        answer({ game_shop_items: [], game_items: [entry(1, "upgrade_a", "Alfa")] });
        loadItemArt.mockResolvedValue({ upgrade_a: "asset://a" });
        const catalog = await loadShopCatalog("german");
        expect(command).toHaveBeenCalledWith("game_items", { locale: "german" });
        expect(loadItemArt).toHaveBeenCalledWith(["upgrade_a"], "shop");
        expect(catalog.byId.get(1)).toMatchObject({ name: "Alfa", art: "asset://a" });
    });

    it("falls back to the API name and image when the game files are unavailable", async () => {
        items.mockResolvedValue([upgrade()]);
        answer({});
        loadItemArt.mockResolvedValue({});
        const catalog = await loadShopCatalog("english");
        expect(catalog.byId.get(1)).toMatchObject({ name: "Alpha", art: "https://x/a.webp" });
    });
});

describe("chainCost", () => {
    const item = (id: number, cost: number, componentIds: number[] = []): [number, ShopItem] => [
        id,
        {
            id,
            className: `i${id}`,
            name: `I${id}`,
            slot: "spirit",
            tier: 1,
            cost,
            active: false,
            componentIds,
            shopable: true,
            disabled: false,
            imbue: false,
        },
    ];
    const byId = new Map([
        item(1, 800),
        item(2, 1600, [1]),
        item(3, 6400, [2]),
        item(4, 3200, [5, 6]),
        item(5, 800),
        item(6, 1600),
    ]);

    it("charges full price for items without owned components", () => {
        expect(chainCost(byId, [1]).total).toBe(800);
        expect(chainCost(byId, [3]).total).toBe(6400);
    });

    it("discounts an upgrade by the full price of an owned component", () => {
        expect(chainCost(byId, [1, 2]).costs).toEqual([800, 800]);
        expect(chainCost(byId, [1, 2, 3])).toEqual({ total: 6400, costs: [800, 800, 4800] });
    });

    it("discounts through a missing middle component", () => {
        expect(chainCost(byId, [1, 3]).costs).toEqual([800, 5600]);
    });

    it("discounts each owned component of a multi-component item", () => {
        expect(chainCost(byId, [5, 4]).costs).toEqual([800, 2400]);
        expect(chainCost(byId, [5, 6, 4]).costs).toEqual([800, 1600, 800]);
    });

    it("consumes a component once an upgrade used it", () => {
        expect(chainCost(byId, [1, 2, 2]).costs).toEqual([800, 800, 1600]);
    });

    it("buys the component at full price after its upgrade", () => {
        expect(chainCost(byId, [2, 1]).costs).toEqual([1600, 800]);
    });

    it("charges nothing for ids the catalog does not know", () => {
        expect(chainCost(byId, [99, 1])).toEqual({ total: 800, costs: [0, 800] });
    });
});

describe("searchItems", () => {
    const mk = (id: number, name: string): ShopItem => ({
        id,
        className: "c",
        name,
        slot: "spirit",
        tier: 1,
        cost: 1,
        active: false,
        componentIds: [],
        shopable: true,
        disabled: false,
        imbue: false,
    });
    const list = [mk(1, "Mystic Burst"), mk(2, "Extra Spirit"), mk(3, "Spirit Strike"), mk(4, "Éclair")];

    it("returns everything for a blank query", () => {
        expect(searchItems(list, "  ")).toEqual(list);
    });

    it("matches names ignoring case and accents, prefix matches first", () => {
        expect(searchItems(list, "spirit").map((i) => i.id)).toEqual([3, 2]);
        expect(searchItems(list, "ECLAIR").map((i) => i.id)).toEqual([4]);
        expect(searchItems(list, "zzz")).toEqual([]);
    });

    it("also asks extra matchers, the hook for stat names", () => {
        const byStat = (item: ShopItem, query: string) => item.id === 1 && query === "regen";
        expect(searchItems(list, "regen", [byStat]).map((i) => i.id)).toEqual([1]);
    });
});

function cachedItems(): AssetItem[] | null {
    const dir = join(process.cwd(), "e2e/.cache/game-data/v1");
    if (!existsSync(dir)) return null;
    for (const file of readdirSync(dir)) {
        const text = readFileSync(join(dir, file), "utf8");
        const cut = text.indexOf("\n");
        if (cut >= 0 && text.slice(0, cut).includes("/assets/items")) {
            return JSON.parse(text.slice(cut + 1)) as AssetItem[];
        }
    }
    return null;
}

const real = cachedItems();

describe.skipIf(real === null)("cached item data", () => {
    it("charges the top price for the Extra Spirit chain, as the game does", async () => {
        items.mockResolvedValue(real);
        const rows = await shopMetadata();
        const catalog = buildShopCatalog([], rows, {});
        const id = (className: string) => rows.find((r) => r.className === className)!.id;
        const order = [id("upgrade_improved_spirit"), id("upgrade_soaring_spirit"), id("upgrade_boundless_spirit")];
        expect(chainCost(catalog.byId, order)).toEqual({ total: 6400, costs: [800, 800, 4800] });
    });

    it("lists only tiers 1 to 4 in the shop, each tier at one price", async () => {
        items.mockResolvedValue(real);
        const catalog = buildShopCatalog([], await shopMetadata(), {});
        const prices = { 1: 800, 2: 1600, 3: 3200, 4: 6400 } as const;
        for (const tiers of Object.values(catalog.itemsBySlotTier())) {
            for (const [tier, list] of Object.entries(tiers)) {
                expect(list.length).toBeGreaterThan(0);
                for (const i of list) expect(i.cost).toBe(prices[Number(tier) as 1 | 2 | 3 | 4]);
            }
        }
    });
});
