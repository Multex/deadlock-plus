import type { GameArt } from "@deadlock-plus/game-ui/art";
import type { HeroStats, ItemDetails, StatChange, StatGroup } from "@deadlock-plus/game-ui/hero";
import type { BuildNoteInput, ItemTooltipInput, UiText } from "@deadlock-plus/game-ui/item-tooltip/model";
import type { GameText } from "@deadlock-plus/game-ui/text";
import type { AbilityTooltip } from "@deadlock-plus/ipc-types/AbilityTooltip";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { HeroStatsData } from "@deadlock-plus/ipc-types/HeroStatsData";
import type { ModEntryView } from "@deadlock-plus/ipc-types/ModEntryView";
import { shownDecimals } from "@deadlock-plus/game-ui";
import { getContext, setContext } from "svelte";
import { abilityChanges } from "../../ability-tooltip";
import type { HeroKit } from "../../build-detail.svelte";
import { chainCost, type ShopCatalog } from "../../catalog";
import { readSteps } from "../../editor/ability-order";
import { levelAt, placeItems } from "../../editor/timeline";
import { phaseStatsFor, type PhaseStats } from "../../editor/popularity";
import type { HeroPopularity } from "../../editor/popularity.svelte";
import { itemTooltipInput, popularityFor, type TooltipCatalog } from "../../game-item";
import { heroStatsAt, itemDetails, type AbilityGroupsOf, type GroupsOf } from "../../hero-stats";
import { heroStatsAtNetWorth } from "../../hero-timeline";
import { itemsStillOwned } from "../../stats";

export interface ItemTipSource {
    catalog: ShopCatalog;
    popularity?: HeroPopularity | null;
    /** The build the tooltips belong to: they show the hero at each item's point in it and the item's notes. */
    build?: BuildView | null;
    /** The build hero's abilities (for imbue notes) and level table. */
    kit?: HeroKit | null;
}

const KEY = Symbol("item-tips");

/** Every item card below this component shows the game's item tooltip on hover. Call during component init. */
export function provideItemTips(source: () => ItemTipSource | null): void {
    setContext(KEY, source);
}

export function itemTipSource(): () => ItemTipSource | null {
    return getContext<(() => ItemTipSource | null) | undefined>(KEY) ?? (() => null);
}

/** The game's key label for the tooltip's ALT "See Details" prompt (`ExtraInfo`). */
export const TIP_BINDINGS: Partial<Record<string, string>> = { ExtraInfo: "ALT" };

/** Per ALT row stat: the game's `citadel_attributes` name token, and the app's locale key for when it has none. */
const HERO_STAT_NAMES: Partial<Record<string, { token: string; key: string }>> = {
    EBulletDamage: { token: "StatDesc_BulletDamage", key: "builds.hero_stat.bullet_damage" },
    ETechArmorDamageReduction: { token: "StatDesc_TechArmorDamageReduction", key: "builds.hero_stat.spirit_resist" },
};

/** The name of an ALT row's hero stat; null for a stat neither the game nor the app has a name for. */
export function heroStatText(stat: string): UiText | null {
    const name = HERO_STAT_NAMES[stat];
    return name ? { key: name.key, params: {}, game: { token: name.token, params: {} } } : null;
}

export function heroStatLabel(text: GameText): (stat: string) => string {
    return (stat) => {
        const name = heroStatText(stat);
        return name ? text(name) : stat;
    };
}

/**
 * The property icon class (`GameArt.propertyIcons` key) beside a stat group. Spirit Resist takes the class items
 * give their spirit resist cells (`tech_armor_up`); the game's own pick is in its code, not its files.
 */
const HERO_STAT_ICONS: Partial<Record<string, string>> = {
    ETechArmorDamageReduction: "tech_armor_up",
};

export function heroStatIcon(art: () => GameArt): (stat: string) => string | null {
    return (stat) => {
        const cls = HERO_STAT_ICONS[stat];
        return (cls && art().propertyIcons[cls]?.url) || null;
    };
}

export type TipSide = "left" | "right";

/** The side the tooltip was placed on (its `data-side`): right unless it had to flip left for room. */
export function tipSide(placed: unknown): TipSide {
    return placed === "left" ? "left" : "right";
}

type AltTarget = Pick<EventTarget, "addEventListener" | "removeEventListener">;

const ALT_EVENTS = ["keydown", "keyup", "pointermove", "blur"] as const;

/**
 * Calls `onChange` whenever ALT goes down or up. Pointer moves catch an ALT held before the tooltip opened; losing
 * focus lets go, since the key-up then never arrives.
 *
 * The ALT key events are cancelled: on Windows an unhandled bare ALT release reaches the native window, which enters
 * menu mode and swallows pointer events until a click, so the pointer leave that closes the tooltip never arrives.
 */
export function trackAlt(target: AltTarget, onChange: (held: boolean) => void): () => void {
    let held = false;
    const listener = (event: Event) => {
        if ((event as Event & { key?: unknown }).key === "Alt") event.preventDefault();
        const now = event.type !== "blur" && (event as Event & { altKey?: unknown }).altKey === true;
        if (now === held) return;
        held = now;
        onChange(now);
    };
    for (const type of ALT_EVENTS) target.addEventListener(type, listener);
    return () => {
        for (const type of ALT_EVENTS) target.removeEventListener(type, listener);
    };
}

export interface AltWatch {
    hover(on: boolean): void;
    open(on: boolean): void;
    dispose(): void;
}

/**
 * {@link trackAlt} from the moment the pointer enters the trigger until it has left and the tooltip has closed, so a
 * bare ALT tapped during the hover delay cannot enter Windows menu mode either.
 */
export function altWatch(target: AltTarget, onChange: (held: boolean) => void): AltWatch {
    let hovered = false;
    let open = false;
    let stop: (() => void) | null = null;
    const sync = () => {
        const listening = hovered || open;
        if (listening && !stop) stop = trackAlt(target, onChange);
        else if (!listening && stop) {
            stop();
            stop = null;
            onChange(false);
        }
    };
    return {
        hover(on) {
            hovered = on;
            sync();
        },
        open(on) {
            open = on;
            sync();
        },
        dispose() {
            hovered = open = false;
            sync();
        },
    };
}

type Handler = (event: Event) => void;

/** The trigger's props with `onHover` told when the pointer enters and leaves, after the trigger's own handlers. */
export function hoverProps(props: Record<string, unknown>, onHover: (on: boolean) => void): Record<string, unknown> {
    const chain = (name: string, on: boolean): Handler => {
        const own = props[name] as Handler | undefined;
        return (event) => {
            own?.(event);
            onHover(on);
        };
    };
    return { ...props, onpointerenter: chain("onpointerenter", true), onpointerleave: chain("onpointerleave", false) };
}

export interface TipHost {
    hero: HeroStatsData | null;
    heroIcon: string | null;
    label: (stat: string) => string;
    icon: (stat: string) => string | null;
    /** The hero's weapon ability image, beside bullet damage. */
    weaponIcon?: string | null;
    position: TipSide;
    detailView: boolean;
    /** The game's hero ability tooltips, for the item's effect on the hero's abilities. */
    abilityTooltips?: ReadonlyMap<number, AbilityTooltip>;
}

type TipPopularity = Pick<HeroPopularity, "game" | "icon"> & { api: PhaseStats | null };

/** `conditionById`: each item's condition text, which the game repeats under every ALT row. */
export type TipCatalog = TooltipCatalog & { conditionById?: ReadonlyMap<number, string> };

export interface TipSourceData {
    catalog: TipCatalog;
    popularity?: TipPopularity | null;
    build?: BuildView | null;
    kit?: Pick<HeroKit, "abilities" | "levels"> | null;
}

function buildEntry(build: BuildView, id: number, at?: { category: number; index: number }): ModEntryView | null {
    if (at) return build.modCategories[at.category]?.mods[at.index] ?? null;
    for (const category of build.modCategories) {
        const mod = category.mods.find((m) => m.abilityId === id);
        if (mod) return mod;
    }
    return null;
}

function buildNote(entry: ModEntryView, kit: TipSourceData["kit"]): BuildNoteInput {
    const ability = entry.imbueTargetAbilityId === null ? undefined : kit?.abilities.get(entry.imbueTargetAbilityId);
    return {
        text: entry.annotation,
        sellPriority: entry.sellPriority,
        imbueTarget: ability ? { name: ability.name, icon: ability.art ?? null } : null,
    };
}

type TipPoint = {
    level: number;
    ownedIds: number[];
    heroStats: HeroStats | undefined;
    note: BuildNoteInput | null;
    /** Each owned imbue item's target ability, by item id. */
    imbues: ReadonlyMap<number, number>;
};

/**
 * Where in the build the tooltip stands. An item in the build's Quick Buy order stands at its purchase, owned by then;
 * any other item is bought after the whole order. Outside a build, the hero is at level 1 with nothing.
 */
function tipPoint(source: TipSourceData, id: number, hero: HeroStatsData | null): TipPoint {
    const { catalog, build, kit } = source;
    const stats = (level: number, itemIds: number[]) =>
        hero ? heroStatsAt(hero, { level, itemIds }, catalog) : undefined;
    if (!build) return { level: 1, ownedIds: [], heroStats: stats(1, []), note: null, imbues: new Map() };

    const levels = kit?.levels ?? [];
    const entries = placeItems(build, catalog.byId);
    const index = entries.findIndex((e) => e.abilityId === id);
    const placed = entries[index];
    const entry = buildEntry(build, id, placed?.ref);
    const note = entry ? buildNote(entry, kit) : null;
    const imbuesOf = (owned: typeof entries) =>
        new Map(
            owned.flatMap((e): [number, number][] => {
                const target = catalog.byId.get(e.abilityId)?.imbue ? buildEntry(build, e.abilityId, e.ref) : null;
                return target?.imbueTargetAbilityId != null ? [[e.abilityId, target.imbueTargetAbilityId]] : [];
            }),
        );
    if (placed) {
        const level = levelAt(levels, placed.netWorth) ?? 1;
        const heroStats = hero ? heroStatsAtNetWorth({ hero, entries, levels, catalog }, placed.netWorth) : undefined;
        const owned = entries.slice(0, index);
        return { level, ownedIds: owned.map((e) => e.abilityId), heroStats, note, imbues: imbuesOf(owned) };
    }
    const ownedIds = entries.map((e) => e.abilityId);
    const level = levelAt(levels, chainCost(catalog.byId, [...ownedIds, id]).total) ?? 1;
    return { level, ownedIds, heroStats: stats(level, ownedIds), note, imbues: imbuesOf(entries) };
}

/** Each ability's highest tier the build has trained by `level`; 0 for one it has not. */
function tiersAt(source: TipSourceData, level: number): Map<number, number> {
    const tiers = new Map<number, number>();
    if (!source.build || !source.kit) return tiers;
    for (const step of readSteps(source.build.abilityOrder, source.kit.levels)) {
        if (step.level !== null && step.level <= level) {
            tiers.set(step.abilityId, Math.max(tiers.get(step.abilityId) ?? 0, step.tier));
        }
    }
    return tiers;
}

/**
 * Per hero ability in slot order, under its icon, the values the item changes; abilities with none are left out. An
 * ability is backed as imbued while an imbue item is still on it after the purchase.
 */
function abilityGroups(source: TipSourceData, host: TipHost, point: TipPoint): AbilityGroupsOf | undefined {
    const tooltips = host.abilityTooltips;
    const abilities = source.kit?.abilities;
    if (!tooltips || !abilities) return undefined;
    const tiers = tiersAt(source, point.level);
    return (heroFor) =>
        [...abilities.values()].flatMap((info): StatGroup[] => {
            const ability = tooltips.get(info.id);
            if (!ability) return [];
            const { before, after, imbued } = heroFor(info.id);
            const changes = abilityChanges(ability, tiers.get(info.id) ?? 0, before, after);
            if (changes.length === 0) return [];
            const group: StatGroup = { kind: "ability", icon: info.art ?? null, changes };
            return [imbued ? { ...group, imbued: true } : group];
        });
}

const SPIRIT_POWER = "ETechPower";

/**
 * Per owned item, under its art, the values that grow with spirit power and so change with the purchase. The game's
 * order for these groups is not known; build order is used.
 */
function itemGroups(catalog: TipCatalog, ownedIds: readonly number[]): GroupsOf {
    return (before, after) => {
        const was = before[SPIRIT_POWER] ?? 0;
        const now = after[SPIRIT_POWER] ?? 0;
        if (was === now) return [];
        return itemsStillOwned(catalog.byId, ownedIds).flatMap((id): StatGroup[] => {
            const seen = new Set<string>();
            const changes = (catalog.sectionsById.get(id) ?? [])
                .flatMap((s) => s.blocks.flatMap((b) => [...b.elevated, ...b.important, ...b.properties]))
                .flatMap((p): StatChange[] => {
                    const factor = p.scale?.stat === SPIRIT_POWER ? p.scale.factor : null;
                    if (!factor || p.value === null || seen.has(p.key)) return [];
                    seen.add(p.key);
                    return [
                        {
                            key: `item:${id}:${p.key}`,
                            label: p.label,
                            before: p.value + factor * was,
                            after: p.value + factor * now,
                            decimals: shownDecimals(p.cssClass),
                            postfix: p.unit,
                        },
                    ];
                });
            return changes.length === 0 ? [] : [{ kind: "item", icon: catalog.byId.get(id)?.art ?? null, changes }];
        });
    };
}

/**
 * Everything the tooltip for `id` draws: the hero at the tooltip's point in the build, the ALT column comparing the
 * hero before and after buying the item with deadlock-api's per-phase rates, and the build's notes on the item.
 */
export function tipInput(source: TipSourceData, id: number, host: TipHost): ItemTooltipInput | null {
    const { hero } = host;
    const popularity = source.popularity ?? null;
    const point = tipPoint(source, id, hero);
    const phases = phaseStatsFor(popularity?.api ?? null, id);
    const details: ItemDetails | null = hero
        ? itemDetails({
              hero,
              level: point.level,
              ownedIds: point.ownedIds,
              itemId: id,
              catalog: source.catalog,
              label: host.label,
              icon: host.icon,
              weaponIcon: host.weaponIcon ?? null,
              imbues: point.imbues,
              abilityGroups: abilityGroups(source, host, point),
              itemGroups: itemGroups(source.catalog, point.ownedIds),
              condition: source.catalog.conditionById?.get(id) ?? null,
              phases,
          })
        : phases.length > 0
          ? { groups: [], condition: null, phases }
          : null;
    return itemTooltipInput(source.catalog, id, {
        popularity: popularity ? popularityFor(popularity.game, popularity.icon, id) : null,
        ownedIds: point.ownedIds,
        heroStats: point.heroStats,
        heroIcon: host.heroIcon,
        position: host.position,
        hasDetails: details !== null && (details.groups.length > 0 || details.phases.length > 0),
        detailView: host.detailView,
        details,
        buildNote: point.note,
    });
}
