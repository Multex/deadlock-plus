import type { HeroStatsData } from "@deadlock-plus/ipc-types/HeroStatsData";
import type { InvestmentTier } from "@deadlock-plus/ipc-types/InvestmentTier";
import type { ItemStat } from "@deadlock-plus/ipc-types/ItemStat";
import { describe, expect, it } from "vitest";
import type { ShopItem, ShopSlot } from "./catalog";
import type { StatGroup } from "@deadlock-plus/game-ui/hero";
import {
    heroStatsAt,
    investmentBonus,
    itemDetails,
    slotSpend,
    type ItemDetailsInput,
    type StatCatalog,
} from "./hero-stats";

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
const SPIRIT_RESILIENCE = 7;
const EMBLEM = 8;
const COOLDOWN = 9;
const SLIVER = 10;

const CATALOG: StatCatalog = {
    byId: new Map([
        [HEADSHOT_BOOSTER, item(HEADSHOT_BOOSTER, "weapon", 800)],
        [EXTRA_SPIRIT, item(EXTRA_SPIRIT, "spirit", 800)],
        [IMPROVED_SPIRIT, item(IMPROVED_SPIRIT, "spirit", 1600, [EXTRA_SPIRIT])],
        [EXTRA_HEALTH, item(EXTRA_HEALTH, "vitality", 800)],
        [DURATION_EXTENDER, item(DURATION_EXTENDER, "spirit", 800)],
        [MYSTERY, item(MYSTERY, "weapon", 800)],
        [SPIRIT_RESILIENCE, item(SPIRIT_RESILIENCE, "vitality", 3200)],
        [EMBLEM, item(EMBLEM, "vitality", 1600)],
        [COOLDOWN, item(COOLDOWN, "spirit", 3200)],
        [SLIVER, item(SLIVER, "vitality", 3200)],
    ]),
    statsById: new Map([
        [HEADSHOT_BOOSTER, [stat("MODIFIER_VALUE_WEAPON_DAMAGE_INCREASE", 40, false)]],
        [EXTRA_SPIRIT, [stat("MODIFIER_VALUE_TECH_POWER", 10)]],
        [IMPROVED_SPIRIT, [stat("MODIFIER_VALUE_TECH_POWER", 18)]],
        [EXTRA_HEALTH, [stat("MODIFIER_VALUE_HEALTH_MAX", 150)]],
        [DURATION_EXTENDER, [stat("MODIFIER_VALUE_BONUS_ABILITY_DURATION_PERCENTAGE", 13)]],
        [MYSTERY, [stat("MODIFIER_VALUE_NOT_A_HERO_STAT", 5)]],
        [SPIRIT_RESILIENCE, [stat("MODIFIER_VALUE_TECH_RESIST", 55)]],
        [
            EMBLEM,
            [
                stat("MODIFIER_VALUE_TECH_RESIST", 18),
                stat("MODIFIER_VALUE_TECH_POWER", 15),
                stat("MODIFIER_VALUE_COOLDOWN_REDUCTION_PERCENTAGE", 5),
            ],
        ],
        [COOLDOWN, [stat("MODIFIER_VALUE_COOLDOWN_REDUCTION_PERCENTAGE", 40)]],
        [SLIVER, [stat("MODIFIER_VALUE_TECH_RESIST", 0.1)]],
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

    // Enchanter's Emblem capture: the HUD shows 40% ability cooldown before; +5% takes a 20s cooldown from 12 to
    // 11.4 and Jar of Dead's 120 Death Required from 72 to 68 (68.4), which adding the percents (45%) cannot give.
    it("stacks cooldown reduction multiplicatively", () => {
        const stats = heroStatsAt(SEVEN, { level: 1, itemIds: [COOLDOWN, EMBLEM] }, CATALOG);
        expect(stats.ETechCooldown).toBeCloseTo(100 - 60 * 0.95);
    });

    it("stacks spirit resist multiplicatively, 55% and 18% making 63%", () => {
        const stats = heroStatsAt(SEVEN, { level: 1, itemIds: [SPIRIT_RESILIENCE, EMBLEM] }, CATALOG);
        expect(stats.ETechArmorDamageReduction).toBeCloseTo(100 - 45 * 0.82);
    });

    it("has no bullet damage while the hero's weapon is unknown", () => {
        const stats = heroStatsAt({ ...SEVEN, bulletDamage: null }, { level: 5, itemIds: [] }, CATALOG);
        expect(stats.EBulletDamage).toBeUndefined();
    });
});

describe("itemDetails", () => {
    const label = (key: string) => `label:${key}`;
    const icon = (key: string) => `icon:${key}`;
    const details = (itemId: number, over: Partial<ItemDetailsInput> = {}) =>
        itemDetails({ hero: SEVEN, level: 1, ownedIds: [], itemId, catalog: CATALOG, label, icon, ...over })!;

    it("shows Seven's bullet damage going from 10.8 to 11.8 under the weapon ability", () => {
        const { groups } = details(HEADSHOT_BOOSTER, { weaponIcon: "weapon_damage.png" });
        expect(groups).toHaveLength(1);
        expect(groups[0]).toMatchObject({ kind: "ability", icon: "weapon_damage.png" });
        const [row] = groups[0]!.changes;
        expect(row).toMatchObject({ key: "EBulletDamage", label: "label:EBulletDamage", before: 10.8, decimals: 1 });
        expect(row!.after.toFixed(1)).toBe("11.8");
    });

    it("compares against what the build already owns at that level", () => {
        const row = details(MYSTERY, { level: 2, ownedIds: [HEADSHOT_BOOSTER] }).groups[0]!.changes[0]!;
        expect(row.before).toBeCloseTo((10.8 + 0.24) * 1.09);
        expect(row.after).toBeCloseTo((10.8 + 0.24) * 1.12);
    });

    // Headshot Booster's +30 health had no Max Health row; Enchanter's Emblem's +15 spirit had no Spirit Power row.
    it("has no Max Health or Spirit Power row", () => {
        expect(details(EXTRA_HEALTH).groups).toEqual([]);
        expect(details(EXTRA_SPIRIT).groups).toEqual([]);
    });

    it("shows Spirit Resist under its stat icon as the Enchanter's Emblem capture: 55 -> 63%", () => {
        const { groups } = details(EMBLEM, { ownedIds: [SPIRIT_RESILIENCE] });
        expect(groups).toHaveLength(1);
        expect(groups[0]).toMatchObject({ kind: "stat", icon: "icon:ETechArmorDamageReduction" });
        const row = groups[0]!.changes[0]!;
        expect(row).toMatchObject({
            key: "ETechArmorDamageReduction",
            label: "label:ETechArmorDamageReduction",
            decimals: 0,
            postfix: "%",
        });
        expect(row.before).toBeCloseTo(55);
        expect(row.after).toBeCloseTo(63.1);
    });

    it("counts a resist the hero has none of from 0", () => {
        const row = details(EMBLEM).groups[0]!.changes[0]!;
        expect([row.key, row.before, row.after]).toEqual(["ETechArmorDamageReduction", 0, 18]);
    });

    it("keeps a row whose before and after round to the same number", () => {
        const row = details(SLIVER, { ownedIds: [SPIRIT_RESILIENCE] }).groups[0]!.changes[0]!;
        expect([row.before.toFixed(0), row.after.toFixed(0)]).toEqual(["55", "55"]);
    });

    it("orders the weapon ability, the hero's other abilities, owned items, then stats", () => {
        const group = (kind: StatGroup["kind"], icon: string): StatGroup => ({
            kind,
            icon,
            changes: [{ key: icon, label: icon, before: 1, after: 2, decimals: 0, postfix: null }],
        });
        const { groups } = details(EMBLEM, {
            ownedIds: [SPIRIT_RESILIENCE],
            weaponIcon: "weapon.png",
            abilityGroups: () => [group("ability", "jar.png")],
            itemGroups: () => [group("item", "scourge.png")],
        });
        expect(groups.map((g) => [g.kind, g.icon])).toEqual([
            ["ability", "jar.png"],
            ["item", "scourge.png"],
            ["stat", "icon:ETechArmorDamageReduction"],
        ]);
        const withWeapon = details(HEADSHOT_BOOSTER, {
            weaponIcon: "weapon.png",
            abilityGroups: () => [group("ability", "jar.png")],
        }).groups;
        expect(withWeapon.map((g) => g.icon)).toEqual(["weapon.png", "jar.png"]);
    });

    it("hands the ability and item groups the hero before and after the item", () => {
        const seen: [number | undefined, number | undefined][] = [];
        details(EMBLEM, {
            abilityGroups: (before, after) => {
                seen.push([before.ETechPower, after.ETechPower]);
                return [];
            },
            itemGroups: (before, after) => {
                seen.push([before.ETechCooldown, after.ETechCooldown]);
                return [];
            },
        });
        expect(seen[0]).toEqual([0, 15]);
        expect(seen[1]![1]).toBeCloseTo(5);
    });

    it("leaves the weapon group out while the hero's bullet damage is unknown", () => {
        expect(details(HEADSHOT_BOOSTER, { hero: { ...SEVEN, bulletDamage: null } }).groups).toEqual([]);
    });

    it("passes the condition and phases through", () => {
        const out = details(HEADSHOT_BOOSTER, { condition: "within Range" });
        expect(out.condition).toBe("within Range");
        expect(out.phases).toEqual([]);
    });

    it("is null for an item the catalog does not know", () => {
        expect(itemDetails({ hero: SEVEN, level: 1, ownedIds: [], itemId: 999, catalog: CATALOG, label })).toBeNull();
    });
});
