import { abilityTooltipModel, type AbilityTooltipModel, type UpgradeState } from "@deadlock-plus/game-ui";
import type { HeroStats, StatChange } from "@deadlock-plus/game-ui/hero";
import type { ValueText } from "@deadlock-plus/game-ui/item-tooltip/model";
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

type ShownValue = { label: string; value: ValueText };

/** Every value the tooltip scales by spirit power, by property, as the game prints it. */
function spiritValues(model: AbilityTooltipModel): Map<string, ShownValue> {
    const views = [
        ...model.chips,
        ...[model.charges, model.chargeCooldown, model.cooldown].filter((c) => c !== null),
        ...model.sections.flatMap((s) => [
            ...s.groups.flatMap((g) => g.cells.flatMap((c) => (c.kind === "value" ? [c] : []))),
            ...s.rows,
        ]),
    ];
    const out = new Map<string, ShownValue>();
    for (const view of views) {
        if (view.scaled && view.scaling?.stat === "ETechPower" && !out.has(view.key)) out.set(view.key, view);
    }
    return out;
}

/**
 * The values of an ability at `tier` that grow with spirit power and read differently for the hero `after` than
 * `before`, rounded as the game's ability tooltip prints them.
 */
export function spiritChanges(
    ability: AbilityTooltip,
    tier: number | null,
    before: HeroStats,
    after: HeroStats,
): StatChange[] {
    const was = spiritValues(abilityTooltipAt(ability, tier, null, { stats: before }));
    const now = spiritValues(abilityTooltipAt(ability, tier, null, { stats: after }));
    return [...now].flatMap(([key, { label, value }]): StatChange[] => {
        const old = was.get(key)?.value;
        if (!old || old.number === value.number) return [];
        return [
            {
                key: `ability:${ability.abilityId}:${key}`,
                label,
                before: Number(old.number),
                after: Number(value.number),
                // Already rounded to the property's own decimals; the game never shows more than one.
                decimals: 1,
                postfix: value.postfix || null,
            },
        ];
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
