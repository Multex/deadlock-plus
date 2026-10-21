import type { StatSection } from "@deadlock-plus/ipc-types/StatSection";
import type { TooltipBlock } from "@deadlock-plus/ipc-types/TooltipBlock";
import type { TooltipProperty } from "@deadlock-plus/ipc-types/TooltipProperty";
import type { TooltipSection } from "@deadlock-plus/ipc-types/TooltipSection";
import type { GameItem, ItemSlot } from "../item";
import { formatGameNumber, parseMarkup, type MarkupNode } from "../markup/markup";

/**
 * Text the tooltip draws itself: an app locale key with its params, and the game's own localisation token
 * (with the game's param names) when the game has the same string. A host that loaded the game's strings can
 * show those instead.
 */
export type UiText = {
    key: string;
    params: Record<string, string | number>;
    game: { token: string; params: Record<string, string | number> } | null;
};

/** `conditional` and `negative` are the API's flags; the game files' tooltip data does not carry them yet. */
export type ItemTooltipProperty = TooltipProperty & { conditional?: boolean; negative?: boolean };

export type ItemTooltipBlock = Omit<TooltipBlock, "elevated" | "important" | "properties"> & {
    elevated: readonly ItemTooltipProperty[];
    important: readonly ItemTooltipProperty[];
    properties: readonly ItemTooltipProperty[];
};

export type ItemTooltipSection = Omit<TooltipSection, "blocks"> & {
    blocks: readonly ItemTooltipBlock[];
    /** Seconds; the section's charge-up pill. */
    chargeUp?: number | null;
    stacks?: { count: number; label: string } | null;
};

export type PopularityPhase = "early" | "mid" | "late";

export type ItemTooltipInput = {
    item: GameItem;
    sections: readonly ItemTooltipSection[];
    /** The side of its anchor the tooltip opens on. Defaults to right. */
    position?: "left" | "right";
    /** Owned items show "Owned" instead of the cost. */
    owned?: boolean;
    /** The ability an owned imbue item is imbued upon; shown in place of "Owned", as the game does. */
    imbuedUpon?: string | null;
    popularity?: { phase: PopularityPhase; percent: number; heroIcon?: string | null } | null;
    upgradesFrom?: readonly GameItem[];
    upgradesTo?: readonly GameItem[];
    usedIn?: readonly GameItem[];
    /** Ids of owned items, for the components' owned marks. */
    ownedIds?: readonly number[];
    /** The item has an ALT "See Details" column. */
    hasDetails?: boolean;
    /** The hero's current stats keyed by the game's stat enum (`ETechPower`), for scaled values. */
    heroStats?: Partial<Record<string, number>>;
};

/** A value split so the prefix and postfix can be drawn muted. */
export type ValueText = { prefix: string; number: string; postfix: string };

/** The label colour a property's css class asks for. */
export type LabelRole = "default" | "weapon" | "spirit" | "vitality";

/** The `keystat_*_arrow` art beside a scaling marker. */
export type ScalingArrow = "spirit" | "courage" | "fortitude" | "melee" | "boon";

export type ScalingMarker = { factor: string; stat: string | null; arrow: ScalingArrow | null };

export type ImportantCell = {
    kind: "important";
    key: string;
    /** The property icon class (`tech_damage`), a `GameArt.propertyIcons` key. */
    icon: string | null;
    value: ValueText;
    label: string;
    role: LabelRole;
    conditional: boolean;
    negative: boolean;
    scaling: ScalingMarker | null;
    /** The value includes the hero's stat. */
    scaled: boolean;
    /** The game shows a hero-specific number this data cannot compute; the value is the base. */
    variesByHero: boolean;
};

export type StatusCell = {
    kind: "status";
    key: string;
    /** The status key (`StatusEffectEMP`), a `GameArt.propertyIcons` key. */
    icon: string;
    duration: ValueText | null;
    label: string;
    role: LabelRole;
};

export type StatRow = {
    key: string;
    value: ValueText | null;
    label: string;
    elevated: boolean;
    conditional: boolean;
    negative: boolean;
    scaling: ScalingMarker | null;
    scaled: boolean;
    variesByHero: boolean;
};

/**
 * How a block's cells share the stats row: `none` (no important cells), `one` (a cell beside the rows),
 * `several` (cells side by side, rows below), `four` (cells two by two, rows below).
 */
export type CellLayout = "none" | "one" | "several" | "four";

export type BlockView = {
    description: MarkupNode[];
    layout: CellLayout;
    cells: (ImportantCell | StatusCell)[];
    rows: StatRow[];
    /** False when the block has neither cells nor rows: the stats area collapses. */
    showStats: boolean;
    hasRows: boolean;
    /** A cell shows a scaling marker, which makes the stats area taller. */
    scaling: boolean;
};

export type SectionView = {
    kind: StatSection;
    bar: "none" | "passive" | "active";
    label: UiText | null;
    cooldown: ValueText | null;
    chargeUp: ValueText | null;
    stacks: { count: string; label: string } | null;
    blocks: BlockView[];
};

export type ComponentGroup = {
    kind: "from" | "to" | "usedIn";
    label: UiText;
    items: { item: GameItem; owned: boolean }[];
};

export type ItemTooltipModel = {
    /** Panorama px of the main column. */
    width: 450 | 420 | 410;
    header: {
        name: string;
        slot: ItemSlot;
        cost: string | null;
        owned: UiText | null;
        imbued: UiText | null;
    };
    sections: SectionView[];
    popularity: { phase: PopularityPhase; heroIcon: string | null; text: UiText } | null;
    components: ComponentGroup[];
    details: { side: "left" | "right"; label: UiText } | null;
    /** Shared labels the cells and rows refer to by flag. */
    text: { conditional: UiText; variesByHero: UiText };
};

const NS = "game_ui.item_tooltip";

function uiText(
    key: string,
    params: Record<string, string | number> = {},
    token: string | null = null,
    gameParams: Record<string, string | number> = params,
): UiText {
    return { key: `${NS}.${key}`, params, game: token === null ? null : { token, params: gameParams } };
}

const SCALING_ARROWS: Partial<Record<string, ScalingArrow>> = {
    ETechPower: "spirit",
    EWeaponPower: "courage",
    EBaseWeaponDamage: "courage",
    EArmorPower: "fortitude",
    ELevelUpBoons: "boon",
    ELightMeleeDamage: "melee",
    EHeavyMeleeDamage: "melee",
};

const ROLES: Partial<Record<string, LabelRole>> = {
    bullet_damage: "weapon",
    tech_damage: "spirit",
    healing: "vitality",
    health: "vitality",
};

const STATUS_ROLES: Partial<Record<string, LabelRole>> = { StatusEffectEMP: "spirit" };

const BUILD_UP_RATE = "EBuildUpRate";

// Scaled values are a sum of game floats; the game's exact rounding for them is not known.
const SCALED_DECIMALS = 2;

function valueText(value: number, signed: boolean, unit: string | null, decimals?: number): ValueText {
    return {
        prefix: signed && value >= 0 ? "+" : "",
        number: formatGameNumber(value, decimals),
        postfix: unit ?? "",
    };
}

function scalingOf(property: ItemTooltipProperty): ScalingMarker | null {
    const scale = property.scale;
    if (scale?.factor == null) return null;
    return {
        factor: formatGameNumber(scale.factor),
        stat: scale.stat,
        arrow: (scale.stat !== null && SCALING_ARROWS[scale.stat]) || null,
    };
}

function shownValue(property: ItemTooltipProperty, heroStats: ItemTooltipInput["heroStats"]) {
    const factor = property.scale?.factor;
    const stat = property.scale?.stat;
    const heroStat = stat != null ? heroStats?.[stat] : undefined;
    if (property.value === null) return null;
    if (factor != null && heroStat !== undefined) {
        return {
            value: valueText(property.value + factor * heroStat, property.signed, property.unit, SCALED_DECIMALS),
            scaled: true,
        };
    }
    return { value: valueText(property.value, property.signed, property.unit), scaled: false };
}

function cellOf(property: ItemTooltipProperty, heroStats: ItemTooltipInput["heroStats"]): ImportantCell | StatusCell {
    if (property.statusEffect) {
        return {
            kind: "status",
            key: property.key,
            icon: property.key,
            duration: property.value === null ? null : valueText(property.value, false, property.unit),
            label: property.label,
            role: STATUS_ROLES[property.key] ?? "default",
        };
    }
    const shown = shownValue(property, heroStats);
    return {
        kind: "important",
        key: property.key,
        icon: property.cssClass,
        value: shown?.value ?? { prefix: "", number: "", postfix: "" },
        label: property.label,
        role: (property.cssClass !== null && ROLES[property.cssClass]) || "default",
        conditional: property.conditional === true,
        negative: property.negative === true,
        scaling: scalingOf(property),
        scaled: shown?.scaled ?? false,
        variesByHero: property.displayType === BUILD_UP_RATE,
    };
}

function rowOf(property: ItemTooltipProperty, elevated: boolean, heroStats: ItemTooltipInput["heroStats"]): StatRow {
    const shown = shownValue(property, heroStats);
    return {
        key: property.key,
        value: shown?.value ?? null,
        label: property.label,
        elevated,
        conditional: property.conditional === true,
        negative: property.negative === true,
        scaling: scalingOf(property),
        scaled: shown?.scaled ?? false,
        variesByHero: property.displayType === BUILD_UP_RATE,
    };
}

function layoutOf(count: number): CellLayout {
    if (count === 0) return "none";
    if (count === 1) return "one";
    // The game's class is named for four; larger counts keep its two-per-row wrap.
    return count >= 4 ? "four" : "several";
}

function blockView(block: ItemTooltipBlock, heroStats: ItemTooltipInput["heroStats"]): BlockView {
    const cells = block.important.map((p) => cellOf(p, heroStats));
    const rows = [
        ...block.elevated.map((p) => rowOf(p, true, heroStats)),
        ...block.properties.map((p) => rowOf(p, false, heroStats)),
    ];
    return {
        description: block.description ? parseMarkup(block.description, block.values) : [],
        layout: layoutOf(cells.length),
        cells,
        rows,
        showStats: cells.length > 0 || rows.length > 0,
        hasRows: rows.length > 0,
        scaling: cells.some((c) => c.kind === "important" && c.scaling !== null),
    };
}

const SECTION_LABELS: Record<Exclude<StatSection, "innate">, UiText> = {
    passive: uiText("passive", {}, "Citadel_Mod_Tooltip_Passive"),
    active: uiText("active", {}, "Citadel_Mod_Tooltip_Active"),
};

function sectionView(section: ItemTooltipSection, heroStats: ItemTooltipInput["heroStats"]): SectionView {
    return {
        kind: section.kind,
        bar: section.kind === "innate" ? "none" : section.kind,
        label: section.kind === "innate" ? null : SECTION_LABELS[section.kind],
        cooldown: section.cooldown === null ? null : valueText(section.cooldown, false, "s"),
        chargeUp: section.chargeUp == null ? null : valueText(section.chargeUp, false, "s"),
        stacks: section.stacks ? { count: formatGameNumber(section.stacks.count), label: section.stacks.label } : null,
        blocks: section.blocks.map((b) => blockView(b, heroStats)),
    };
}

const POPULARITY_TOKENS: Record<PopularityPhase, string> = {
    early: "Citadel_PopularityLabel_Early",
    mid: "Citadel_PopularityLabel_Mid",
    late: "Citadel_PopularityLabel_Late",
};

/** Builds everything an item tooltip view draws, in the game's order, from the item and its tooltip data. */
export function itemTooltipModel(input: ItemTooltipInput): ItemTooltipModel {
    const { item, owned = false, imbuedUpon = null, hasDetails = false, position = "right" } = input;
    const ownedIds = new Set(input.ownedIds ?? []);
    const imbued = owned && imbuedUpon ? imbuedUpon : null;

    const groups: [ComponentGroup["kind"], readonly GameItem[] | undefined, UiText][] = [
        ["from", input.upgradesFrom, uiText("upgrades_from", {}, "Citadel_ComponentRequired")],
        ["to", input.upgradesTo, uiText("upgrades_to", {}, "Citadel_IsComponentOf")],
        ["usedIn", input.usedIn, uiText("used_in", {}, "Citadel_ComponentUseIn")],
    ];

    const popularity = input.popularity ?? null;
    const percent = popularity ? Math.round(popularity.percent) : 0;

    return {
        width: hasDetails ? 450 : position === "left" ? 410 : 420,
        header: {
            name: item.name,
            slot: item.slot,
            cost: owned || item.cost === 0 ? null : formatGameNumber(item.cost),
            owned: owned && imbued === null ? uiText("owned", {}, "Citadel_Shop_Purchased") : null,
            imbued:
                imbued === null
                    ? null
                    : uiText("imbued_upon", { ability: imbued }, "Citadel_Shop_AbilityIsImbuing", {
                          imbued_ability_name: imbued,
                      }),
        },
        sections: input.sections.map((s) => sectionView(s, input.heroStats)),
        popularity: popularity
            ? {
                  phase: popularity.phase,
                  heroIcon: popularity.heroIcon ?? null,
                  text: uiText(`popular_${popularity.phase}`, { percent }, POPULARITY_TOKENS[popularity.phase], {
                      popular_pct: percent,
                  }),
              }
            : null,
        components: groups
            .filter(([, items]) => items !== undefined && items.length > 0)
            .map(([kind, items, label]) => ({
                kind,
                label,
                items: (items ?? []).map((component) => ({ item: component, owned: ownedIds.has(component.id) })),
            })),
        details: hasDetails ? { side: position, label: uiText("see_details", {}, "Citadel_ItemViewImpact") } : null,
        text: {
            conditional: uiText("conditional", {}, "Citadel_Shop_ConditionalAttribute"),
            variesByHero: uiText("varies_by_hero"),
        },
    };
}
