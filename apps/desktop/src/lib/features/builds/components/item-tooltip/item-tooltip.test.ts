import type { ItemStat } from "@deadlock-plus/ipc-types/ItemStat";
import { describe, expect, it } from "vitest";
import type { ShopItem } from "../../catalog";
import { itemTooltip, romanTier, statText } from "./item-tooltip";

function stat(over: Partial<ItemStat> & Pick<ItemStat, "key" | "value" | "label">): ItemStat {
    return { unit: null, flat: true, provides: null, section: "innate", ...over };
}

const item = (id: number, over: Partial<ShopItem> = {}): ShopItem => ({
    id,
    className: `c${id}`,
    name: `Item ${id}`,
    slot: "weapon",
    tier: 1,
    cost: 800,
    active: false,
    componentIds: [],
    shopable: true,
    disabled: false,
    imbue: false,
    ...over,
});

const byId = new Map<number, ShopItem>([
    [1, item(1, { name: "Extended Magazine" })],
    [2, item(2, { name: "Titanic Magazine", tier: 3, cost: 3200, componentIds: [1] })],
    [3, item(3, { name: "Escalating Resilience", tier: 3, cost: 3200, componentIds: [1, 4] })],
    [4, item(4, { name: "Basic Part", slot: "vitality" })],
    [5, item(5, { name: "Dropped Upgrade", tier: 2, cost: 1600, componentIds: [1], disabled: true })],
    [6, item(6, { name: "Cheaper Upgrade", tier: 2, cost: 1600, componentIds: [1] })],
]);

const statsById = new Map<number, ItemStat[]>([
    [
        1,
        [
            stat({ key: "BonusClipSize", value: 30, unit: "%", label: "Max Ammo" }),
            stat({ key: "BaseAttackDamagePercent", value: 8, unit: "%", label: "Weapon Damage" }),
        ],
    ],
    [
        2,
        [
            stat({ key: "BonusClipSize", value: 60, unit: "%", label: "Max Ammo" }),
            stat({ key: "ProcDamage", value: 40, label: "Bonus Damage", flat: false, section: "passive" }),
            stat({ key: "AbilityCooldown", value: 18, unit: "s", label: "Cooldown", section: "active" }),
            stat({ key: "AbilityDuration", value: 5, unit: "s", label: "Duration", section: "active" }),
        ],
    ],
]);

describe("itemTooltip", () => {
    it("returns null for an item the catalog does not know", () => {
        expect(itemTooltip(byId, statsById, 99)).toBeNull();
    });

    it("carries the name, price and card facts", () => {
        const tip = itemTooltip(byId, statsById, 2)!;
        expect(tip).toMatchObject({ id: 2, name: "Titanic Magazine", cost: 3200, slot: "weapon", tier: 3 });
    });

    it("splits stats into the game's innate, passive and active sections", () => {
        const tip = itemTooltip(byId, statsById, 2)!;
        expect(tip.innate.map((s) => s.label)).toEqual(["Max Ammo"]);
        expect(tip.passive.map((s) => s.label)).toEqual(["Bonus Damage"]);
        expect(tip.active.map((s) => s.label)).toEqual(["Duration"]);
    });

    it("lifts the cooldown out of the stat lines into its section header", () => {
        const tip = itemTooltip(byId, statsById, 2)!;
        expect(tip.cooldown).toEqual({ section: "active", value: 18, unit: "s" });
        expect(tip.active.some((s) => s.key === "AbilityCooldown")).toBe(false);
    });

    it("has no cooldown when the item shows none", () => {
        expect(itemTooltip(byId, statsById, 1)!.cooldown).toBeNull();
    });

    it("puts stats with no tooltip section with the innate ones", () => {
        const stats = new Map([[1, [stat({ key: "Hidden", value: 3, label: "Hidden", section: null })]]]);
        expect(itemTooltip(byId, stats, 1)!.innate.map((s) => s.key)).toEqual(["Hidden"]);
    });

    it("lists what the item upgrades to: shop items only, cheapest first", () => {
        const tip = itemTooltip(byId, statsById, 1)!;
        expect(tip.upgradesTo.map((i) => i.id)).toEqual([6, 3, 2]);
    });

    it("lists what the item is built from, in the game's component order", () => {
        expect(itemTooltip(byId, statsById, 3)!.builtFrom.map((i) => i.name)).toEqual([
            "Extended Magazine",
            "Basic Part",
        ]);
    });

    it("skips components the catalog does not know", () => {
        const known = new Map(byId).set(7, item(7, { componentIds: [1, 404] }));
        expect(itemTooltip(known, statsById, 7)!.builtFrom.map((i) => i.id)).toEqual([1]);
    });

    it("has empty lists for an item with no stats, parts or upgrades", () => {
        const tip = itemTooltip(byId, statsById, 4)!;
        expect(tip.innate).toEqual([]);
        expect(tip.builtFrom).toEqual([]);
        expect(tip.upgradesTo.map((i) => i.id)).toEqual([3]);
    });
});

describe("statText", () => {
    it("signs innate bonuses like the game", () => {
        expect(statText(30, "%", true)).toBe("+30%");
        expect(statText(-20, "%", true)).toBe("-20%");
    });

    it("leaves passive and active values unsigned", () => {
        expect(statText(5, "s", false)).toBe("5s");
    });

    it("uses the given number format", () => {
        expect(statText(1200, null, true, (n) => n.toLocaleString("en-US"))).toBe("+1,200");
    });
});

describe("romanTier", () => {
    it("writes tiers 1-4 as the game's Roman numerals", () => {
        expect([1, 2, 3, 4].map((t) => romanTier(t as 1 | 2 | 3 | 4))).toEqual(["I", "II", "III", "IV"]);
    });
});
