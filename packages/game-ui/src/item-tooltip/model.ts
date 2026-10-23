import type { StatSection } from "@deadlock-plus/ipc-types/StatSection";
import type { TooltipBlock } from "@deadlock-plus/ipc-types/TooltipBlock";
import type { TooltipProperty } from "@deadlock-plus/ipc-types/TooltipProperty";
import type { TooltipSection } from "@deadlock-plus/ipc-types/TooltipSection";
import { formatShownNumber } from "../number";
import { gameColors } from "../colors";
import type { HeroStats, ItemDetails, StatGroup, StatGroupKind } from "../hero";
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

/** `negative` is the API's flag; the game files' tooltip data does not carry it yet. */
export type ItemTooltipProperty = TooltipProperty & { negative?: boolean };

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
    /** The ability an owned imbue item is imbued upon; shown with its icon in place of "Owned", as the game does. */
    imbuedUpon?: AbilityRef | null;
    /** False colours the cost the way the game marks an item the player cannot afford yet. */
    canAfford?: boolean;
    popularity?: { phase: PopularityPhase; percent: number; heroIcon?: string | null } | null;
    upgradesFrom?: readonly GameItem[];
    upgradesTo?: readonly GameItem[];
    usedIn?: readonly GameItem[];
    /** Ids of owned items, for the components' owned marks. */
    ownedIds?: readonly number[];
    /** The item has an ALT "See Details" column. */
    hasDetails?: boolean;
    /** ALT is held: the "See Details" column shows `details` instead of its key prompt. */
    detailView?: boolean;
    details?: ItemDetails | null;
    /** The hero's current stats keyed by the game's stat enum (`ETechPower`), for scaled values. */
    heroStats?: HeroStats;
    /** The hero's portrait, drawn on boon-scaled markers. */
    heroIcon?: string | null;
    /** The build author's notes on this item, which the game shows in a box under the tooltip. */
    buildNote?: BuildNoteInput | null;
};

export type AbilityRef = { name: string; icon: string | null };

export type BuildNoteInput = {
    text?: string | null;
    sellPriority?: number | null;
    imbueTarget?: AbilityRef | null;
    /** The build author's Steam avatar; null while it is unknown. */
    avatar?: string | null;
};

/** `.BuildInfoContainer`'s lines; each is null when the build leaves it unset. */
export type BuildNoteView = {
    text: string | null;
    sellPriority: UiText | null;
    imbueTarget: (AbilityRef & { label: UiText }) | null;
    avatar: string | null;
};

/** A value split so the prefix and postfix can be drawn muted. */
export type ValueText = { prefix: string; number: string; postfix: string };

/** The label colour a property's css class asks for. */
export type LabelRole = "default" | "weapon" | "spirit" | "vitality";

/** The `keystat_*_arrow` art beside a scaling marker. */
export type ScalingArrow = "spirit" | "courage" | "fortitude" | "melee" | "boon";

export type ScalingMarker = {
    factor: string;
    stat: string | null;
    arrow: ScalingArrow | null;
    /** The hero's portrait the game draws beside a boon arrow (`.ScalingStat_ELevelUpBoons #HeroImage`). */
    heroIcon: string | null;
};

export type ImportantCell = {
    kind: "important";
    key: string;
    /** The property icon class (`tech_damage`), a `GameArt.propertyIcons` key. */
    icon: string | null;
    value: ValueText;
    label: string;
    role: LabelRole;
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

/** One `.AffectedAbilityProperty` row of the ALT column, its numbers already rounded the game's way. */
export type DetailRow = {
    key: string;
    label: string;
    /** The item's condition, which the game repeats under every row. */
    subText: string | null;
    before: string;
    after: string;
    postfix: string;
};

export type DetailGroup = {
    kind: StatGroupKind;
    icon: string | null;
    /** `.IsImbued.AffectedAbility`: only an ability group can be imbued. */
    imbued: boolean;
    rows: DetailRow[];
};

/** Deadlock+'s own match stats for a phase, drawn under the game's rows. */
export type DetailPhaseLine = { phase: PopularityPhase; label: UiText; rates: UiText };

/** What the ALT column draws while ALT is held, in place of its key prompt. */
export type DetailsPanel = {
    /** The header's "Modifies" label; null leaves the header a bare strip. */
    heading: UiText | null;
    groups: DetailGroup[];
    /** `.AffectedValNew`'s colour by the item's slot. */
    valueColor: string;
    /** `.AffectedValPostfix`'s; null keeps the text colour, as vitality items do. */
    postfixColor: string | null;
    phases: { heading: UiText; lines: DetailPhaseLine[] } | null;
};

export type ItemTooltipModel = {
    /** Panorama px of the main column. */
    width: 450 | 420 | 410;
    header: {
        name: string;
        slot: ItemSlot;
        cost: string | null;
        /** `.cantAfford`: the cost and its glyph turn red. */
        cantAfford: boolean;
        owned: UiText | null;
        imbued: { text: UiText; icon: string | null } | null;
    };
    sections: SectionView[];
    popularity: { phase: PopularityPhase; heroIcon: string | null; text: UiText } | null;
    components: ComponentGroup[];
    details: { side: "left" | "right"; label: UiText; panel: DetailsPanel | null } | null;
    buildNote: BuildNoteView | null;
    /** Shared labels the cells and rows refer to by flag. */
    text: { variesByHero: UiText };
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

// The boon arrow art leaves its right side empty for the portrait; the other arrows fill their art.
const BOON_STAT = "ELevelUpBoons";

// Scaled values are a sum of game floats; the game's exact rounding for them is not known.
const SCALED_DECIMALS = 2;

function valueText(value: number, signed: boolean, unit: string | null, decimals?: number): ValueText {
    return {
        prefix: signed && value >= 0 ? "+" : "",
        number: formatGameNumber(value, decimals),
        postfix: unit ?? "",
    };
}

function scalingOf(property: ItemTooltipProperty, heroIcon: string | null): ScalingMarker | null {
    const scale = property.scale;
    if (scale?.factor == null) return null;
    return {
        factor: formatGameNumber(scale.factor),
        stat: scale.stat,
        arrow: (scale.stat !== null && SCALING_ARROWS[scale.stat]) || null,
        heroIcon: scale.stat === BOON_STAT ? heroIcon : null,
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

function cellOf(
    property: ItemTooltipProperty,
    heroStats: ItemTooltipInput["heroStats"],
    heroIcon: string | null,
): ImportantCell | StatusCell {
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
        negative: property.negative === true,
        scaling: scalingOf(property, heroIcon),
        scaled: shown?.scaled ?? false,
        variesByHero: property.displayType === BUILD_UP_RATE,
    };
}

function rowOf(
    property: ItemTooltipProperty,
    elevated: boolean,
    heroStats: ItemTooltipInput["heroStats"],
    heroIcon: string | null,
): StatRow {
    const shown = shownValue(property, heroStats);
    return {
        key: property.key,
        value: shown?.value ?? null,
        label: property.label,
        elevated,
        negative: property.negative === true,
        scaling: scalingOf(property, heroIcon),
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

function blockView(
    block: ItemTooltipBlock,
    heroStats: ItemTooltipInput["heroStats"],
    heroIcon: string | null,
): BlockView {
    const cells = block.important.map((p) => cellOf(p, heroStats, heroIcon));
    const rows = [
        ...block.elevated.map((p) => rowOf(p, true, heroStats, heroIcon)),
        ...block.properties.map((p) => rowOf(p, false, heroStats, heroIcon)),
    ];
    return {
        description: block.description ? parseMarkup(block.description, block.values) : [],
        layout: layoutOf(cells.length),
        cells,
        rows,
        showStats: cells.length > 0 || rows.length > 0,
        hasRows: rows.length > 0,
    };
}

const SECTION_LABELS: Record<Exclude<StatSection, "innate">, UiText> = {
    passive: uiText("passive", {}, "Citadel_Mod_Tooltip_Passive"),
    active: uiText("active", {}, "Citadel_Mod_Tooltip_Active"),
};

function sectionView(
    section: ItemTooltipSection,
    heroStats: ItemTooltipInput["heroStats"],
    heroIcon: string | null,
): SectionView {
    return {
        kind: section.kind,
        bar: section.kind === "innate" ? "none" : section.kind,
        label: section.kind === "innate" ? null : SECTION_LABELS[section.kind],
        cooldown: section.cooldown === null ? null : valueText(section.cooldown, false, "s"),
        chargeUp: section.chargeUp == null ? null : valueText(section.chargeUp, false, "s"),
        stacks: section.stacks ? { count: formatGameNumber(section.stacks.count), label: section.stacks.label } : null,
        blocks: section.blocks.map((b) => blockView(b, heroStats, heroIcon)),
    };
}

const POPULARITY_TOKENS: Record<PopularityPhase, string> = {
    early: "Citadel_PopularityLabel_Early",
    mid: "Citadel_PopularityLabel_Mid",
    late: "Citadel_PopularityLabel_Late",
};

const DETAIL_VALUE_COLORS: Record<ItemSlot, string> = {
    weapon: gameColors.courageBright,
    spirit: gameColors.spiritBright,
    vitality: gameColors.fortitudeBright,
};

function detailGroup(group: StatGroup, condition: string | null): DetailGroup {
    return {
        kind: group.kind,
        icon: group.icon,
        imbued: group.kind === "ability" && group.imbued === true,
        rows: group.changes.map((c) => ({
            key: c.key,
            label: c.label,
            subText: condition,
            before: formatShownNumber(c.before, c.decimals),
            after: formatShownNumber(c.after, c.decimals),
            postfix: c.postfix ?? "",
        })),
    };
}

// `.HasAnnotation .ModifiesLabel`: the header's label shares the build note's class, so it shows with the note's text.
const MODIFIES = uiText("modifies", {}, "Citadel_ItemModifies");

function detailsPanel(details: ItemDetails, slot: ItemSlot, annotated: boolean): DetailsPanel {
    const lines = details.phases
        .filter((p) => Number.isFinite(p.pickPercent) && Number.isFinite(p.winPercent))
        .map((p) => ({
            phase: p.phase,
            label: uiText(`phase_${p.phase}`),
            rates: uiText("phase_rates", { pick: Math.round(p.pickPercent), win: Math.round(p.winPercent) }),
        }));
    return {
        heading: annotated ? MODIFIES : null,
        groups: details.groups.map((g) => detailGroup(g, details.condition)),
        valueColor: DETAIL_VALUE_COLORS[slot],
        postfixColor: slot === "vitality" ? null : DETAIL_VALUE_COLORS[slot],
        phases: lines.length > 0 ? { heading: uiText("phase_heading"), lines } : null,
    };
}

function buildNoteView(note: BuildNoteInput): BuildNoteView | null {
    const text = note.text?.trim() || null;
    // A build stores an unset sell priority as 0.
    const priority = note.sellPriority || null;
    const target = note.imbueTarget ?? null;
    if (text === null && priority === null && target === null) return null;
    return {
        text,
        sellPriority:
            priority === null
                ? null
                : uiText("sell_priority", { priority }, "Citadel_Item_Build_SellPriority", { sell_priority: priority }),
        imbueTarget:
            target === null
                ? null
                : { label: uiText("imbue_suggestion", {}, "Citadel_Item_Build_ImbueTarget"), ...target },
        avatar: note.avatar ?? null,
    };
}

/** Builds everything an item tooltip view draws, in the game's order, from the item and its tooltip data. */
export function itemTooltipModel(input: ItemTooltipInput): ItemTooltipModel {
    const { item, owned = false, imbuedUpon = null, hasDetails = false, position = "right" } = input;
    const ownedIds = new Set(input.ownedIds ?? []);
    const imbued = owned ? imbuedUpon : null;
    const cost = owned || item.cost === 0 ? null : formatGameNumber(item.cost);

    const groups: [ComponentGroup["kind"], readonly GameItem[] | undefined, UiText][] = [
        ["from", input.upgradesFrom, uiText("upgrades_from", {}, "Citadel_ComponentRequired")],
        ["to", input.upgradesTo, uiText("upgrades_to", {}, "Citadel_IsComponentOf")],
        ["usedIn", input.usedIn, uiText("used_in", {}, "Citadel_ComponentUseIn")],
    ];

    const buildNote = input.buildNote ? buildNoteView(input.buildNote) : null;
    const panel =
        input.detailView && input.details ? detailsPanel(input.details, item.slot, buildNote?.text != null) : null;
    const column = hasDetails || panel !== null;

    const popularity = input.popularity ?? null;
    const percent = popularity ? Math.round(popularity.percent) : 0;

    return {
        width: column ? 450 : position === "left" ? 410 : 420,
        header: {
            name: item.name,
            slot: item.slot,
            cost,
            cantAfford: cost !== null && input.canAfford === false,
            owned: owned && imbued === null ? uiText("owned", {}, "Citadel_Shop_Purchased") : null,
            imbued:
                imbued === null
                    ? null
                    : {
                          text: uiText("imbued_upon", { ability: imbued.name }, "Citadel_Shop_AbilityIsImbuing", {
                              imbued_ability_name: imbued.name,
                          }),
                          icon: imbued.icon,
                      },
        },
        sections: input.sections.map((s) => sectionView(s, input.heroStats, input.heroIcon ?? null)),
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
        details: column ? { side: position, label: uiText("see_details", {}, "Citadel_ItemViewImpact"), panel } : null,
        buildNote,
        text: { variesByHero: uiText("varies_by_hero") },
    };
}
