import type { HeroStats, ItemDetails, PhaseStat, StatChange, StatGroup } from "@deadlock-plus/game-ui/hero";
import type { ItemSlot } from "@deadlock-plus/game-ui/item";
import type { HeroStatsData } from "@deadlock-plus/ipc-types/HeroStatsData";
import type { InvestmentTier } from "@deadlock-plus/ipc-types/InvestmentTier";
import { chainCost, type ShopItem } from "./catalog";
import { statsSoFar, type StatsById } from "./stats";

export type StatCatalog = { byId: ReadonlyMap<number, ShopItem>; statsById: StatsById };

/** Souls spent per slot on `itemIds` bought in order, at the price each purchase costs after owned components. */
export function slotSpend(itemIds: readonly number[], byId: ReadonlyMap<number, ShopItem>): Record<ItemSlot, number> {
    const spend: Record<ItemSlot, number> = { weapon: 0, vitality: 0, spirit: 0 };
    const { costs } = chainCost(byId, itemIds);
    itemIds.forEach((id, i) => {
        const item = byId.get(id);
        if (item) spend[item.slot] += costs[i] ?? 0;
    });
    return spend;
}

/** The bonus of the highest tier `spent` reaches; 0 below the first. */
export function investmentBonus(tiers: readonly InvestmentTier[], spent: number): number {
    let bonus = 0;
    for (const tier of tiers) if (tier.souls <= spent) bonus = Math.max(bonus, tier.bonus);
    return bonus;
}

/**
 * How a modifier changes a hero stat: `add` sums into it; `factor` adds percent / 100 to a stat that starts at 1;
 * `percent` scales the stat's total by the summed percent; `basePercent` scales only its base and level gains.
 */
type Effect = { stat: string; kind: "add" | "factor" | "percent" | "basePercent" };

const add = (stat: string): Effect => ({ stat, kind: "add" });
const factor = (stat: string): Effect => ({ stat, kind: "factor" });
const percent = (stat: string): Effect => ({ stat, kind: "percent" });
const basePercent = (stat: string): Effect => ({ stat, kind: "basePercent" });

/** The hero stat each `MODIFIER_VALUE_*` changes, from item and level-up modifiers alike. Unlisted ones are left out. */
const MODIFIER_STATS: Readonly<Record<string, Effect>> = {
    MODIFIER_VALUE_COOLDOWN_REDUCTION_PERCENTAGE: add("ETechCooldown"),
    MODIFIER_VALUE_TECH_RANGE_PERCENT: factor("ETechRange"),
    MODIFIER_VALUE_TECH_RADIUS_PERCENT: factor("ETechRadius"),
    MODIFIER_VALUE_BONUS_ABILITY_DURATION_PERCENTAGE: factor("ETechDuration"),
    MODIFIER_VALUE_TECH_POWER: add("ETechPower"),
    MODIFIER_VALUE_TECH_POWER_PERCENT: percent("ETechPower"),
    MODIFIER_VALUE_WEAPON_DAMAGE_INCREASE: add("EBaseWeaponDamageIncrease"),
    MODIFIER_VALUE_MELEE_DAMAGE_INCREASE: add("EBaseMeleeDamageIncrease"),
    MODIFIER_VALUE_HEALTH_MAX: add("EMaxHealth"),
    MODIFIER_VALUE_BASE_HEALTH_PERCENT: basePercent("EMaxHealth"),
    MODIFIER_VALUE_HEALTH_MAX_PERCENT: percent("EMaxHealth"),
    MODIFIER_VALUE_FIRE_RATE: add("EFireRate"),
    MODIFIER_VALUE_MOVEMENT_SPEED_MAX: add("EMaxMoveSpeed"),
    MODIFIER_VALUE_STAMINA: add("EStamina"),
    MODIFIER_VALUE_STAMINA_REGEN_PER_SECOND_PERCENTAGE: add("EStaminaRegenPercent"),
    MODIFIER_VALUE_BULLET_AND_MELEE_RESIST_REDUCTION: add("EBulletArmorDamageReduction"),
    MODIFIER_VALUE_TECH_RESIST_REDUCTION: add("ETechArmorDamageReduction"),
    MODIFIER_VALUE_BONUS_ABILITY_CHARGES: add("EMaxChargesIncrease"),
    MODIFIER_VALUE_ITEM_COOLDOWN_REDUCTION_PERCENTAGE: add("EItemCooldown"),
    MODIFIER_VALUE_OUT_OF_COMBAT_HEALTH_REGEN: add("EOOCHealthRegen"),
    MODIFIER_VALUE_MELEE_RESIST_REDUCTION: add("EMeleeResist"),
    MODIFIER_VALUE_BASE_HEALTH_FROM_LEVEL: add("EMaxHealth"),
    MODIFIER_VALUE_BASE_BULLET_DAMAGE_FROM_LEVEL: add("EBulletDamage"),
    // By name only: no game file pairs these with a stat.
    MODIFIER_VALUE_BULLET_ARMOR_DAMAGE_RESIST: add("EBulletArmorDamageReduction"),
    MODIFIER_VALUE_TECH_RESIST: add("ETechArmorDamageReduction"),
    MODIFIER_VALUE_HEALTH_REGEN_PER_SECOND: add("EBaseHealthRegen"),
    MODIFIER_VALUE_COOLDOWN_BETWEEN_CHARGE_REDUCTION_PERCENTAGE: add("ETechCooldownBetweenChargeUses"),
    MODIFIER_VALUE_BULLET_LIFESTEAL: add("EBulletLifesteal"),
    MODIFIER_VALUE_TECH_LIFESTEAL: add("ETechLifesteal"),
    MODIFIER_VALUE_HEAL_AMP_CAST_PERCENT: add("EHealingOutput"),
    MODIFIER_VALUE_AMMO_CLIP_SIZE: add("EClipSize"),
    MODIFIER_VALUE_AMMO_CLIP_SIZE_PERCENT: add("EClipSizeIncrease"),
    MODIFIER_VALUE_BONUS_BULLET_SPEED_PERCENT: add("EBulletSpeedIncrease"),
    MODIFIER_VALUE_RELOAD_SPEED: add("EReloadSpeed"),
    MODIFIER_VALUE_BONUS_CRIT_DAMAGE_PERCENT: factor("ECritDamageBonusScale"),
    MODIFIER_VALUE_SPRINT_SPEED_BONUS: add("ESprintSpeed"),
    MODIFIER_VALUE_STATUS_RESISTANCE: add("EDebuffResist"),
    MODIFIER_VALUE_MELEE_RESIST: add("EMeleeResist"),
    MODIFIER_VALUE_BULLET_SHIELD_HEALTH: add("EBulletShieldHealth"),
    MODIFIER_VALUE_WEAPON_POWER: add("EWeaponPower"),
    // Heavy melee also gains per level, by a share no game file states, so only light melee is counted.
    MODIFIER_VALUE_BASE_MELEE_DAMAGE_FROM_LEVEL: add("ELightMeleeDamage"),
};

const INVESTMENT: Readonly<Record<ItemSlot, Effect>> = {
    weapon: add("EBaseWeaponDamageIncrease"),
    spirit: add("ETechPower"),
    // Whether the game scales item health too or only base health is unconfirmed.
    vitality: percent("EMaxHealth"),
};

class StatSheet {
    readonly stats: Record<string, number> = {};
    readonly #percents = new Map<string, number>();
    readonly #basePercents = new Map<string, number>();

    constructor(base: Readonly<Record<string, number>>) {
        Object.assign(this.stats, base);
    }

    apply({ stat, kind }: Effect, value: number): void {
        if (kind === "add") this.stats[stat] = (this.stats[stat] ?? 0) + value;
        else if (kind === "factor") this.stats[stat] = (this.stats[stat] ?? 1) + value / 100;
        else {
            const sums = kind === "percent" ? this.#percents : this.#basePercents;
            sums.set(stat, (sums.get(stat) ?? 0) + value);
        }
    }

    /** Applies the percent bonuses; `baseOf` is each stat before items. */
    finish(baseOf: Readonly<Record<string, number>>): HeroStats {
        for (const [stat, pct] of this.#basePercents) {
            this.stats[stat] = (this.stats[stat] ?? 0) + ((baseOf[stat] ?? 0) * pct) / 100;
        }
        for (const [stat, pct] of this.#percents) this.stats[stat] = (this.stats[stat] ?? 0) * (1 + pct / 100);
        return this.stats;
    }
}

/**
 * The hero at `level` owning `itemIds` (bought in order): base stats, level-up gains, the items' always-on stats and
 * slot investment, keyed by the game's stat enum. Conditional item bonuses are left out.
 */
export function heroStatsAt(
    hero: HeroStatsData,
    at: { level: number; itemIds: readonly number[] },
    catalog: StatCatalog,
): HeroStats {
    const levelsGained = Math.max(0, at.level - 1);
    const sheet = new StatSheet(hero.base);
    if (hero.bulletDamage !== null) sheet.stats.EBulletDamage = hero.bulletDamage;
    for (const [modifier, value] of Object.entries(hero.perLevel)) {
        const effect = MODIFIER_STATS[modifier];
        if (effect) sheet.apply(effect, value * levelsGained);
    }
    // Level gains alone are not a bullet damage.
    if (hero.bulletDamage === null) delete sheet.stats.EBulletDamage;
    sheet.stats.ELevelUpBoons = levelsGained;
    const beforeItems = { ...sheet.stats };

    for (const total of statsSoFar(at.itemIds, catalog.statsById, catalog.byId)) {
        const effect = MODIFIER_STATS[total.provides];
        if (effect) sheet.apply(effect, total.total);
    }
    const spend = slotSpend(at.itemIds, catalog.byId);
    for (const slot of Object.keys(INVESTMENT) as ItemSlot[]) {
        sheet.apply(INVESTMENT[slot], investmentBonus(hero.investment[slot], spend[slot]));
    }

    const stats = sheet.finish(beforeItems);
    if (stats.EBulletDamage !== undefined) {
        stats.EBulletDamage *= 1 + (stats.EBaseWeaponDamageIncrease ?? 0) / 100;
    }
    return stats;
}

type DetailRow = { stat: string; decimals: number };

/**
 * The ALT "See Details" rows per item slot, a group per icon, in the hero's `shop_stat_display` order. The game also
 * lists light and heavy melee for weapon items, but how much of the weapon bonus melee takes is in no game file, so
 * those rows are left out. Vitality and spirit rows are unmeasured.
 */
const DETAIL_ROWS: Readonly<Record<ItemSlot, readonly (readonly DetailRow[])[]>> = {
    weapon: [[{ stat: "EBulletDamage", decimals: 1 }]],
    vitality: [[{ stat: "EMaxHealth", decimals: 0 }]],
    spirit: [[{ stat: "ETechPower", decimals: 0 }]],
};

export interface ItemDetailsInput {
    hero: HeroStatsData;
    level: number;
    /** What the build owns before this item, in build order. */
    ownedIds: readonly number[];
    itemId: number;
    catalog: StatCatalog;
    label: (stat: string) => string;
    icon?: (stat: string) => string | null;
    /** The item's own condition text, which the game repeats under every row. */
    condition?: string | null;
    phases?: readonly PhaseStat[];
    /** Groups the host adds from the hero before and after, such as a spirit item's ability values. */
    extraGroups?: (before: HeroStats, after: HeroStats) => readonly StatGroup[];
}

/** The hero before and after buying the item at the same level; null for an item the catalog does not know. */
export function itemDetails(input: ItemDetailsInput): ItemDetails | null {
    const item = input.catalog.byId.get(input.itemId);
    if (!item) return null;
    const before = heroStatsAt(input.hero, { level: input.level, itemIds: input.ownedIds }, input.catalog);
    const after = heroStatsAt(
        input.hero,
        { level: input.level, itemIds: [...input.ownedIds, input.itemId] },
        input.catalog,
    );
    const groups: StatGroup[] = DETAIL_ROWS[item.slot].flatMap((rows) => {
        const changes: StatChange[] = rows.flatMap(({ stat, decimals }) => {
            const was = before[stat];
            const now = after[stat];
            if (was === undefined || now === undefined) return [];
            return [{ key: stat, label: input.label(stat), before: was, after: now, decimals, postfix: null }];
        });
        return changes.length === 0 ? [] : [{ icon: input.icon?.(rows[0]!.stat) ?? null, changes }];
    });
    return {
        groups: [...groups, ...(input.extraGroups?.(before, after) ?? [])],
        condition: input.condition ?? null,
        phases: input.phases ?? [],
    };
}
