import type { ItemStat } from "@deadlock-plus/ipc-types/ItemStat";
import { isInShop, type ShopItem, type ShopSlot, type ShopTier } from "../../catalog";
import type { StatsById } from "../../stats";

export interface TooltipItemRef {
    id: number;
    name: string;
    slot: ShopSlot;
    tier: ShopTier;
    art?: string;
}

export interface TooltipCooldown {
    section: "passive" | "active";
    value: number;
    unit: string | null;
}

export interface ItemTooltipModel extends TooltipItemRef {
    cost: number;
    /** An active item (the game's round art), not the active stat section. */
    isActive: boolean;
    imbue: boolean;
    innate: ItemStat[];
    passive: ItemStat[];
    active: ItemStat[];
    cooldown: TooltipCooldown | null;
    upgradesTo: TooltipItemRef[];
    builtFrom: TooltipItemRef[];
}

const COOLDOWN_KEY = "AbilityCooldown";

const ref = (item: ShopItem): TooltipItemRef => ({
    id: item.id,
    name: item.name,
    slot: item.slot,
    tier: item.tier,
    ...(item.art !== undefined && { art: item.art }),
});

const upgradeIndexes = new WeakMap<ReadonlyMap<number, ShopItem>, Map<number, ShopItem[]>>();

/** Shop items that list each item as a component, cheapest first; built once per catalog. */
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

/** What the game's item tooltip shows for `id`; null when the catalog does not know it. */
export function itemTooltip(
    byId: ReadonlyMap<number, ShopItem>,
    statsById: StatsById,
    id: number,
): ItemTooltipModel | null {
    const item = byId.get(id);
    if (!item) return null;
    const innate: ItemStat[] = [];
    const passive: ItemStat[] = [];
    const active: ItemStat[] = [];
    let cooldown: TooltipCooldown | null = null;
    for (const stat of statsById.get(id) ?? []) {
        if (stat.key === COOLDOWN_KEY && (stat.section === "active" || stat.section === "passive")) {
            cooldown ??= { section: stat.section, value: stat.value, unit: stat.unit };
            continue;
        }
        if (stat.section === "passive") passive.push(stat);
        else if (stat.section === "active") active.push(stat);
        else innate.push(stat);
    }
    return {
        ...ref(item),
        cost: item.cost,
        isActive: item.active,
        imbue: item.imbue ?? false,
        innate,
        passive,
        active,
        cooldown,
        upgradesTo: (upgradeIndex(byId).get(id) ?? []).map(ref),
        builtFrom: item.componentIds.flatMap((c) => {
            const component = byId.get(c);
            return component ? [ref(component)] : [];
        }),
    };
}

/** `+30%` for an innate bonus; passive and active numbers (durations, radii) carry no plus. */
export function statText(
    value: number,
    unit: string | null,
    signed: boolean,
    format: (n: number) => string = String,
): string {
    const sign = signed && value > 0 ? "+" : value < 0 ? "-" : "";
    return `${sign}${format(Math.abs(value))}${unit ?? ""}`;
}

const ROMAN = ["I", "II", "III", "IV"] as const;

export function romanTier(tier: ShopTier): string {
    return ROMAN[tier - 1];
}
