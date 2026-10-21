import { deadlockApi } from "$lib/core/deadlock-api";
import { command } from "$lib/core/tauri";
import { loadItemArt } from "$lib/features/gamedata/gamedata";
import type { ItemEntry } from "@deadlock-plus/ipc-types/ItemEntry";

export type ShopSlot = "weapon" | "vitality" | "spirit";
export type ShopTier = 1 | 2 | 3 | 4;

export const SHOP_SLOTS: readonly ShopSlot[] = ["weapon", "vitality", "spirit"];
export const SHOP_TIERS: readonly ShopTier[] = [1, 2, 3, 4];

export interface ShopItem {
    id: number;
    className: string;
    name: string;
    slot: ShopSlot;
    tier: ShopTier;
    cost: number;
    active: boolean;
    componentIds: number[];
    shopable: boolean;
    disabled: boolean;
    art?: string;
}

/** The per-item facts the game files do not give us yet. */
export interface ShopMetadata {
    id: number;
    className: string;
    name: string;
    slot: ShopSlot;
    tier: ShopTier;
    cost: number;
    active: boolean;
    shopable: boolean;
    disabled: boolean;
    componentIds: number[];
    image?: string;
}

export type ItemsBySlotTier = Record<ShopSlot, Record<ShopTier, ShopItem[]>>;

export interface ShopCatalog {
    /** Every known item, shop or not, so an item a build holds but the shop dropped can be flagged. */
    byId: ReadonlyMap<number, ShopItem>;
    /** Shopable, non-disabled items only. */
    itemsBySlotTier(): ItemsBySlotTier;
}

const SLOTS = new Set<string>(SHOP_SLOTS);

/**
 * Slot, tier, cost, active flag and components come from the Deadlock API until the Tauri game-files
 * command exposes them; this is the only function that knows the source.
 * Tier 5 rows are unreleased items priced 9999 and are left out.
 */
export async function shopMetadata(): Promise<ShopMetadata[]> {
    const rows = (await deadlockApi.items()).filter(
        (i) =>
            i.type === "upgrade" &&
            i.item_slot_type !== undefined &&
            SLOTS.has(i.item_slot_type) &&
            i.item_tier !== undefined &&
            i.item_tier >= 1 &&
            i.item_tier <= 4,
    );
    const idByClass = new Map(rows.map((i) => [i.class_name, i.id]));
    return rows.map((i) => ({
        id: i.id,
        className: i.class_name,
        name: i.name,
        slot: i.item_slot_type as ShopSlot,
        tier: i.item_tier as ShopTier,
        cost: i.cost ?? 0,
        active: i.is_active_item ?? false,
        shopable: i.shopable ?? false,
        disabled: i.disabled ?? false,
        componentIds: (i.component_items ?? []).flatMap((c) => idByClass.get(c) ?? []),
        image: i.shop_image_webp,
    }));
}

const isInShop = (i: ShopItem) => i.shopable && !i.disabled;

export function buildShopCatalog(
    entries: readonly ItemEntry[],
    metadata: readonly ShopMetadata[],
    art: Readonly<Record<string, string>>,
): ShopCatalog {
    const localised = new Map(entries.filter((e) => e.localised).map((e) => [e.id, e.name]));
    const byId = new Map<number, ShopItem>();
    for (const m of metadata) {
        const item: ShopItem = {
            id: m.id,
            className: m.className,
            name: localised.get(m.id) ?? m.name,
            slot: m.slot,
            tier: m.tier,
            cost: m.cost,
            active: m.active,
            componentIds: m.componentIds,
            shopable: m.shopable,
            disabled: m.disabled,
        };
        const src = art[m.className] ?? m.image;
        if (src !== undefined) item.art = src;
        byId.set(m.id, item);
    }
    return {
        byId,
        itemsBySlotTier() {
            const out = {} as ItemsBySlotTier;
            for (const slot of SHOP_SLOTS) out[slot] = { 1: [], 2: [], 3: [], 4: [] };
            for (const item of byId.values()) if (isInShop(item)) out[item.slot][item.tier].push(item);
            for (const slot of SHOP_SLOTS) {
                for (const tier of SHOP_TIERS) {
                    out[slot][tier].sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
                }
            }
            return out;
        },
    };
}

export async function loadShopCatalog(locale: string): Promise<ShopCatalog> {
    const [metadata, entries] = await Promise.all([
        shopMetadata(),
        command<ItemEntry[]>("game_items", { locale }).catch((): ItemEntry[] => []),
    ]);
    const art = await loadItemArt(
        metadata.filter((m) => m.shopable && !m.disabled).map((m) => m.className),
        "shop",
    );
    return buildShopCatalog(entries, metadata, art);
}

export interface ChainCost {
    total: number;
    /** What each purchase costs, in build order. */
    costs: number[];
}

/**
 * Souls to buy `order` one item after another. Owning a component discounts the upgrade by that
 * component's full price, and the component is used up. A missing component is bought with the
 * upgrade, so only owned parts further down its chain discount it.
 */
export function chainCost(byId: ReadonlyMap<number, ShopItem>, order: readonly number[]): ChainCost {
    const owned = new Set<number>();

    const discount = (item: ShopItem, seen: Set<number>): number => {
        let total = 0;
        for (const componentId of item.componentIds) {
            if (seen.has(componentId)) continue;
            seen.add(componentId);
            const component = byId.get(componentId);
            if (owned.delete(componentId)) total += component?.cost ?? 0;
            else if (component !== undefined) total += discount(component, seen);
        }
        return total;
    };

    const costs = order.map((id) => {
        const item = byId.get(id);
        if (item === undefined) return 0;
        const cost = Math.max(0, item.cost - discount(item, new Set([id])));
        owned.add(id);
        return cost;
    });
    return { total: costs.reduce((sum, c) => sum + c, 0), costs };
}

/** Extra reason an item matches a query, such as a stat it grants. */
export type ItemMatcher = (item: ShopItem, normalizedQuery: string) => boolean;

function normalise(text: string): string {
    return text
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .trim();
}

export function searchItems(
    items: readonly ShopItem[],
    query: string,
    matchers: readonly ItemMatcher[] = [],
): ShopItem[] {
    const q = normalise(query);
    if (q === "") return [...items];
    const prefix: ShopItem[] = [];
    const rest: ShopItem[] = [];
    for (const item of items) {
        const name = normalise(item.name);
        if (name.startsWith(q)) prefix.push(item);
        else if (name.includes(q) || matchers.some((m) => m(item, q))) rest.push(item);
    }
    return [...prefix, ...rest];
}
