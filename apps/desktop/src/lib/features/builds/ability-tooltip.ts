import { abilityTooltipModel, type AbilityTooltipModel, type UpgradeState } from "@deadlock-plus/game-ui";
import type { AbilityTooltip } from "@deadlock-plus/ipc-types/AbilityTooltip";
import { loadAbilityTooltips } from "$lib/features/gamedata/vdata";
import { TIER_COSTS, type OrderStep } from "./editor/ability-order";

/**
 * The game draws the tooltip 560 Panorama px wide; full size would cover most of the ability bar, so the
 * Builds pages show it smaller.
 */
export const ABILITY_TOOLTIP_SCALE = 0.7;

/**
 * Each tier's card for an ability at `tier` (null while locked, 0 unlocked only): trained tiers are had and
 * the tier after them is on offer. A build buys its points as it levels, so the next tier never shows as
 * unaffordable.
 */
export function upgradeStates(tier: number | null): UpgradeState[] {
    return TIER_COSTS.map((_, i): UpgradeState => {
        if (tier === null) return "notTrained";
        if (i + 1 <= tier) return "has";
        return i === tier ? "available" : "notTrained";
    });
}

/** The tier the build's step after `index` buys, when that step upgrades the same ability. */
export function recommendedAfter(steps: readonly OrderStep[], index: number): number | null {
    const current = steps[index];
    const next = steps[index + 1];
    if (!current || !next || next.abilityId !== current.abilityId || next.tier === 0) return null;
    return next.tier;
}

/** The game's tooltip for an ability at `tier`, as `upgradeStates` reads it. */
export function abilityTooltipAt(
    ability: AbilityTooltip,
    tier: number | null,
    recommendedTier: number | null = null,
): AbilityTooltipModel {
    return abilityTooltipModel({ ability, upgrades: upgradeStates(tier), recommendedTier });
}

const cache = new Map<string, Promise<ReadonlyMap<number, AbilityTooltip>>>();

/** Every hero ability's tooltip in `locale`, by ability id. Empty while the game cannot be read. */
export function heroAbilityTooltips(locale: string): Promise<ReadonlyMap<number, AbilityTooltip>> {
    const cached = cache.get(locale);
    if (cached) return cached;
    const read = loadAbilityTooltips(locale).then((list) => {
        if (list.length === 0) cache.delete(locale);
        return new Map(list.map((a) => [a.abilityId, a]));
    });
    cache.set(locale, read);
    return read;
}
