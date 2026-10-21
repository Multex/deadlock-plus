import type { ItemStat } from "@deadlock-plus/ipc-types/ItemStat";
import type { ItemStats } from "@deadlock-plus/ipc-types/ItemStats";
import { consumeComponents, type ItemMatcher, type ShopItem } from "./catalog";

export type StatsById = ReadonlyMap<number, readonly ItemStat[]>;

export interface StatTotal {
    provides: string;
    label: string;
    unit: string | null;
    total: number;
}

export function statsByItem(list: readonly ItemStats[]): Map<number, readonly ItemStat[]> {
    return new Map(list.map((i) => [i.itemId, i.stats]));
}

/** Lowercase, accent-free text, so search matches names and stat labels alike. */
export function normaliseSearchText(text: string): string {
    return text
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .trim();
}

/** The items of `order` still owned at the end, once each upgrade has used up its components. */
function itemsStillOwned(byId: ReadonlyMap<number, ShopItem>, order: readonly number[]): number[] {
    const owned: { id: number; at: number }[] = [];
    const take = (id: number) => {
        const at = owned.findIndex((o) => o.id === id);
        if (at === -1) return false;
        owned.splice(at, 1);
        return true;
    };
    order.forEach((id, at) => {
        const item = byId.get(id);
        if (item !== undefined) consumeComponents(byId, item, take);
        owned.push({ id, at });
    });
    return owned.map((o) => o.id);
}

/**
 * The always-on stats of the items still owned after buying `itemIds` in order, summed by what they
 * provide, so different keys that grant the same thing (TechPower, BonusSpirit) add up. Conditional,
 * active and imbue stats are left out.
 */
export function statsSoFar(
    itemIds: readonly number[],
    statsById: StatsById,
    byId: ReadonlyMap<number, ShopItem>,
): StatTotal[] {
    const groups = new Map<string, StatTotal>();
    for (const id of itemsStillOwned(byId, itemIds)) {
        for (const stat of statsById.get(id) ?? []) {
            if (!stat.flat || stat.provides === null) continue;
            const key = `${stat.provides}\u0000${stat.unit ?? ""}`;
            const group = groups.get(key);
            if (group) group.total += stat.value;
            else groups.set(key, { provides: stat.provides, label: stat.label, unit: stat.unit, total: stat.value });
        }
    }
    // Game values like 0.1 and 0.2 would otherwise sum to 0.30000000000000004.
    return [...groups.values()].map((g) => ({ ...g, total: Math.round(g.total * 1e4) / 1e4 }));
}

/** A `searchItems` matcher that finds an item by any stat label it shows. */
export function statLabelMatchers(statsById: StatsById): ItemMatcher[] {
    const labels = new Map([...statsById].map(([id, stats]) => [id, stats.map((s) => normaliseSearchText(s.label))]));
    return [(item, query) => labels.get(item.id)?.some((label) => label.includes(query)) ?? false];
}
