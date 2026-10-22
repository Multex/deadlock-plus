import type { HeroStatsData } from "@deadlock-plus/ipc-types/HeroStatsData";
import type { InvestmentTier } from "@deadlock-plus/ipc-types/InvestmentTier";
import type { ItemStat } from "@deadlock-plus/ipc-types/ItemStat";
import { describe, expect, it } from "vitest";
import type { ShopItem, ShopSlot } from "./catalog";
import { heroStatsAt, investmentBonus, itemDetails, slotSpend, type StatCatalog } from "./hero-stats";

const tiers = (rows: [number, number][]): InvestmentTier[] =>
    rows.map(([souls, bonus]) => ({ souls, bonus, percentOnGraph: 7 }));

/** Seven's numbers on game build 6810; investment tiers trimmed to the first few. */
const SEVEN: HeroStatsData = {
    heroId: 2,
    base: { EMaxHealth: 730, ELightMeleeDamage: 50, EHeavyMeleeDamage: 116, ETechDuration: 1, ETechRange: 1 },
    perLevel: {
        MODIFIER_VALUE_BASE_BULLET_DAMAGE_FROM_LEVEL: 0.24,
        MODIFIER_VALUE_BASE_HEALTH_FROM_LEVEL: 41,
        MODIFIER_VALUE_TECH_POWER: 1.1,
        MODIFIER_VALUE_BOON_COUNT: 1,
        MODIFIER_VALUE_SOMETHING_NEW: 3,
    },
    investment: {
        weapon: tiers([
            [800, 9],
            [1600, 12],
            [2400, 15],
        ]),
        spirit: tiers([
            [800, 7],
            [1600, 11],
        ]),
        vitality: tiers([
            [800, 9],
            [1600, 12],
        ]),
    },
    bulletDamage: 10.8,
};

const item = (id: number, slot: ShopSlot, cost: number, componentIds: number[] = []): ShopItem => ({
    id,
    className: `upgrade_${id}`,
    name: `Item ${id}`,
    slot,
    tier: 1,
    cost,
    active: false,
    componentIds,
    shopable: true,
    disabled: false,
});

const stat = (provides: string, value: number, flat = true): ItemStat => ({
    key: provides,
    value,
    unit: null,
    label: provides,
    flat,
    provides,
    section: "innate",
});

const HEADSHOT_BOOSTER = 1;
const EXTRA_SPIRIT = 2;
const IMPROVED_SPIRIT = 3;
const EXTRA_HEALTH = 4;
const DURATION_EXTENDER = 5;
const MYSTERY = 6;

const CATALOG: StatCatalog = {
    byId: new Map([
        [HEADSHOT_BOOSTER, item(HEADSHOT_BOOSTER, "weapon", 800)],
        [EXTRA_SPIRIT, item(EXTRA_SPIRIT, "spirit", 800)],
        [IMPROVED_SPIRIT, item(IMPROVED_SPIRIT, "spirit", 1600, [EXTRA_SPIRIT])],
        [EXTRA_HEALTH, item(EXTRA_HEALTH, "vitality", 800)],
        [DURATION_EXTENDER, item(DURATION_EXTENDER, "spirit", 800)],
        [MYSTERY, item(MYSTERY, "weapon", 800)],
    ]),
    statsById: new Map([
        [HEADSHOT_BOOSTER, [stat("MODIFIER_VALUE_WEAPON_DAMAGE_INCREASE", 40, false)]],
        [EXTRA_SPIRIT, [stat("MODIFIER_VALUE_TECH_POWER", 10)]],
        [IMPROVED_SPIRIT, [stat("MODIFIER_VALUE_TECH_POWER", 18)]],
        [EXTRA_HEALTH, [stat("MODIFIER_VALUE_HEALTH_MAX", 150)]],
        [DURATION_EXTENDER, [stat("MODIFIER_VALUE_BONUS_ABILITY_DURATION_PERCENTAGE", 13)]],
        [MYSTERY, [stat("MODIFIER_VALUE_NOT_A_HERO_STAT", 5)]],
    ]),
};

describe("slotSpend", () => {
    it("sums what each purchase costs into its slot", () => {
        expect(slotSpend([HEADSHOT_BOOSTER, EXTRA_HEALTH, EXTRA_SPIRIT], CATALOG.byId)).toEqual({
            weapon: 800,
            vitality: 800,
            spirit: 800,
        });
    });

    it("prices a chain at its top item and a repeat at nothing", () => {
        expect(slotSpend([EXTRA_SPIRIT, IMPROVED_SPIRIT, IMPROVED_SPIRIT], CATALOG.byId).spirit).toBe(1600);
    });

    it("skips ids the catalog does not know", () => {
        expect(slotSpend([999], CATALOG.byId)).toEqual({ weapon: 0, vitality: 0, spirit: 0 });
    });
});

describe("investmentBonus", () => {
    const weapon = SEVEN.investment.weapon;

    it("is 0 below the first tier", () => {
        expect(investmentBonus(weapon, 799)).toBe(0);
    });

    it("is the highest tier reached", () => {
        expect(investmentBonus(weapon, 800)).toBe(9);
        expect(investmentBonus(weapon, 2399)).toBe(12);
        expect(investmentBonus(weapon, 99_999)).toBe(15);
    });
});

describe("heroStatsAt", () => {
    it("is the hero's base stats at level 1 with no items", () => {
        const stats = heroStatsAt(SEVEN, { level: 1, itemIds: [] }, CATALOG);
        expect(stats.EMaxHealth).toBe(730);
        expect(stats.EBulletDamage).toBe(10.8);
        expect(stats.ETechPower ?? 0).toBe(0);
        expect(stats.ELevelUpBoons).toBe(0);
    });

    it("adds every level's gains after the first", () => {
        const stats = heroStatsAt(SEVEN, { level: 3, itemIds: [] }, CATALOG);
        expect(stats.EMaxHealth).toBe(730 + 2 * 41);
        expect(stats.EBulletDamage).toBeCloseTo(10.8 + 2 * 0.24);
        expect(stats.ETechPower).toBeCloseTo(2.2);
        expect(stats.ELevelUpBoons).toBe(2);
        expect(stats.ELightMeleeDamage).toBe(50);
    });

    it("adds the items' always-on stats under the hero stat they change", () => {
        const stats = heroStatsAt(SEVEN, { level: 1, itemIds: [EXTRA_HEALTH, DURATION_EXTENDER, MYSTERY] }, CATALOG);
        expect(stats.EMaxHealth).toBeCloseTo((730 + 150) * 1.09);
        expect(stats.ETechDuration).toBeCloseTo(1.13);
        expect(Object.keys(stats)).not.toContain("MODIFIER_VALUE_NOT_A_HERO_STAT");
    });

    it("leaves conditional bonuses out", () => {
        const stats = heroStatsAt(SEVEN, { level: 1, itemIds: [HEADSHOT_BOOSTER] }, CATALOG);
        expect(stats.EBaseWeaponDamageIncrease).toBe(9);
    });

    it("counts an upgrade's stats, not its used-up component's", () => {
        const stats = heroStatsAt(SEVEN, { level: 1, itemIds: [EXTRA_SPIRIT, IMPROVED_SPIRIT] }, CATALOG);
        expect(stats.ETechPower).toBe(18 + 11);
    });

    it("adds slot investment: weapon damage %, flat spirit power, % health", () => {
        const stats = heroStatsAt(SEVEN, { level: 1, itemIds: [HEADSHOT_BOOSTER, EXTRA_SPIRIT] }, CATALOG);
        expect(stats.EBaseWeaponDamageIncrease).toBe(9);
        expect(stats.EBulletDamage).toBeCloseTo(10.8 * 1.09);
        expect(stats.ETechPower).toBe(10 + 7);
    });

    it("has no bullet damage while the hero's weapon is unknown", () => {
        const stats = heroStatsAt({ ...SEVEN, bulletDamage: null }, { level: 5, itemIds: [] }, CATALOG);
        expect(stats.EBulletDamage).toBeUndefined();
    });
});

describe("itemDetails", () => {
    const label = (key: string) => `label:${key}`;

    it("shows Seven's bullet damage going from 10.8 to 11.8 with 800 souls in weapon", () => {
        const details = itemDetails({
            hero: SEVEN,
            level: 1,
            ownedIds: [],
            itemId: HEADSHOT_BOOSTER,
            catalog: CATALOG,
            label,
        });
        expect(details?.groups).toHaveLength(1);
        const [row] = details!.groups[0]!.changes;
        expect(row).toMatchObject({ key: "EBulletDamage", label: "label:EBulletDamage", before: 10.8, decimals: 1 });
        expect(row!.after.toFixed(1)).toBe("11.8");
    });

    it("compares against what the build already owns at that level", () => {
        const details = itemDetails({
            hero: SEVEN,
            level: 2,
            ownedIds: [HEADSHOT_BOOSTER],
            itemId: MYSTERY,
            catalog: CATALOG,
            label,
        });
        const row = details!.groups[0]!.changes[0]!;
        expect(row.before).toBeCloseTo((10.8 + 0.24) * 1.09);
        expect(row.after).toBeCloseTo((10.8 + 0.24) * 1.12);
    });

    it("predicts a vitality item's max health", () => {
        const details = itemDetails({
            hero: SEVEN,
            level: 1,
            ownedIds: [],
            itemId: EXTRA_HEALTH,
            catalog: CATALOG,
            label,
        });
        expect(details!.groups.map((g) => g.changes.map((c) => [c.key, c.decimals]))).toEqual([[["EMaxHealth", 0]]]);
        expect(details!.groups[0]!.changes[0]!.after).toBeCloseTo(880 * 1.09);
    });

    it("gives a spirit item its spirit power group and appends the host's groups", () => {
        const details = itemDetails({
            hero: SEVEN,
            level: 1,
            ownedIds: [],
            itemId: EXTRA_SPIRIT,
            catalog: CATALOG,
            label,
            condition: "within Range",
            extraGroups: (before, after) => [
                {
                    icon: "ability.png",
                    changes: [
                        {
                            key: "ability:1:Damage",
                            label: "Damage",
                            before: 24 + 0.06 * (before.ETechPower ?? 0),
                            after: 24 + 0.06 * (after.ETechPower ?? 0),
                            decimals: 0,
                            postfix: null,
                        },
                    ],
                },
            ],
        });
        expect(details!.condition).toBe("within Range");
        expect(details!.phases).toEqual([]);
        expect(details!.groups.map((g) => g.changes[0]!.key)).toEqual(["ETechPower", "ability:1:Damage"]);
        expect(details!.groups[0]!.changes[0]).toMatchObject({ before: 0, after: 17 });
        expect(details!.groups[1]!.changes[0]!.after).toBeCloseTo(24 + 0.06 * 17);
    });

    it("leaves a weapon item's rows out while the hero's bullet damage is unknown", () => {
        const details = itemDetails({
            hero: { ...SEVEN, bulletDamage: null },
            level: 1,
            ownedIds: [],
            itemId: HEADSHOT_BOOSTER,
            catalog: CATALOG,
            label,
        });
        expect(details!.groups).toEqual([]);
    });

    it("is null for an item the catalog does not know", () => {
        expect(itemDetails({ hero: SEVEN, level: 1, ownedIds: [], itemId: 999, catalog: CATALOG, label })).toBeNull();
    });
});
