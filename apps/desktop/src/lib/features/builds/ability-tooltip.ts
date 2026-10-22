import { abilityTooltipModel, type AbilityTooltipModel, type UpgradeState } from "@deadlock-plus/game-ui";
import type { HeroStats } from "@deadlock-plus/game-ui/hero";
import type { AbilityTooltip } from "@deadlock-plus/ipc-types/AbilityTooltip";
import { onGameArtChanged } from "$lib/features/gamedata/art-refresh";
import { loadAbilityTooltips } from "$lib/features/gamedata/vdata";
import { abilityTooltipsRevision, bumpAbilityTooltipsRevision } from "./ability-tooltip-revision.svelte";
import { TIER_COSTS, type OrderStep } from "./editor/ability-order";

export { abilityTooltipsRevision };

/** Same scale as the Builds item tooltips, so both read as one set. */
export const ABILITY_TOOLTIP_SCALE = 1;

/**
 * Each tier's card for an ability at `tier` (null while locked, 0 unlocked only): trained tiers are had, the
 * rest look as the game draws them with no ability points to spend.
 */
export function upgradeStates(tier: number | null): UpgradeState[] {
    return TIER_COSTS.map((_, i): UpgradeState => (tier !== null && i + 1 <= tier ? "has" : "cantAfford"));
}

/** The tier the build's step after `index` buys, when that step upgrades the same ability. */
export function recommendedAfter(steps: readonly OrderStep[], index: number): number | null {
    const current = steps[index];
    const next = steps[index + 1];
    if (!current || !next || next.abilityId !== current.abilityId || next.tier === 0) return null;
    return next.tier;
}

/** The hero the tooltip scales values by: its stats at the point shown, and its portrait for boon markers. */
export interface TooltipHero {
    stats?: HeroStats;
    icon?: string | null;
}

/** The game's tooltip for an ability at `tier`, as `upgradeStates` reads it. */
export function abilityTooltipAt(
    ability: AbilityTooltip,
    tier: number | null,
    recommendedTier: number | null = null,
    hero: TooltipHero = {},
): AbilityTooltipModel {
    return abilityTooltipModel({
        ability,
        upgrades: upgradeStates(tier),
        tierCosts: TIER_COSTS,
        recommendedTier,
        heroStats: hero.stats,
        heroIcon: hero.icon,
    });
}

const cache = new Map<string, Promise<ReadonlyMap<number, AbilityTooltip>>>();
let watching = false;

function read(locale: string): Promise<ReadonlyMap<number, AbilityTooltip>> {
    const reading = loadAbilityTooltips(locale).then((list) => {
        if (list.length === 0) cache.delete(locale);
        return new Map(list.map((a) => [a.abilityId, a]));
    });
    cache.set(locale, reading);
    return reading;
}

/**
 * Every hero ability's tooltip in `locale`, by ability id, read again after a game update. Empty while the game
 * cannot be read. Call it again when `abilityTooltipsRevision()` changes to pick up that update.
 */
export function heroAbilityTooltips(locale: string): Promise<ReadonlyMap<number, AbilityTooltip>> {
    if (!watching) {
        watching = true;
        onGameArtChanged(async () => {
            await Promise.all([...cache.keys()].map(read));
            bumpAbilityTooltipsRevision();
        });
    }
    return cache.get(locale) ?? read(locale);
}
