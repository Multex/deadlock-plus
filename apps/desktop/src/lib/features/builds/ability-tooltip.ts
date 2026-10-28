import {
    abilityTooltipModel,
    shownDecimals,
    type AbilityTooltipModel,
    type UpgradeState,
} from "@deadlock-plus/game-ui";
import type { HeroStats, StatChange } from "@deadlock-plus/game-ui/hero";
import type { ValueText } from "@deadlock-plus/game-ui/item-tooltip/model";
import type { AbilityProperty } from "@deadlock-plus/ipc-types/AbilityProperty";
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

type ShownValue = { label: string; value: ValueText; scaled: boolean; stat: string | null };

/** Every value the tooltip shows, by property, as the game prints it. */
function shownValues(model: AbilityTooltipModel): Map<string, ShownValue> {
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
        if (out.has(view.key)) continue;
        out.set(view.key, {
            label: view.label,
            value: view.value,
            scaled: view.scaled,
            stat: view.scaling?.stat ?? null,
        });
    }
    return out;
}

/** The properties cooldown reduction shrinks, the ability's cooldowns last as the game lists them. */
function cooldownScaled(ability: AbilityTooltip): AbilityProperty[] {
    const cooldowns = [ability.chargeCooldown, ability.cooldown].filter((p) => p !== null);
    const all = [
        ...ability.header,
        ...[ability.charges, ...cooldowns].filter((p) => p !== null),
        ...ability.sections.flatMap((s) => [...s.groups.flatMap((g) => g.cells), ...s.properties]),
    ].filter((p) => p.scale?.stat === COOLDOWN_STAT);
    return [...all.filter((p) => !cooldowns.includes(p)), ...all.filter((p) => cooldowns.includes(p))];
}

const SPIRIT_STAT = "ETechPower";
const COOLDOWN_STAT = "ETechCooldown";

/**
 * The values of an ability at `tier` that change between the hero `before` and `after`: the ones that grow with
 * spirit power, then the ones cooldown reduction shrinks with the cooldown last. A value is listed whenever its stat
 * changes, even when the shown number does not move, as the game does.
 */
export function abilityChanges(
    ability: AbilityTooltip,
    tier: number | null,
    before: HeroStats,
    after: HeroStats,
): StatChange[] {
    const key = (property: string) => `ability:${ability.abilityId}:${property}`;
    const out: StatChange[] = [];
    if ((before[SPIRIT_STAT] ?? 0) !== (after[SPIRIT_STAT] ?? 0)) {
        const was = shownValues(abilityTooltipAt(ability, tier, null, { stats: before }));
        const now = shownValues(abilityTooltipAt(ability, tier, null, { stats: after }));
        for (const [property, { label, value, scaled, stat }] of now) {
            const old = was.get(property)?.value;
            if (!old || !scaled || stat !== SPIRIT_STAT) continue;
            out.push({
                key: key(property),
                label,
                before: Number(old.number),
                after: Number(value.number),
                // Already rounded to the property's own decimals; the game never shows more than one.
                decimals: 1,
                postfix: value.postfix || null,
            });
        }
    }
    if ((before[COOLDOWN_STAT] ?? 0) !== (after[COOLDOWN_STAT] ?? 0)) {
        const was = shownValues(abilityTooltipAt(ability, tier, null, { stats: before }));
        const now = shownValues(abilityTooltipAt(ability, tier, null, { stats: after }));
        for (const property of cooldownScaled(ability)) {
            const old = was.get(property.key)?.value;
            const shown = now.get(property.key);
            if (!old || !shown || shown.value.number === "") continue;
            out.push({
                key: key(property.key),
                label: shown.label,
                before: Number(old.number),
                after: Number(shown.value.number),
                decimals: shownDecimals(property.cssClass),
                postfix: shown.value.postfix || null,
            });
        }
    }
    return out;
}

const cache = new Map<string, Promise<ReadonlyMap<number, AbilityTooltip>>>();
let watching = false;

const isTooltip = (row: unknown): row is AbilityTooltip =>
    typeof row === "object" && row !== null && Number.isFinite((row as { abilityId?: unknown }).abilityId);

function read(locale: string): Promise<ReadonlyMap<number, AbilityTooltip>> {
    const reading = loadAbilityTooltips(locale)
        .then((list: unknown) => (Array.isArray(list) ? list.filter(isTooltip) : []))
        .catch((): AbilityTooltip[] => [])
        .then((list) => {
            if (list.length === 0 && cache.get(locale) === reading) cache.delete(locale);
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
