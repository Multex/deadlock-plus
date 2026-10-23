import type { HeroStats, ItemDetails, PhaseStat, StatChange, StatGroup } from "@deadlock-plus/game-ui/hero";
import type { ItemSlot } from "@deadlock-plus/game-ui/item";
import type { HeroStatsData } from "@deadlock-plus/ipc-types/HeroStatsData";
import type { InvestmentTier } from "@deadlock-plus/ipc-types/InvestmentTier";
import { chainCost, type ShopItem } from "./catalog";
import { itemsStillOwned, type StatsById } from "./stats";

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
 * `percent` scales the stat's total by the summed percent; `basePercent` scales only its base and level gains;
 * `stack` combines percents multiplicatively, each one taking its share of what the others leave.
 */
type Effect = { stat: string; kind: "add" | "factor" | "percent" | "basePercent" | "stack" };

const add = (stat: string): Effect => ({ stat, kind: "add" });
const factor = (stat: string): Effect => ({ stat, kind: "factor" });
const percent = (stat: string): Effect => ({ stat, kind: "percent" });
const basePercent = (stat: string): Effect => ({ stat, kind: "basePercent" });
const stack = (stat: string): Effect => ({ stat, kind: "stack" });

/** The hero stat each `MODIFIER_VALUE_*` changes, from item and level-up modifiers alike. Unlisted ones are left out. */
const MODIFIER_STATS: Readonly<Record<string, Effect>> = {
    // Enchanter's Emblem's +5% at 40% takes a 20s cooldown to 11.4s and a 120 cost to 68, not to 11 and 66.
    MODIFIER_VALUE_COOLDOWN_REDUCTION_PERCENTAGE: stack("ETechCooldown"),
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
    // Spirit resist 55% and 18% make 63% in game; bullet resist is assumed to stack the same way.
    MODIFIER_VALUE_BULLET_ARMOR_DAMAGE_RESIST: stack("EBulletArmorDamageReduction"),
    MODIFIER_VALUE_TECH_RESIST: stack("ETechArmorDamageReduction"),
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
        else if (kind === "stack") this.stats[stat] = 100 - (100 - (this.stats[stat] ?? 0)) * (1 - value / 100);
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
 * slot investment, keyed by the game's stat enum. Conditional item bonuses are left out. `imbued` names the owned
 * items imbued on the one ability being valued, whose imbue-only stats then count too.
 */
export function heroStatsAt(
    hero: HeroStatsData,
    at: { level: number; itemIds: readonly number[]; imbued?: ReadonlySet<number> },
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

    // One stat at a time: stacking percents cannot be summed first.
    for (const id of itemsStillOwned(catalog.byId, at.itemIds)) {
        const imbued = at.imbued?.has(id) === true;
        for (const { flat, onlyIfImbued, provides, value } of catalog.statsById.get(id) ?? []) {
            const counts = flat || (imbued && onlyIfImbued === true);
            const effect = counts && provides !== null ? MODIFIER_STATS[provides] : undefined;
            if (effect) sheet.apply(effect, value);
        }
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

type StatRow = { stat: string; decimals: number; postfix: string | null };

/**
 * The hero stats the ALT panel lists under their own icons, after the ability and owned item groups. Enchanter's
 * Emblem shows Spirit Resist 55 -> 63%; Headshot Booster's +30 health shows no Max Health and Emblem's +15 spirit no
 * Spirit Power, so neither is listed.
 */
const STAT_ROWS: readonly StatRow[] = [{ stat: "ETechArmorDamageReduction", decimals: 0, postfix: "%" }];

export type GroupsOf = (before: HeroStats, after: HeroStats) => readonly StatGroup[];

/** The hero as one ability sees it before and after the purchase, and whether an owned item is imbued on it after. */
export interface AbilityHero {
    before: HeroStats;
    after: HeroStats;
    imbued: boolean;
}

export type AbilityGroupsOf = (heroFor: (abilityId: number) => AbilityHero) => readonly StatGroup[];

export interface ItemDetailsInput {
    hero: HeroStatsData;
    level: number;
    /** What the build owns before this item, in build order. */
    ownedIds: readonly number[];
    itemId: number;
    catalog: StatCatalog;
    label: (stat: string) => string;
    /** A stat row's icon. */
    icon?: (stat: string) => string | null;
    /** The hero's weapon ability image, which the game draws beside bullet damage. */
    weaponIcon?: string | null;
    /**
     * Each owned imbue item's target ability, by item id. The item being bought is imbued on nothing yet: the game
     * shows Compress Cooldown no ALT panel.
     */
    imbues?: ReadonlyMap<number, number>;
    /** The hero's other ability groups, in slot order. */
    abilityGroups?: AbilityGroupsOf;
    /** A group per owned item whose values the item changes. */
    itemGroups?: GroupsOf;
    /** The item's own condition text, which the game repeats under every row. */
    condition?: string | null;
    phases?: readonly PhaseStat[];
}

/**
 * A row for a value that changes at all: the game keeps one whose rounded values match (Bleed 3.6 -> 3.6%).
 * `missing` stands in for a stat the hero lacks, such as a resist it has none of.
 */
function statChange(
    stat: string,
    before: HeroStats,
    after: HeroStats,
    row: Omit<StatChange, "key" | "before" | "after">,
    missing?: number,
) {
    const was = before[stat] ?? missing;
    const now = after[stat] ?? missing;
    if (was === undefined || now === undefined || was === now) return null;
    return { key: stat, before: was, after: now, ...row };
}

/**
 * The ALT "Modifies" column: the hero before and after buying the item at the same level, as the game groups it.
 * The weapon ability (bullet damage) comes first, as the hero's bound abilities list it before the signature ones;
 * light and heavy melee are left out, since how much of the weapon bonus melee takes is in no game file. Null for an
 * item the catalog does not know.
 */
export function itemDetails(input: ItemDetailsInput): ItemDetails | null {
    if (!input.catalog.byId.has(input.itemId)) return null;
    const { hero, level, catalog } = input;
    const boughtIds = [...input.ownedIds, input.itemId];
    const before = heroStatsAt(hero, { level, itemIds: input.ownedIds }, catalog);
    const after = heroStatsAt(hero, { level, itemIds: boughtIds }, catalog);
    const stillOwned = new Set(itemsStillOwned(catalog.byId, boughtIds));
    // A purchase that uses the imbued item up as a component ends the imbue: Superior Cooldown takes Compress
    // Cooldown's 18% off Grasping Hands (28 -> 27s) and the game draws the group without its imbued background.
    const heroFor = (abilityId: number): AbilityHero => {
        const imbued = new Set(
            [...(input.imbues ?? [])].filter(([, target]) => target === abilityId).map(([id]) => id),
        );
        if (imbued.size === 0) return { before, after, imbued: false };
        return {
            before: heroStatsAt(hero, { level, itemIds: input.ownedIds, imbued }, catalog),
            after: heroStatsAt(hero, { level, itemIds: boughtIds, imbued }, catalog),
            imbued: [...imbued].some((id) => stillOwned.has(id)),
        };
    };
    const bullet = statChange("EBulletDamage", before, after, {
        label: input.label("EBulletDamage"),
        decimals: 1,
        postfix: null,
    });
    const weapon: StatGroup[] = bullet ? [{ kind: "ability", icon: input.weaponIcon ?? null, changes: [bullet] }] : [];
    const stats = STAT_ROWS.flatMap(({ stat, decimals, postfix }): StatGroup[] => {
        const change = statChange(stat, before, after, { label: input.label(stat), decimals, postfix }, 0);
        return change ? [{ kind: "stat", icon: input.icon?.(stat) ?? null, changes: [change] }] : [];
    });
    return {
        groups: [
            ...weapon,
            ...(input.abilityGroups?.(heroFor) ?? []),
            ...(input.itemGroups?.(before, after) ?? []),
            ...stats,
        ],
        condition: input.condition ?? null,
        phases: input.phases ?? [],
    };
}
