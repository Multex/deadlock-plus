import type { AbilityProperty } from "@deadlock-plus/ipc-types/AbilityProperty";
import type { AbilitySection } from "@deadlock-plus/ipc-types/AbilitySection";
import type { AbilityTooltip } from "@deadlock-plus/ipc-types/AbilityTooltip";
import type { AbilityUpgrade } from "@deadlock-plus/ipc-types/AbilityUpgrade";
import type { TooltipProperty } from "@deadlock-plus/ipc-types/TooltipProperty";
import type { ScalingArrow, ScalingMarker, UiText, ValueText } from "../item-tooltip/model";
import { parseMarkup, type MarkupNode } from "../markup/markup";
import { FACTOR_DECIMALS, formatShownNumber, roundHalfEven, shownDecimals } from "../number";

/**
 * A tier's upgrade card state, as the game's classes name them: `has` (`hasUpgrade`, trained), `available`
 * (`UpgradeAvailable`), `cantAfford` (`cantAffordUpgrade`), `notTrained` (`abilityNotTrained`).
 */
export type UpgradeState = "has" | "available" | "cantAfford" | "notTrained";

export type AbilityTooltipInput = {
    ability: AbilityTooltip;
    /** Each tier's state, tier 1 first; a missing tier is `notTrained`. Trained tiers add their bonuses and sections. */
    upgrades?: readonly UpgradeState[];
    /** Ability points each tier costs, tier 1 first. The game files do not carry them. */
    tierCosts: readonly number[];
    /** The tier a build suggests next; its card shows "Recommended" until it is trained. */
    recommendedTier?: number | null;
    /** The hero's current stats keyed by the game's stat enum (`ETechPower`), for values with a scaling factor. */
    heroStats?: Partial<Record<string, number>>;
    /** The hero's portrait, drawn on boon-scaled markers. */
    heroIcon?: string | null;
    /** The imbue item imbued on this ability. */
    imbuedBy?: { name: string; icon?: string | null } | null;
};

/** The promoted cell look a scaling stat picks: `HasScalingStat`, `ScalingStat_EWeaponPower`, `..._ELevelUpBoons`. */
export type ScalingStyle = "spirit" | "weapon" | "boon";

export type ChipView = {
    key: string;
    /** The property icon class, a `GameArt.propertyIcons` key. */
    icon: string | null;
    value: ValueText;
    label: string;
    scaling: ScalingMarker | null;
    /** Only the chips under the name take the scaling look; the right column keeps its plain backer. */
    style: ScalingStyle | null;
    scaled: boolean;
};

export type PromotedCellView = {
    kind: "value";
    key: string;
    icon: string | null;
    value: ValueText;
    label: string;
    scaling: ScalingMarker | null;
    style: ScalingStyle | null;
    /** The value includes the hero's stat. */
    scaled: boolean;
};

export type StatusCellView = {
    kind: "status";
    key: string;
    /** The status key (`StatusEffectStun`), a `GameArt.propertyIcons` key. */
    icon: string;
    label: string;
    /** Null when the game shows "Status Effect" under the label instead of a number. */
    value: ValueText | null;
};

export type CellGroupView = { title: string | null; cells: (PromotedCellView | StatusCellView)[] };

export type BasicRowView = {
    key: string;
    value: ValueText;
    label: string;
    scaling: ScalingMarker | null;
    scaled: boolean;
};

export type ImbuedView = { name: string; icon: string | null; text: UiText };

export type AbilitySectionView = {
    description: MarkupNode[];
    imbued: ImbuedView | null;
    groups: CellGroupView[];
    rows: BasicRowView[];
};

export type UpgradeBonusView = { key: string; amount: string; label: string };

export type UpgradeCardView = {
    tier: number;
    /** Ability points. */
    cost: string;
    state: UpgradeState;
    recommended: boolean;
    /** Shown when the tier has no description of its own. */
    bonuses: UpgradeBonusView[];
    description: MarkupNode[] | null;
};

export type AbilityTooltipModel = {
    name: string;
    /** Under the name: channel time, cast range, radius, duration, then extras. */
    chips: ChipView[];
    charges: ChipView | null;
    chargeCooldown: ChipView | null;
    cooldown: ChipView | null;
    sections: AbilitySectionView[];
    upgrades: UpgradeCardView[];
    text: { statusEffect: UiText; recommended: UiText };
};

const NS = "game_ui.ability_tooltip";

function uiText(
    key: string,
    params: Record<string, string | number>,
    token: string,
    gameParams: Record<string, string | number> = params,
): UiText {
    return { key: `${NS}.${key}`, params, game: { token, params: gameParams } };
}

const SCALING_ARROWS: Partial<Record<string, ScalingArrow>> = {
    ETechPower: "spirit",
    EWeaponPower: "courage",
    EBaseWeaponDamage: "courage",
    EBaseWeaponDamageIncrease: "courage",
    EArmorPower: "fortitude",
    ELevelUpBoons: "boon",
    ELightMeleeDamage: "melee",
    EHeavyMeleeDamage: "melee",
};

// `#PromotedPropertiesContainer .HasScalingStat.ScalingStat_<stat>` overrides; every other stat keeps spirit.
const SCALING_STYLES: Partial<Record<string, ScalingStyle>> = {
    EWeaponPower: "weapon",
    EBaseWeaponDamageIncrease: "weapon",
    ELightMeleeDamage: "weapon",
    EHeavyMeleeDamage: "weapon",
    ELevelUpBoons: "boon",
};

type Bonus = { base: number; scale: number; baseMultiplier: number; scaleMultiplier: number };

type Context = {
    bonuses: Map<string, Bonus>;
    heroStats: AbilityTooltipInput["heroStats"];
    heroIcon: string | null;
    /** Each known property's css class, for the decimals of a description placeholder. */
    classes: Map<string, string | null>;
};

/** The added and multiplied base and scale of every trained tier, keyed by property. */
function trainedBonuses(upgrades: readonly AbilityUpgrade[], states: readonly UpgradeState[]): Map<string, Bonus> {
    const out = new Map<string, Bonus>();
    for (const upgrade of upgrades) {
        if (states[upgrade.tier - 1] !== "has") continue;
        for (const { property, kind } of upgrade.bonuses) {
            if (property.value === null) continue;
            const bonus = out.get(property.key) ?? { base: 0, scale: 0, baseMultiplier: 1, scaleMultiplier: 1 };
            // `EMultiplyBase` is a percent (Ground Strike's 120 reads "+120%"); `EMultiplyScale` is a plain factor,
            // where 0 switches the scaling off.
            if (kind === "addToBase") bonus.base += property.value;
            else if (kind === "addToScale") bonus.scale += property.value;
            else if (kind === "multiplyBase") bonus.baseMultiplier *= 1 + property.value / 100;
            else bonus.scaleMultiplier *= property.value;
            out.set(property.key, bonus);
        }
    }
    return out;
}

type Shown = { value: number | null; factor: number | null; scaled: boolean };

const COOLDOWN_STAT = "ETechCooldown";

/** Adds come before multiplies so the result does not depend on the tiers' order. */
function shownOf(property: TooltipProperty, context: Context): Shown {
    const bonus = context.bonuses.get(property.key);
    const rawFactor = property.scale?.factor;
    const scaledFactor = rawFactor == null ? null : (rawFactor + (bonus?.scale ?? 0)) * (bonus?.scaleMultiplier ?? 1);
    const stat = property.scale?.stat;
    // Cooldown reduction takes `factor` x its percent off the value, the whole percent when there is no factor, and
    // has no scaling label: the game's stat label styles cover the key stats only.
    const cooldown = stat === COOLDOWN_STAT;
    const factor = cooldown || scaledFactor === 0 ? null : scaledFactor;
    if (property.value === null) return { value: null, factor, scaled: false };
    const base = (property.value + (bonus?.base ?? 0)) * (bonus?.baseMultiplier ?? 1);
    const heroStat = stat != null ? context.heroStats?.[stat] : undefined;
    if (heroStat === undefined) return { value: base, factor, scaled: false };
    const share = scaledFactor ?? 1;
    if (cooldown && share !== 0) return { value: base * (1 - (share * heroStat) / 100), factor, scaled: true };
    if (factor !== null) return { value: base + factor * heroStat, factor, scaled: true };
    return { value: base, factor, scaled: false };
}

function valueText(property: TooltipProperty, value: number): ValueText {
    return {
        prefix: property.prefix ?? (property.signed && value >= 0 ? "+" : ""),
        number: formatShownNumber(value, shownDecimals(property.cssClass)),
        postfix: property.unit ?? "",
    };
}

const EMPTY_VALUE: ValueText = { prefix: "", number: "", postfix: "" };

function scalingOf(property: TooltipProperty, factor: number | null, context: Context): ScalingMarker | null {
    if (factor === null) return null;
    const stat = property.scale?.stat ?? null;
    return {
        factor: formatShownNumber(factor, FACTOR_DECIMALS),
        stat,
        arrow: (stat !== null && SCALING_ARROWS[stat]) || null,
        // Only the boon arrow art leaves room for the portrait (`.ScalingStat_ELevelUpBoons #HeroImage`).
        heroIcon: stat === "ELevelUpBoons" ? context.heroIcon : null,
    };
}

function styleOf(property: TooltipProperty, factor: number | null): ScalingStyle | null {
    if (factor === null) return null;
    const stat = property.scale?.stat;
    return (stat != null && SCALING_STYLES[stat]) || "spirit";
}

function chipOf(property: TooltipProperty | null, context: Context, styled: boolean): ChipView | null {
    if (property === null) return null;
    const shown = shownOf(property, context);
    return {
        key: property.key,
        icon: property.cssClass,
        value: shown.value === null ? EMPTY_VALUE : valueText(property, shown.value),
        label: property.label,
        scaling: scalingOf(property, shown.factor, context),
        style: styled && shown.factor !== null ? "spirit" : null,
        scaled: shown.scaled,
    };
}

function cellOf(property: TooltipProperty, context: Context): PromotedCellView | StatusCellView {
    const shown = shownOf(property, context);
    if (property.statusEffect) {
        return {
            kind: "status",
            key: property.key,
            icon: property.key,
            label: property.label,
            value: shown.value === null ? null : valueText(property, shown.value),
        };
    }
    return {
        kind: "value",
        key: property.key,
        icon: property.cssClass,
        value: shown.value === null ? EMPTY_VALUE : valueText(property, shown.value),
        label: property.label,
        scaling: scalingOf(property, shown.factor, context),
        style: styleOf(property, shown.factor),
        scaled: shown.scaled,
    };
}

function rowOf(property: TooltipProperty, context: Context): BasicRowView {
    const shown = shownOf(property, context);
    return {
        key: property.key,
        value: shown.value === null ? EMPTY_VALUE : valueText(property, shown.value),
        label: property.label,
        scaling: scalingOf(property, shown.factor, context),
        scaled: shown.scaled,
    };
}

/** Placeholder numbers rounded as the game prints them, so the markup shows the same digits as the cells. */
function roundedValues(values: Record<string, number>, context: Context): Record<string, number> {
    return Object.fromEntries(
        Object.entries(values).map(([name, value]) => [
            name,
            roundHalfEven(value, shownDecimals(context.classes.get(name) ?? null)),
        ]),
    );
}

function sectionValues(section: AbilitySection, properties: Map<string, TooltipProperty>, context: Context) {
    const current = Object.fromEntries(
        Object.entries(section.values).map(([name, value]) => {
            const property = properties.get(name);
            const shown = property ? shownOf({ ...property, value }, context).value : null;
            return [name, shown ?? value];
        }),
    );
    return roundedValues(current, context);
}

/** A property an upgrade switches on shows only once that tier is trained. */
function unlocked(property: AbilityProperty, states: readonly UpgradeState[]): boolean {
    return property.requiredTier === undefined || states[property.requiredTier - 1] === "has";
}

function sectionView(
    section: AbilitySection,
    properties: Map<string, TooltipProperty>,
    context: Context,
    imbued: ImbuedView | null,
    states: readonly UpgradeState[],
): AbilitySectionView {
    return {
        description: section.description
            ? parseMarkup(section.description, sectionValues(section, properties, context))
            : [],
        imbued,
        groups: section.groups.map((group) => ({
            title: group.title,
            cells: group.cells.filter((cell) => unlocked(cell, states)).map((cell) => cellOf(cell, context)),
        })),
        rows: section.properties.filter((row) => unlocked(row, states)).map((row) => rowOf(row, context)),
    };
}

function bonusView({ property, kind }: AbilityUpgrade["bonuses"][number]): UpgradeBonusView {
    const value = property.value ?? 0;
    const prefix = property.prefix ?? (value >= 0 ? "+" : "");
    const base = { key: property.key, label: property.label };
    // A multiply bonus is a percent of the base or a factor on the scale, never a value in the property's unit.
    if (kind === "multiplyScale") return { ...base, amount: `x${formatShownNumber(value, FACTOR_DECIMALS)}` };
    const number = formatShownNumber(value, shownDecimals(property.cssClass));
    return { ...base, amount: `${prefix}${number}${kind === "multiplyBase" ? "%" : (property.unit ?? "")}` };
}

function allProperties(ability: AbilityTooltip): TooltipProperty[] {
    return [
        ...ability.header,
        ...[ability.charges, ability.chargeCooldown, ability.cooldown].filter((p) => p !== null),
        ...ability.sections.flatMap((s) => [...s.groups.flatMap((g) => g.cells), ...s.properties]),
    ];
}

/** Builds everything a hero ability tooltip view draws, in the game's order. */
export function abilityTooltipModel(input: AbilityTooltipInput): AbilityTooltipModel {
    const { ability, upgrades: states = [], tierCosts, recommendedTier = null, imbuedBy = null } = input;
    const properties = new Map(allProperties(ability).map((p) => [p.key, p]));
    const classes = new Map<string, string | null>();
    for (const bonus of ability.upgrades.flatMap((u) => u.bonuses))
        classes.set(bonus.property.key, bonus.property.cssClass);
    for (const [key, property] of properties) classes.set(key, property.cssClass);
    const context: Context = {
        bonuses: trainedBonuses(ability.upgrades, states),
        heroStats: input.heroStats,
        heroIcon: input.heroIcon ?? null,
        classes,
    };

    const visible = ability.sections.filter((s) => s.requiredTier === null || states[s.requiredTier - 1] === "has");
    const imbued: ImbuedView | null = imbuedBy
        ? {
              name: imbuedBy.name,
              icon: imbuedBy.icon ?? null,
              text: uiText("imbued_by", { item: imbuedBy.name }, "Citadel_Shop_AbilityIsImbued", {
                  imbuing_ability_name: imbuedBy.name,
              }),
          }
        : null;

    const shown = (p: AbilityProperty | null) => (p !== null && unlocked(p, states) ? p : null);

    return {
        name: ability.name,
        chips: ability.header.flatMap((p) => chipOf(shown(p), context, true) ?? []),
        charges: chipOf(shown(ability.charges), context, false),
        chargeCooldown: chipOf(shown(ability.chargeCooldown), context, false),
        cooldown: chipOf(shown(ability.cooldown), context, false),
        sections: visible.map((s, i) => sectionView(s, properties, context, i === 0 ? imbued : null, states)),
        upgrades: ability.upgrades.map((upgrade) => {
            const state = states[upgrade.tier - 1] ?? "notTrained";
            const cost = tierCosts[upgrade.tier - 1];
            return {
                tier: upgrade.tier,
                cost: cost === undefined ? "" : formatShownNumber(cost, 0),
                state,
                recommended: recommendedTier === upgrade.tier && state !== "has",
                bonuses: upgrade.description === null ? upgrade.bonuses.map(bonusView) : [],
                description:
                    upgrade.description === null
                        ? null
                        : parseMarkup(upgrade.description, roundedValues(upgrade.values, context)),
            };
        }),
        text: {
            statusEffect: uiText("status_effect", {}, "Citadel_StatusEffect"),
            recommended: uiText("recommended", {}, "Citadel_HeroBuilds_AP_Next_Indicator"),
        },
    };
}
