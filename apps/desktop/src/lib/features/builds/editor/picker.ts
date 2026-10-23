import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { ItemStat } from "@deadlock-plus/ipc-types/ItemStat";
import {
    searchItems,
    SHOP_SLOTS,
    SHOP_TIERS,
    type ItemMatcher,
    type ShopCatalog,
    type ShopItem,
    type ShopSlot,
    type ShopTier,
} from "../catalog";
import { statLabelMatchers } from "../stats";
import { occurrences } from "./document";

/** The price most items of a tier have; every tier is one price in the game, so this is that price. */
function tierPrice(catalog: ShopCatalog, tier: ShopTier): number | null {
    const counts = new Map<number, number>();
    for (const item of catalog.byId.values()) {
        if (item.tier === tier) counts.set(item.cost, (counts.get(item.cost) ?? 0) + 1);
    }
    let best: number | null = null;
    let most = 0;
    for (const [cost, count] of counts) {
        if (count > most) {
            best = cost;
            most = count;
        }
    }
    return best;
}

/** The game's shop columns, left to right. */
export const GRID_SLOTS: readonly ShopSlot[] = ["weapon", "spirit", "vitality"];

export interface GridCell {
    slot: ShopSlot;
    items: ShopItem[];
}

export interface GridRow {
    tier: ShopTier;
    price: number | null;
    cells: GridCell[];
}

/**
 * The shop the way the game lays it out: one row per tier, one cell per slot in `slots` order, holding the
 * items `keep` lets through in shop order. Tiers with nothing left are dropped.
 */
export function shopGrid(
    catalog: ShopCatalog,
    slots: readonly ShopSlot[],
    keep: (item: ShopItem) => boolean = () => true,
): GridRow[] {
    const shop = catalog.itemsBySlotTier();
    return SHOP_TIERS.flatMap((tier) => {
        const cells = slots.map((slot) => ({ slot, items: shop[slot][tier].filter(keep) }));
        return cells.some((c) => c.items.length > 0) ? [{ tier, price: tierPrice(catalog, tier), cells }] : [];
    });
}

/** Ids of the shop items `query` finds by name or stat; null for a blank query, which finds everything. */
export function searchHits(
    catalog: ShopCatalog,
    query: string,
    matchers: readonly ItemMatcher[] = statLabelMatchers(catalog.statsById),
): Set<number> | null {
    if (query.trim() === "") return null;
    const shop = catalog.itemsBySlotTier();
    const all = SHOP_SLOTS.flatMap((s) => SHOP_TIERS.flatMap((tier) => shop[s][tier]));
    return new Set(searchItems(all, query, matchers).map((i) => i.id));
}

/** The game's shop filter tabs and the `EShopFilter` toggles under each, from `citadel_ui_shop_filters`. */
export const FILTER_CATEGORIES = {
    physical: [
        "EShopFilterWeaponDamage",
        "EShopFilterWeaponAmmo",
        "EShopFilterWeaponFireRate",
        "EShopFilterWeaponBulletVelocity",
        "EShopFilterWeaponRange",
        "EShopFilterMelee",
        "EShopFilterPhysicalAdditionalDamage",
    ],
    spirit: [
        "EShopFilterSpiritDamage",
        "EShopFilterSpiritCooldownAndCharges",
        "EShopFilterSpiritDuration",
        "EShopFilterSpiritRange",
        "EShopFilterSpiritAdditionalDamage",
        "EShopFilterSpiritAdditionalDamagePct",
    ],
    defense: [
        "EShopFilterHP",
        "EShopFilterRegen",
        "EShopFilterOutOfCombatRegen",
        "EShopFilterBarrier",
        "EShopFilterHealing",
        "EShopFilterLifesteal",
        "EShopFilterPhysicalResist",
        "EShopFilterSpiritResist",
        "EShopFilterMeleeResist",
        "EShopFilterDebuffResist",
        "EShopFilterSlowResist",
        "EShopFilterAntiCC",
        "EShopFilterInvulnerability",
    ],
    mobility: [
        "EShopFilterMoveSpeed",
        "EShopFilterSprint",
        "EShopFilterStamina",
        "EShopFilterJumpAndDash",
        "EShopFilterTeleport",
        "EShopFilterStealth",
    ],
    disruption: [
        "EShopFilterAntiHeal",
        "EShopFilterBulletVuln",
        "EShopFilterSpiritVuln",
        "EShopFilterBulletDamageReduction",
        "EShopFilterFireRateReduction",
        "EShopFilterSpiritDamageReduction",
        "EShopFilterMobilityReduction",
        "EShopFilterStatus_Stun",
        "EShopFilterStatus_Disarm",
        "EShopFilterStatus_Silence",
        "EShopFilterStatus_Curse",
        "EShopFilterStatus_Immobilize",
    ],
    misc: ["EShopFilterActive", "EShopFilterImbue"],
} as const satisfies Record<string, readonly string[]>;

export type FilterCategory = keyof typeof FILTER_CATEGORIES;

const CATEGORY_OF = new Map<string, FilterCategory>(
    (Object.entries(FILTER_CATEGORIES) as [FilterCategory, readonly string[]][]).flatMap(([category, filters]) =>
        filters.map((f) => [f, category] as const),
    ),
);

/**
 * The `EShopFilter` tags of an item. Active and Imbue come from the item itself; the game computes the rest
 * in code from what the item provides, so they only come in through `extra`. The item's vdata then adds
 * `shopFilters` and takes `disabledShopFilters` off the lot.
 */
export function itemFilters(item: ShopItem, extra: readonly string[] = []): string[] {
    const out = new Set<string>();
    if (item.active) out.add("EShopFilterActive");
    if (item.imbue) out.add("EShopFilterImbue");
    for (const f of extra) out.add(f);
    for (const f of item.shopFilters ?? []) out.add(f);
    for (const f of item.disabledShopFilters ?? []) out.delete(f);
    return [...out];
}

const both = (...filters: string[]) => [filters, filters] as const;
const up = (...filters: string[]) => [filters, []] as const;

/**
 * Deadlock+'s own `m_eProvidedPropertyType` to `EShopFilter` table: the game derives its tags in code that
 * ships in no data file, so this is a reading of the property names, checked against build 6805's items.
 * `[for a bonus, for a penalty]`: a negative value is either a debuff the item puts on enemies (healing,
 * damage, spirit power) or a cost to its owner, which tags nothing. Reductions tag the same either way.
 */
export const PROVIDES_FILTERS: Readonly<Record<string, readonly [readonly string[], readonly string[]]>> = {
    MODIFIER_VALUE_WEAPON_DAMAGE_INCREASE: up("EShopFilterWeaponDamage"),
    MODIFIER_VALUE_CLOSE_RANGE_WEAPON_DAMAGE_INCREASE: up("EShopFilterWeaponDamage"),
    MODIFIER_VALUE_LONG_RANGE_BULLET_DAMAGE_INCREASE: up("EShopFilterWeaponDamage"),
    MODIFIER_VALUE_WEAPON_DAMAGE_TO_NPC_INCREASE: up("EShopFilterWeaponDamage"),
    MODIFIER_VALUE_ALL_DAMAGE_MULTIPLIER: [
        ["EShopFilterWeaponDamage", "EShopFilterSpiritDamage"],
        ["EShopFilterBulletDamageReduction", "EShopFilterSpiritDamageReduction"],
    ],
    MODIFIER_VALUE_AMMO_CLIP_SIZE: up("EShopFilterWeaponAmmo"),
    MODIFIER_VALUE_AMMO_CLIP_SIZE_PERCENT: up("EShopFilterWeaponAmmo"),
    // A reload multiplier below zero is a faster reload.
    MODIFIER_VALUE_RELOAD_SPEED: both("EShopFilterWeaponAmmo"),
    MODIFIER_VALUE_FIRE_RATE: up("EShopFilterWeaponFireRate"),
    MODIFIER_VALUE_BONUS_BULLET_SPEED_PERCENT: up("EShopFilterWeaponBulletVelocity"),
    MODIFIER_VALUE_BONUS_ATTACK_RANGE_PERCENT: up("EShopFilterWeaponRange"),
    MODIFIER_VALUE_MELEE_DAMAGE_INCREASE: up("EShopFilterMelee"),
    MODIFIER_VALUE_MELEE_TRAVEL_DISTANCE_PERCENTAGE: up("EShopFilterMelee"),
    MODIFIER_VALUE_PARRY_COOLDOWN_REDUCTION_FIXED: up("EShopFilterMelee"),

    MODIFIER_VALUE_TECH_POWER: [["EShopFilterSpiritDamage"], ["EShopFilterSpiritDamageReduction"]],
    MODIFIER_VALUE_TECH_POWER_PERCENT: up("EShopFilterSpiritDamage"),
    MODIFIER_VALUE_TECH_DAMAGE_MULTIPLIER: [["EShopFilterSpiritDamage"], ["EShopFilterSpiritDamageReduction"]],
    MODIFIER_VALUE_COOLDOWN_REDUCTION_PERCENTAGE: up("EShopFilterSpiritCooldownAndCharges"),
    MODIFIER_VALUE_ULTIMATE_COOLDOWN_REDUCTION_PERCENTAGE: up("EShopFilterSpiritCooldownAndCharges"),
    MODIFIER_VALUE_ITEM_COOLDOWN_REDUCTION_PERCENTAGE: up("EShopFilterSpiritCooldownAndCharges"),
    MODIFIER_VALUE_COOLDOWN_BETWEEN_CHARGE_REDUCTION_PERCENTAGE: up("EShopFilterSpiritCooldownAndCharges"),
    MODIFIER_VALUE_BONUS_ABILITY_CHARGES: up("EShopFilterSpiritCooldownAndCharges"),
    MODIFIER_VALUE_ENABLE_CHARGES: up("EShopFilterSpiritCooldownAndCharges"),
    MODIFIER_VALUE_BONUS_ABILITY_DURATION_PERCENTAGE: up("EShopFilterSpiritDuration"),
    MODIFIER_VALUE_TECH_RANGE_PERCENT: up("EShopFilterSpiritRange"),
    MODIFIER_VALUE_TECH_RADIUS_PERCENT: up("EShopFilterSpiritRange"),

    MODIFIER_VALUE_HEALTH_MAX: up("EShopFilterHP"),
    MODIFIER_VALUE_HEALTH_MAX_PERCENT: up("EShopFilterHP"),
    MODIFIER_VALUE_BASE_HEALTH_PERCENT: up("EShopFilterHP"),
    MODIFIER_VALUE_HEALTH_REGEN_PER_SECOND: up("EShopFilterRegen"),
    MODIFIER_VALUE_OUT_OF_COMBAT_HEALTH_REGEN: up("EShopFilterOutOfCombatRegen"),
    MODIFIER_VALUE_BARRIER_HEALTH: up("EShopFilterBarrier"),
    MODIFIER_VALUE_HEAL_AMP_REGEN_PERCENT: [["EShopFilterHealing"], ["EShopFilterAntiHeal"]],
    MODIFIER_VALUE_HEAL_AMP_RECEIVE_PERCENT: [["EShopFilterHealing"], ["EShopFilterAntiHeal"]],
    MODIFIER_VALUE_HEAL_AMP_CAST_PERCENT: up("EShopFilterHealing"),
    MODIFIER_VALUE_BULLET_LIFESTEAL: up("EShopFilterLifesteal"),
    MODIFIER_VALUE_TECH_LIFESTEAL: up("EShopFilterLifesteal"),
    MODIFIER_VALUE_TECH_DAMAGE_TAKEN_HEALS_ATTACKER: up("EShopFilterLifesteal"),
    MODIFIER_VALUE_BULLET_ARMOR_DAMAGE_RESIST: up("EShopFilterPhysicalResist"),
    MODIFIER_VALUE_BULLET_RESIST_NON_HERO: up("EShopFilterPhysicalResist"),
    MODIFIER_VALUE_TECH_RESIST: up("EShopFilterSpiritResist"),
    MODIFIER_VALUE_MELEE_RESIST: up("EShopFilterMeleeResist"),
    MODIFIER_VALUE_STATUS_RESISTANCE: up("EShopFilterDebuffResist"),
    MODIFIER_VALUE_MOVEMENT_SLOW_RESISTANCE: up("EShopFilterSlowResist"),

    MODIFIER_VALUE_MOVEMENT_SPEED_MAX: up("EShopFilterMoveSpeed"),
    MODIFIER_VALUE_MOVEMENT_SPEED_WHILE_SHOOTING_PENALTY_REDUCTION_PERCENT: up("EShopFilterMoveSpeed"),
    MODIFIER_VALUE_MOVEMENT_SPEED_WHILE_ZOOMED_PENALTY_REDUCTION_PERCENT: up("EShopFilterMoveSpeed"),
    MODIFIER_VALUE_SPRINT_SPEED_BONUS: up("EShopFilterSprint"),
    MODIFIER_VALUE_STAMINA: up("EShopFilterStamina"),
    MODIFIER_VALUE_STAMINA_REGEN_PER_SECOND_PERCENTAGE: up("EShopFilterStamina"),
    MODIFIER_VALUE_AIR_CONTROL_PERCENT: up("EShopFilterJumpAndDash"),
    MODIFIER_VALUE_AIR_CONTROL_ACCEL_PERCENT: up("EShopFilterJumpAndDash"),
    MODIFIER_VALUE_AIR_MOVE_DISTANCE_INCREASE_PERCENT: up("EShopFilterJumpAndDash"),
    MODIFIER_VALUE_MOVEMENT_SLIDE_DISTANCE_SCALE: up("EShopFilterJumpAndDash"),
    MODIFIER_VALUE_MOVEMENT_SLIDE_TURN_SCALE: up("EShopFilterJumpAndDash"),

    MODIFIER_VALUE_BULLET_AND_MELEE_RESIST_REDUCTION: both("EShopFilterBulletVuln"),
    MODIFIER_VALUE_TECH_RESIST_REDUCTION: both("EShopFilterSpiritVuln"),
    MODIFIER_VALUE_FIRE_RATE_SLOW: both("EShopFilterFireRateReduction"),
    MODIFIER_VALUE_MOVEMENT_SPEED_SLOW_PERCENT: both("EShopFilterMobilityReduction"),
    MODIFIER_VALUE_MOVEMENT_GROUND_DASH_REDUCTION_PERCENT: both("EShopFilterMobilityReduction"),
};

/** The `EShopFilter` tags `stats` earn through `PROVIDES_FILTERS`, each once. */
export function providedFilters(stats: readonly ItemStat[]): string[] {
    const out = new Set<string>();
    for (const stat of stats) {
        const rule = stat.provides === null ? undefined : PROVIDES_FILTERS[stat.provides];
        if (rule === undefined || stat.value === 0) continue;
        for (const f of rule[stat.value > 0 ? 0 : 1]) out.add(f);
    }
    return [...out];
}

/** True when nothing is picked or any of `filters` sits under a picked category. */
export function inCategories(filters: readonly string[], picked: ReadonlySet<FilterCategory>): boolean {
    if (picked.size === 0) return true;
    return filters.some((f) => {
        const category = CATEGORY_OF.get(f);
        return category !== undefined && picked.has(category);
    });
}

/** The categories at least one of `tagged` falls under, in the game's tab order. */
export function taggedCategories(tagged: Iterable<readonly string[]>): FilterCategory[] {
    const found = new Set<FilterCategory>();
    for (const filters of tagged) {
        for (const f of filters) {
            const category = CATEGORY_OF.get(f);
            if (category) found.add(category);
        }
    }
    return (Object.keys(FILTER_CATEGORIES) as FilterCategory[]).filter((c) => found.has(c));
}

export function inBuildCounts(build: BuildView): Map<number, number> {
    return occurrences(build);
}

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export type ArrowKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

/**
 * The card an arrow key moves to from `rects[from]`. Left and right step in reading order; up and down
 * go to the closest card on the nearest wrapped line above or below. Stays put at an edge.
 */
export function nearestCard(rects: readonly Rect[], from: number, key: ArrowKey): number {
    if (key === "ArrowLeft") return Math.max(0, from - 1);
    if (key === "ArrowRight") return Math.min(rects.length - 1, from + 1);
    const current = rects[from];
    if (current === undefined) return from;
    const half = current.height / 2;
    const down = key === "ArrowDown";
    const beyond = rects
        .map((rect, index) => ({ rect, index }))
        .filter(({ rect }) => (down ? rect.y >= current.y + half : rect.y <= current.y - half));
    if (beyond.length === 0) return from;
    const lineY = down ? Math.min(...beyond.map((c) => c.rect.y)) : Math.max(...beyond.map((c) => c.rect.y));
    const centre = (r: Rect) => r.x + r.width / 2;
    let best = beyond[0]!;
    let bestDistance = Infinity;
    for (const candidate of beyond) {
        if (Math.abs(candidate.rect.y - lineY) >= half) continue;
        const distance = Math.abs(centre(candidate.rect) - centre(current));
        if (distance < bestDistance) {
            best = candidate;
            bestDistance = distance;
        }
    }
    return best.index;
}
