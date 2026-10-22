import type { GameItem } from "@deadlock-plus/game-ui/item";
import type { ItemTooltipInput, ItemTooltipSection } from "@deadlock-plus/game-ui/item-tooltip/model";
import type { ItemStat } from "@deadlock-plus/ipc-types/ItemStat";
import type { StatSection } from "@deadlock-plus/ipc-types/StatSection";
import { isInShop, type ShopCatalog, type ShopItem } from "./catalog";
import type { GamePopular } from "./editor/popularity";

export function gameItem(item: ShopItem): GameItem {
    const out: GameItem = {
        id: item.id,
        name: item.name,
        slot: item.slot,
        tier: item.tier,
        cost: item.cost,
        active: item.active,
        imbue: item.imbue ?? false,
    };
    if (item.art !== undefined) out.art = item.art;
    return out;
}

const upgradeIndexes = new WeakMap<ReadonlyMap<number, ShopItem>, Map<number, ShopItem[]>>();

function upgradeIndex(byId: ReadonlyMap<number, ShopItem>): Map<number, ShopItem[]> {
    let index = upgradeIndexes.get(byId);
    if (index) return index;
    index = new Map();
    for (const item of byId.values()) {
        if (!isInShop(item)) continue;
        for (const componentId of new Set(item.componentIds)) {
            const list = index.get(componentId);
            if (list) list.push(item);
            else index.set(componentId, [item]);
        }
    }
    for (const list of index.values()) list.sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
    upgradeIndexes.set(byId, index);
    return index;
}

/** Shop items built from `id`, cheapest first. */
export function upgradesTo(byId: ReadonlyMap<number, ShopItem>, id: number): readonly ShopItem[] {
    return upgradeIndex(byId).get(id) ?? [];
}

/** The components of `id` in the game's order. */
export function builtFrom(byId: ReadonlyMap<number, ShopItem>, id: number): ShopItem[] {
    return (byId.get(id)?.componentIds ?? []).flatMap((c) => byId.get(c) ?? []);
}

const COOLDOWN_KEY = "AbilityCooldown";
const SECTION_ORDER: readonly StatSection[] = ["innate", "passive", "active"];

/**
 * Tooltip sections from the flat stat list, for items the game files give no sections for (the Deadlock API
 * fallback): one block of rows per section, with the cooldown in the section's header.
 */
export function sectionsFromStats(stats: readonly ItemStat[]): ItemTooltipSection[] {
    return SECTION_ORDER.flatMap((kind): ItemTooltipSection[] => {
        const own = stats.filter((s) => (s.section ?? "innate") === kind);
        const cooldown = kind === "innate" ? undefined : own.find((s) => s.key === COOLDOWN_KEY);
        const rows = own.filter((s) => s !== cooldown);
        if (rows.length === 0 && cooldown === undefined) return [];
        const properties = rows.map((s) => ({
            key: s.key,
            value: s.value,
            unit: s.unit,
            label: s.label,
            signed: kind === "innate",
            cssClass: null,
            displayType: null,
            scale: null,
            statusEffect: false,
        }));
        return [
            {
                kind,
                cooldown: cooldown?.value ?? null,
                blocks:
                    properties.length === 0
                        ? []
                        : [{ description: null, values: {}, elevated: [], important: [], properties }],
            },
        ];
    });
}

export type ItemPopularity = NonNullable<ItemTooltipInput["popularity"]>;

/**
 * The tooltip's "Purchased <phase> game" line for an item on the hero's Popular page. The game shows one
 * line; an item listed in several phases takes the earliest.
 */
export function popularityFor(
    game: ReadonlyMap<number, readonly GamePopular[]>,
    heroIcon: string | null,
    id: number,
): ItemPopularity | null {
    const first = game.get(id)?.[0];
    return first ? { phase: first.phase, percent: first.pickPct, heroIcon } : null;
}

export type TooltipCatalog = Pick<ShopCatalog, "byId" | "statsById" | "sectionsById">;

export type TooltipExtras = Pick<
    ItemTooltipInput,
    | "popularity"
    | "ownedIds"
    | "owned"
    | "imbuedUpon"
    | "canAfford"
    | "buildNote"
    | "heroStats"
    | "heroIcon"
    | "position"
    | "hasDetails"
    | "detailView"
    | "details"
>;

/** Everything `itemTooltipModel` needs for `id`; null when the catalog does not know the item. */
export function itemTooltipInput(
    catalog: TooltipCatalog,
    id: number,
    extras: TooltipExtras = {},
): ItemTooltipInput | null {
    const item = catalog.byId.get(id);
    if (!item) return null;
    return {
        ...extras,
        item: gameItem(item),
        sections: catalog.sectionsById.get(id) ?? sectionsFromStats(catalog.statsById.get(id) ?? []),
        upgradesFrom: builtFrom(catalog.byId, id).map(gameItem),
        upgradesTo: upgradesTo(catalog.byId, id).map(gameItem),
    };
}
