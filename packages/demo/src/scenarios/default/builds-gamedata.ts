import type { AbilityCellGroup } from "@deadlock-plus/ipc-types/AbilityCellGroup";
import type { AbilityProperty } from "@deadlock-plus/ipc-types/AbilityProperty";
import type { AbilitySection } from "@deadlock-plus/ipc-types/AbilitySection";
import type { AbilityTooltip } from "@deadlock-plus/ipc-types/AbilityTooltip";
import type { AbilityUpgrade } from "@deadlock-plus/ipc-types/AbilityUpgrade";
import type { GameUiStrings } from "@deadlock-plus/ipc-types/GameUiStrings";
import type { HeroStatsData } from "@deadlock-plus/ipc-types/HeroStatsData";
import type { InvestmentTier } from "@deadlock-plus/ipc-types/InvestmentTier";
import type { PropertyIconArt } from "@deadlock-plus/ipc-types/PropertyIconArt";
import type { StatScale } from "@deadlock-plus/ipc-types/StatScale";
import type { StatSection } from "@deadlock-plus/ipc-types/StatSection";
import type { TooltipBlock } from "@deadlock-plus/ipc-types/TooltipBlock";
import type { TooltipProperty } from "@deadlock-plus/ipc-types/TooltipProperty";
import type { TooltipSection } from "@deadlock-plus/ipc-types/TooltipSection";
import type { UpgradeKind } from "@deadlock-plus/ipc-types/UpgradeKind";

export interface GameAssetProperty {
    value?: string | number;
    label?: string;
    postvalue_label?: string;
    postfix?: string;
    prefix?: string;
    css_class?: string;
    icon?: string;
    disable_value?: string | number;
    scale_function?: {
        class_name?: string;
        specific_stat_scale_type?: string;
        stat_scale?: number;
        scaling_stats?: string[];
    };
    usage_flags?: string[];
    negative_attribute?: boolean;
    /** The game's condition wording ("within Range"), on the properties that have one. */
    conditional?: string;
}

type NamedProperty = string | { name: string; icon?: string; localized_name?: string };

interface GameAssetSectionAttributes {
    loc_string?: string;
    properties?: NamedProperty[];
    elevated_properties?: NamedProperty[];
    important_properties?: NamedProperty[];
    important_properties_with_icon?: NamedProperty[];
}

interface GameAssetCell {
    important_property?: string;
    show_property_value?: boolean;
    status_effect_value?: string;
    status_effect_name?: string;
    important_property_icon?: string;
}

export interface GameAssetItem {
    id: number;
    class_name: string;
    name: string;
    type: string;
    ability_type?: string;
    properties?: Record<string, GameAssetProperty>;
    tooltip_sections?: { section_type?: string; section_attributes?: GameAssetSectionAttributes[] }[];
    tooltip_details?: {
        info_sections?: {
            loc_string?: string;
            properties_block?: { loc_string?: string; properties?: GameAssetCell[] }[];
            basic_properties?: string[];
            property_upgrade_required?: string;
        }[];
        additional_header_properties?: string[];
    };
    description?: Record<string, string | null | undefined> | null;
    upgrades?: { property_upgrades?: { name: string; bonus: string | number; upgrade_type?: string }[] }[];
    weapon_info?: { bullet_damage?: number } | null;
}

export interface GameAssetHero {
    id: number;
    items?: Record<string, string>;
    starting_stats?: Record<string, { value?: unknown; display_stat_name?: string }>;
    standard_level_up_upgrades?: Record<string, unknown>;
    cost_bonuses?: Partial<
        Record<"weapon" | "spirit" | "vitality", { gold_threshold: number; bonus: number; percent_on_graph?: number }[]>
    >;
}

interface Raw {
    key: string;
    value: number | null;
    metres: boolean;
    label: string | null;
    /** The postfix of the property holding the number; a status cell without one has none. */
    postfix: string | null;
    prefix: string | null;
    cssClass: string | null;
    scale: StatScale | null;
    disableValue: number | null;
    statusEffect: boolean;
    conditional: boolean;
    negative: boolean;
}

/** A property value: a number, or a string with an optional `m` for metres. */
function parse(value: unknown): [number, boolean] | null {
    if (typeof value === "number") return [value, false];
    if (typeof value !== "string") return null;
    const text = value.trim();
    const metres = text.endsWith("m");
    const digits = (metres ? text.slice(0, -1) : text).trim();
    const n = Number(digits);
    return digits === "" || !Number.isFinite(n) ? null : [n, metres];
}

const TECH_DAMAGE_SCALE = "scale_function_tech_damage";

/** A scale with a factor, or one naming the hero stat that rescales the value; the game marks no other. */
function statScale(f: GameAssetProperty["scale_function"]): StatScale | null {
    if (!f) return null;
    const fn = f.class_name ?? "";
    const named = f.specific_stat_scale_type ?? null;
    let factor: number | null;
    if (f.stat_scale === 0) return null;
    if (typeof f.stat_scale === "number") factor = f.stat_scale;
    else if (named !== null && f.scaling_stats === undefined) factor = null;
    else return null;
    // Spirit damage grows with Spirit Power without naming it.
    const stat = named ?? (factor !== null && fn === TECH_DAMAGE_SCALE ? "ETechPower" : null);
    return { stat, factor, function: fn };
}

function rawProperty(name: string, properties: Record<string, GameAssetProperty>): Raw | null {
    const p = properties[name];
    const parsed = p ? parse(p.value) : null;
    if (!p || !parsed) return null;
    return {
        key: name,
        value: parsed[0],
        metres: parsed[1],
        label: p.label || p.postvalue_label || null,
        postfix: p.postfix || null,
        prefix: p.prefix ?? null,
        cssClass: p.css_class || null,
        scale: statScale(p.scale_function),
        disableValue: p.disable_value === undefined ? null : (parse(p.disable_value)?.[0] ?? null),
        statusEffect: false,
        conditional: (p.usage_flags ?? []).some((flag) => flag.includes("ConditionallyApplied")),
        negative: p.negative_attribute === true,
    };
}

/** A status cell names an effect, not a property; its number, if shown, is the property it measures. */
function statusCell(name: string, label: string | null, measured: Raw | null, withValue: boolean): Raw | null {
    if (!name.startsWith("StatusEffect")) return null;
    const value = withValue ? (measured?.value ?? null) : null;
    return {
        key: name,
        value,
        metres: measured?.metres ?? false,
        label,
        postfix: value === null ? null : (measured?.postfix ?? null),
        prefix: null,
        cssClass: measured?.cssClass ?? null,
        scale: measured?.scale ?? null,
        disableValue: null,
        statusEffect: true,
        conditional: measured?.conditional ?? false,
        negative: measured?.negative ?? false,
    };
}

/** A zero or the disable value shows nothing in the game: the property is switched off. */
const shows = (raw: Raw, value: number) => value !== 0 && raw.disableValue !== value;

/** `raw` with `value` in place of its own; null when the game has no label for it. */
function labelled(raw: Raw, value: number | null): TooltipProperty | null {
    if (!raw.label) return null;
    const prefix = raw.prefix || null;
    const signed = prefix !== null && (prefix.includes("{s:sign}") || prefix.includes("+"));
    return {
        key: raw.key,
        value,
        unit: raw.postfix ?? (raw.metres ? "m" : null),
        label: raw.label,
        signed,
        ...(prefix !== null && !signed ? { prefix } : {}),
        cssClass: raw.cssClass,
        displayType: null,
        scale: raw.scale,
        statusEffect: raw.statusEffect,
        conditional: raw.conditional,
        negative: raw.negative,
    };
}

/** Inline icons the asset adds before a keyword; the game's own markup has the keyword's span alone. */
function gameMarkup(text: string | null | undefined): string | null {
    if (!text) return null;
    return text.replace(/<svg[\s\S]*?<\/svg>\s*/g, "").replace(/<img\b[^>]*>/g, "");
}

function placeholderValues(text: string | null, value: (name: string) => number | undefined): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [, name] of (text ?? "").matchAll(/\{s:([A-Za-z0-9_]+)\}/g)) {
        const n = value(name!);
        if (n !== undefined) out[name!] = n;
    }
    return out;
}

function numericValues(properties: Record<string, GameAssetProperty>): Map<string, number> {
    return new Map(
        Object.entries(properties).flatMap(([key, p]) => {
            const parsed = parse(p.value);
            return parsed ? [[key, parsed[0]] as const] : [];
        }),
    );
}

interface RawUpgrade {
    bonuses: { raw: Raw; bonus: number; kind: UpgradeKind }[];
}

const UPGRADE_KINDS: Partial<Record<string, UpgradeKind>> = {
    EAddToScale: "addToScale",
    EMultiplyBase: "multiplyBase",
    EMultiplyScale: "multiplyScale",
};

function rawUpgrades(item: GameAssetItem, properties: Record<string, GameAssetProperty>): RawUpgrade[] {
    return (item.upgrades ?? []).map((tier) => ({
        bonuses: (tier.property_upgrades ?? []).flatMap((upgrade) => {
            const raw = rawProperty(upgrade.name, properties);
            const bonus = parse(upgrade.bonus);
            if (!raw || !bonus) return [];
            return [{ raw, bonus: bonus[0], kind: UPGRADE_KINDS[upgrade.upgrade_type ?? ""] ?? "addToBase" }];
        }),
    }));
}

type Cell = { raw: Raw; tier: number | null };

/** When the game first shows `raw`: untrained, or once a tier's added bonuses lift it; null when never. */
function shownFrom(raw: Raw, upgrades: RawUpgrade[], show: (raw: Raw, value: number) => boolean): Cell | null {
    if (raw.statusEffect || (raw.value !== null && show(raw, raw.value))) return { raw, tier: null };
    if (raw.value === null) return null;
    let value = raw.value;
    for (const [i, upgrade] of upgrades.entries()) {
        for (const b of upgrade.bonuses) if (b.raw.key === raw.key && b.kind === "addToBase") value += b.bonus;
        if (show(raw, value)) return { raw, tier: i + 1 };
    }
    return null;
}

function abilityProperty(cell: Cell | null): AbilityProperty | null {
    const property = cell ? labelled(cell.raw, cell.raw.value) : null;
    if (!property) return null;
    return cell!.tier === null ? property : { ...property, requiredTier: cell!.tier };
}

const present = <T>(list: (T | null)[]): T[] => list.filter((x): x is T => x !== null);

const HEADER_CHIPS = ["AbilityChannelTime", "AbilityCastRange", "Radius", "AbilityDuration"];
const ABILITY_BAR_TYPES = new Set(["signature", "ultimate"]);

function abilityTooltip(item: GameAssetItem): AbilityTooltip | null {
    const details = item.tooltip_details;
    if (!details) return null;
    const properties = item.properties ?? {};
    const values = numericValues(properties);
    const upgrades = rawUpgrades(item, properties);
    // Charge delays sit at -1 on abilities without charges, below their -2 disable value.
    const positive = (name: string) => {
        const raw = rawProperty(name, properties);
        return raw ? shownFrom(raw, upgrades, (r, v) => v > 0 && shows(r, v)) : null;
    };
    const charges = positive("AbilityCharges");
    const delay = charges ? positive("AbilityCooldownBetweenCharge") : null;
    const chargeCooldown =
        delay && charges
            ? { raw: delay.raw, tier: delay.tier === null ? charges.tier : Math.max(delay.tier, charges.tier ?? 0) }
            : null;

    const sections = (details.info_sections ?? []).map((section): AbilitySection => {
        const groups = (section.properties_block ?? []).map((block): AbilityCellGroup => ({
            title: block.loc_string || null,
            cells: present(
                (block.properties ?? []).map((cell) => {
                    const name = cell.important_property ?? "";
                    const measured = cell.status_effect_value
                        ? rawProperty(cell.status_effect_value, properties)
                        : null;
                    const raw =
                        rawProperty(name, properties) ??
                        statusCell(name, cell.status_effect_name ?? null, measured, cell.show_property_value === true);
                    return abilityProperty(raw ? shownFrom(raw, upgrades, shows) : null);
                }),
            ),
        }));
        const required = section.property_upgrade_required;
        const tier = required ? upgrades.findIndex((u) => u.bonuses.some((b) => b.raw.key === required)) : -1;
        const description = gameMarkup(section.loc_string);
        return {
            description,
            values: placeholderValues(description, (n) => values.get(n)),
            groups,
            properties: present(
                (section.basic_properties ?? []).map((name) => {
                    const raw = rawProperty(name, properties);
                    return abilityProperty(raw ? shownFrom(raw, upgrades, shows) : null);
                }),
            ),
            requiredTier: tier >= 0 ? tier + 1 : null,
        };
    });

    const tiers = upgrades.map((upgrade, i): AbilityUpgrade => {
        const tier = i + 1;
        const description = gameMarkup(item.description?.[`t${tier}_desc`]);
        const bonus = (name: string) => upgrade.bonuses.find((b) => b.raw.key === name)?.bonus;
        return {
            tier,
            description,
            values: placeholderValues(description, (n) => bonus(n) ?? values.get(n)),
            bonuses: present(
                upgrade.bonuses.map((b) => {
                    const property = labelled(b.raw, b.bonus);
                    return property ? { property, kind: b.kind } : null;
                }),
            ),
        };
    });

    return {
        abilityId: item.id,
        className: item.class_name,
        name: item.name || item.class_name,
        header: present(
            [...HEADER_CHIPS, ...(details.additional_header_properties ?? [])].map(positive).map(abilityProperty),
        ),
        charges: abilityProperty(charges),
        chargeCooldown: abilityProperty(chargeCooldown),
        cooldown: abilityProperty(positive("AbilityCooldown")),
        sections,
        upgrades: tiers,
    };
}

/**
 * Every ability-bar ability's tooltip, sorted by ability id. The asset is a copy of the game's abilities file with
 * English labels filled in, so the installed game's rules read it unchanged.
 */
export function abilityTooltips(items: readonly GameAssetItem[]): AbilityTooltip[] {
    return present(
        items
            .filter((item) => item.type === "ability" && ABILITY_BAR_TYPES.has(item.ability_type ?? ""))
            .map(abilityTooltip),
    ).sort((a, b) => a.abilityId - b.abilityId);
}

const nameOf = (entry: NamedProperty) => (typeof entry === "string" ? entry : entry.name);

const SECTION_KINDS: Partial<Record<string, StatSection>> = { innate: "innate", passive: "passive", active: "active" };

const PROC_COOLDOWN = "ProcCooldown";
const ABILITY_COOLDOWN = "AbilityCooldown";

type RawBlock = { description: string | null; elevated: Raw[]; important: Raw[]; properties: Raw[] };

function rawBlock(attributes: GameAssetSectionAttributes, properties: Record<string, GameAssetProperty>): RawBlock {
    const named = (list: NamedProperty[] | undefined) =>
        present((list ?? []).map((entry) => rawProperty(nameOf(entry), properties)));
    const important = [
        ...(attributes.important_properties ?? []),
        ...(attributes.important_properties_with_icon ?? []),
    ];
    return {
        description: gameMarkup(attributes.loc_string),
        elevated: named(attributes.elevated_properties),
        important: present(
            important.map((entry) => {
                const name = nameOf(entry);
                const label = typeof entry === "string" ? null : (entry.localized_name ?? null);
                return rawProperty(name, properties) ?? statusCell(name, label, null, true);
            }),
        ),
        properties: named(attributes.properties),
    };
}

/** The game shows a section's cooldown in its header bar: a proc cooldown first, else the item's own. */
function sectionCooldown(
    kind: StatSection,
    blocks: RawBlock[],
    properties: Record<string, GameAssetProperty>,
): number | null {
    const shown = (raw: Raw) => (raw.disableValue === raw.value ? null : raw.value);
    const named = (key: string) => blocks.flatMap((b) => b.properties).find((p) => p.key === key);
    const proc = named(PROC_COOLDOWN);
    const own = named(ABILITY_COOLDOWN);
    let cooldown: number | null = null;
    if (proc) cooldown = shown(proc);
    else if (own) cooldown = shown(own);
    else if (kind === "active") {
        const raw = rawProperty(ABILITY_COOLDOWN, properties);
        cooldown = raw ? shown(raw) : null;
    }
    for (const block of blocks) {
        block.properties = block.properties.filter((p) => p.key !== PROC_COOLDOWN && p.key !== ABILITY_COOLDOWN);
    }
    return cooldown === 0 ? null : cooldown;
}

function shownProperty(raw: Raw): TooltipProperty | null {
    if (!raw.statusEffect && !(raw.value !== null && shows(raw, raw.value))) return null;
    return labelled(raw, raw.value);
}

/** An item's tooltip sections in the game's order, and the condition its bonus needs, if it has one. */
export function itemTooltip(item: GameAssetItem): { sections: TooltipSection[]; condition?: string } {
    const properties = item.properties ?? {};
    const values = numericValues(properties);
    const sections = (item.tooltip_sections ?? []).flatMap((section): TooltipSection[] => {
        // The game titles a section with no type "Passive".
        const kind = section.section_type === undefined ? "passive" : SECTION_KINDS[section.section_type];
        if (!kind) return [];
        const raw = (section.section_attributes ?? []).map((attributes) => rawBlock(attributes, properties));
        const cooldown = sectionCooldown(kind, raw, properties);
        const blocks = raw.map((block): TooltipBlock => ({
            description: block.description,
            values: placeholderValues(block.description, (n) => values.get(n)),
            elevated: present(block.elevated.map(shownProperty)),
            important: present(block.important.map(shownProperty)),
            properties: present(block.properties.map(shownProperty)),
        }));
        return blocks.length > 0 ? [{ kind, cooldown, blocks }] : [];
    });
    const shownNames = (item.tooltip_sections ?? []).flatMap((section) =>
        (section.section_attributes ?? []).flatMap((a) =>
            [
                ...(a.elevated_properties ?? []),
                ...(a.important_properties ?? []),
                ...(a.important_properties_with_icon ?? []),
                ...(a.properties ?? []),
            ].map(nameOf),
        ),
    );
    const condition = shownNames.map((name) => properties[name]?.conditional).find((c) => !!c);
    return condition ? { sections, condition } : { sections };
}

/**
 * The public icon of every property icon class, status effect and inline keyword the assets name, sorted by class.
 * Only files in `available` are given: the items asset also names images the host does not have. The asset has no
 * wash colours, so the icons draw as they are.
 */
export function propertyIconArt(items: readonly GameAssetItem[], available: ReadonlySet<string>): PropertyIconArt[] {
    const paths = new Map<string, string>();
    const add = (cls: string | undefined, path: string | undefined) => {
        if (cls && path && available.has(path) && !paths.has(cls)) paths.set(cls, path);
    };
    const inline = /<img\b[^>]*\bsrc="([^"]+)"[^>]*\bclass="inline-attribute ([A-Za-z0-9_]+)"/g;
    const markup = (text: string | null | undefined) => {
        for (const [, src, keyword] of (text ?? "").matchAll(inline)) add(keyword, src);
    };
    for (const item of [...items].sort((a, b) => a.id - b.id)) {
        for (const p of Object.values(item.properties ?? {})) add(p.css_class, p.icon);
        for (const section of item.tooltip_details?.info_sections ?? []) {
            markup(section.loc_string);
            for (const block of section.properties_block ?? []) {
                for (const cell of block.properties ?? []) add(cell.important_property, cell.important_property_icon);
            }
        }
        for (const section of item.tooltip_sections ?? []) {
            for (const attributes of section.section_attributes ?? []) {
                markup(attributes.loc_string);
                for (const entry of attributes.important_properties_with_icon ?? []) {
                    if (typeof entry !== "string") add(entry.name, entry.icon);
                }
            }
        }
        for (const text of Object.values(item.description ?? {})) markup(text);
    }
    return [...paths]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([cls, path]) => ({ class: cls, path, wash: null, color: null }));
}

const numbers = (table: Record<string, unknown> | undefined): Record<string, number> =>
    Object.fromEntries(Object.entries(table ?? {}).filter((e): e is [string, number] => typeof e[1] === "number"));

/** A hero's starting stats, level gains, slot investment and primary weapon bullet damage; null for no such hero. */
export function heroStats(
    heroes: readonly GameAssetHero[],
    items: readonly GameAssetItem[],
    heroId: unknown,
): HeroStatsData | null {
    const hero = heroes.find((h) => h.id === heroId);
    if (!hero) return null;
    const base: Record<string, number> = {};
    for (const stat of Object.values(hero.starting_stats ?? {})) {
        if (stat.display_stat_name && typeof stat.value === "number") base[stat.display_stat_name] = stat.value;
    }
    const tiers = (slot: "weapon" | "spirit" | "vitality"): InvestmentTier[] =>
        (hero.cost_bonuses?.[slot] ?? [])
            .map((t) => ({ souls: t.gold_threshold, bonus: t.bonus, percentOnGraph: t.percent_on_graph ?? 0 }))
            .sort((a, b) => a.souls - b.souls);
    const weapon = items.find((item) => item.class_name === hero.items?.weapon_primary);
    return {
        heroId: hero.id,
        base,
        perLevel: numbers(hero.standard_level_up_upgrades),
        investment: { weapon: tiers("weapon"), spirit: tiers("spirit"), vitality: tiers("vitality") },
        bulletDamage: weapon?.weapon_info?.bullet_damage ?? null,
    };
}

/** The game's English text for every token game-ui reads (`citadel_main` and `citadel_attributes`). */
const ENGLISH_UI_STRINGS: GameUiStrings = {
    Citadel_Mod_Tooltip_Passive: "Passive",
    Citadel_Mod_Tooltip_Active: "Active",
    Citadel_Shop_Purchased: "Owned",
    Citadel_Shop_AbilityIsImbuing: "Imbued upon {s:imbued_ability_name}",
    Citadel_Shop_AbilityIsImbued: "Imbued by {s:imbuing_ability_name}",
    Citadel_ComponentRequired: "Upgrades From:",
    Citadel_IsComponentOf: "Upgrades To:",
    Citadel_ComponentUseIn: "Currently Used in:",
    Citadel_PopularityLabel_Early: "Purchased early game in {d:popular_pct}% of matches.",
    Citadel_PopularityLabel_Mid: "Purchased mid game in {d:popular_pct}% of matches.",
    Citadel_PopularityLabel_Late: "Purchased late game in {d:popular_pct}% of matches.",
    Citadel_Shop_ConditionalAttribute: "Conditional",
    Citadel_ItemViewImpact: "See Details",
    Citadel_HeroBuilds_AP_Next_Indicator: "Recommended",
    Citadel_StatusEffect: "Status Effect",
    StatDesc_BulletDamage: "Bullet Damage",
    StatDesc_LightMeleeDamage: "Light Melee",
    StatDesc_HeavyMeleeDamage: "Heavy Melee",
    StatDesc_MaxHealth: "Max Health",
    StatDesc_TechPower: "Spirit Power",
};

/** The demo game is installed in English only; other languages get the app's own labels, as a missing token does. */
export function gameUiStrings(locale: unknown): GameUiStrings {
    const english = locale === "english" || (typeof locale === "string" && /^en(-|$)/.test(locale));
    return english ? { ...ENGLISH_UI_STRINGS } : {};
}
