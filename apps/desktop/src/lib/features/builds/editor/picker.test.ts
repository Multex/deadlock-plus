import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { ItemStats } from "@deadlock-plus/ipc-types/ItemStats";
import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
import { describe, expect, it } from "vitest";
import { buildShopCatalog, type ShopMetadata } from "../catalog";
import {
    FILTER_CATEGORIES,
    GRID_SLOTS,
    inBuildCounts,
    inCategories,
    itemFilters,
    nearestCard,
    PROVIDES_FILTERS,
    providedFilters,
    searchHits,
    shopGrid,
    taggedCategories,
} from "./picker";

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

const gridIds = (rows: ReturnType<typeof shopGrid>) =>
    rows.map((r) => [r.tier, r.price, r.cells.map((c) => [c.slot, c.items.map((i) => i.id)])]);

describe("shopGrid", () => {
    it("lays the shop out like the game: Weapon, Spirit, Vitality columns", () => {
        expect(GRID_SLOTS).toEqual(["weapon", "spirit", "vitality"]);
    });

    it("rows the given slots by tier with the tier price, cells in column order", () => {
        expect(gridIds(shopGrid(catalog, GRID_SLOTS))).toEqual([
            [
                1,
                800,
                [
                    ["weapon", [2, 1]],
                    ["spirit", [5]],
                    ["vitality", [4]],
                ],
            ],
            [
                2,
                1600,
                [
                    ["weapon", [3, 9]],
                    ["spirit", [6]],
                    ["vitality", []],
                ],
            ],
            [
                4,
                6400,
                [
                    ["weapon", []],
                    ["spirit", [7]],
                    ["vitality", []],
                ],
            ],
        ]);
    });

    it("keeps only the items the filter lets through and drops rows left empty", () => {
        expect(gridIds(shopGrid(catalog, ["weapon"], (i) => i.id !== 2 && i.tier === 1))).toEqual([
            [1, 800, [["weapon", [1]]]],
        ]);
    });

    it("never offers items the shop does not sell", () => {
        const ids = shopGrid(catalog, GRID_SLOTS).flatMap((r) => r.cells.flatMap((c) => c.items.map((i) => i.id)));
        expect(ids).not.toContain(8);
    });
});

describe("searchHits", () => {
    it("matches every shop item when the query is blank", () => {
        expect(searchHits(catalog, "  ")).toBeNull();
    });

    it("matches names and stat labels", () => {
        expect([...searchHits(catalog, "spirit")!].sort()).toEqual([4, 5, 7, 9]);
        expect([...searchHits(catalog, "spirit power")!]).toEqual([4]);
    });
});

describe("shop filter categories", () => {
    const shop = [...catalog.byId.values()];
    const item = (over: Partial<(typeof shop)[number]>) => ({ ...shop[0]!, ...over });

    it("holds the game's six tabs and their filters", () => {
        expect(Object.keys(FILTER_CATEGORIES)).toEqual([
            "physical",
            "spirit",
            "defense",
            "mobility",
            "disruption",
            "misc",
        ]);
        expect(FILTER_CATEGORIES.misc).toEqual(["EShopFilterActive", "EShopFilterImbue"]);
        expect(FILTER_CATEGORIES.physical).toContain("EShopFilterWeaponFireRate");
        expect(Object.values(FILTER_CATEGORIES).flat()).toHaveLength(46);
    });

    it("tags active and imbue items like the game's Misc tab", () => {
        expect(itemFilters(item({ active: false, imbue: false }))).toEqual([]);
        expect(itemFilters(item({ active: true, imbue: true }))).toEqual(["EShopFilterActive", "EShopFilterImbue"]);
    });

    it("adds the filters the game files give the item", () => {
        expect(itemFilters(item({ active: true }), ["EShopFilterMoveSpeed"])).toEqual([
            "EShopFilterActive",
            "EShopFilterMoveSpeed",
        ]);
    });

    it("adds the filters the item's vdata adds, each once", () => {
        // upgrade_phantom_strike in build 6805 adds Teleport and Grounded.
        const tagged = item({ shopFilters: ["EShopFilterTeleport", "EShopFilterStatus_Grounded"] });
        expect(itemFilters(tagged, ["EShopFilterStatus_Grounded"])).toEqual([
            "EShopFilterStatus_Grounded",
            "EShopFilterTeleport",
        ]);
    });

    it("drops the filters the item's vdata disables from the computed ones", () => {
        // upgrade_melee_rebuttal in build 6805 disables Weapon Damage and Spirit Damage.
        const tagged = item({
            active: true,
            disabledShopFilters: ["EShopFilterWeaponDamage", "EShopFilterSpiritDamage"],
        });
        expect(itemFilters(tagged, ["EShopFilterWeaponDamage", "EShopFilterMelee", "EShopFilterSpiritDamage"])).toEqual(
            ["EShopFilterActive", "EShopFilterMelee"],
        );
    });

    it("lets everything through with no category picked", () => {
        expect(inCategories([], new Set())).toBe(true);
    });

    it("keeps an item with a filter in any picked category", () => {
        const picked = new Set(["mobility", "misc"] as const);
        expect(inCategories(["EShopFilterImbue"], picked)).toBe(true);
        expect(inCategories(["EShopFilterSprint"], picked)).toBe(true);
        expect(inCategories(["EShopFilterHP"], picked)).toBe(false);
        expect(inCategories([], picked)).toBe(false);
    });

    it("lists only the categories some item is tagged with", () => {
        const tagged = taggedCategories([["EShopFilterActive"], ["EShopFilterHP", "EShopFilterBarrier"], []]);
        expect([...tagged]).toEqual(["defense", "misc"]);
    });
});

describe("providedFilters", () => {
    const stat = (provides: string | null, value: number) => ({
        key: `${provides}-${value}`,
        value,
        unit: null,
        label: "",
        flat: true,
        provides,
        section: null,
    });

    it("tags a stat by what it provides", () => {
        expect(providedFilters([stat("MODIFIER_VALUE_FIRE_RATE", 10)])).toEqual(["EShopFilterWeaponFireRate"]);
        expect(providedFilters([stat("MODIFIER_VALUE_TECH_RESIST", 12)])).toEqual(["EShopFilterSpiritResist"]);
    });

    it("reads a penalty on the enemy as disruption, not a bonus", () => {
        expect(providedFilters([stat("MODIFIER_VALUE_HEAL_AMP_RECEIVE_PERCENT", 20)])).toEqual(["EShopFilterHealing"]);
        expect(providedFilters([stat("MODIFIER_VALUE_HEAL_AMP_RECEIVE_PERCENT", -35)])).toEqual([
            "EShopFilterAntiHeal",
        ]);
        expect(providedFilters([stat("MODIFIER_VALUE_TECH_POWER", -30)])).toEqual(["EShopFilterSpiritDamageReduction"]);
    });

    it("ignores a cost the item puts on its owner", () => {
        expect(providedFilters([stat("MODIFIER_VALUE_MOVEMENT_SPEED_MAX", -0.5)])).toEqual([]);
    });

    it("tags a reduction whatever its sign", () => {
        expect(providedFilters([stat("MODIFIER_VALUE_BULLET_AND_MELEE_RESIST_REDUCTION", -10)])).toEqual([
            "EShopFilterBulletVuln",
        ]);
    });

    it("skips stats that provide nothing or something without a filter, and lists each filter once", () => {
        expect(
            providedFilters([
                stat(null, 5),
                stat("MODIFIER_VALUE_RESPAWN_TIME_PERCENTAGE", -70),
                stat("MODIFIER_VALUE_HEALTH_MAX", 100),
                stat("MODIFIER_VALUE_BASE_HEALTH_PERCENT", 5),
            ]),
        ).toEqual(["EShopFilterHP"]);
    });

    it("only names filters one of the game's tabs holds", () => {
        const known = new Set<string>(Object.values(FILTER_CATEGORIES).flat());
        for (const [up, down] of Object.values(PROVIDES_FILTERS)) {
            for (const f of [...up, ...down]) expect(known).toContain(f);
        }
    });
});
