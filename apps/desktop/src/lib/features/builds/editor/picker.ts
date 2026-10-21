import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import {
    searchItems,
    SHOP_SLOTS,
    SHOP_TIERS,
    type ItemMatcher,
    type ShopCatalog,
    type ShopItem,
    type ShopSlot,
    type ShopTier,
} from "../catalog";
import { statLabelMatchers } from "../stats";
import { occurrences } from "./document";

/** A tier row while browsing; one row with no tier while searching, since ranking beats tier order. */
export interface PickerRow {
    tier: ShopTier | null;
    price: number | null;
    items: ShopItem[];
}

export interface PickerGroup {
    slot: ShopSlot;
    rows: PickerRow[];
}

/** The price most items of a tier have; every tier is one price in the game, so this is that price. */
function tierPrice(catalog: ShopCatalog, tier: ShopTier): number | null {
    const counts = new Map<number, number>();
    for (const item of catalog.byId.values()) {
        if (item.tier === tier) counts.set(item.cost, (counts.get(item.cost) ?? 0) + 1);
    }
    let best: number | null = null;
    let most = 0;
    for (const [cost, count] of counts) {
        if (count > most) {
            best = cost;
            most = count;
        }
    }
    return best;
}

/**
 * The picker's contents: `slot`'s tier rows while `query` is empty, else hits from every slot in the
 * shop search's order, grouped by slot. Slots without a hit are left out.
 */
export function pickerGroups(
    catalog: ShopCatalog,
    slot: ShopSlot,
    query: string,
    matchers: readonly ItemMatcher[] = statLabelMatchers(catalog.statsById),
): PickerGroup[] {
    const shop = catalog.itemsBySlotTier();
    if (query.trim() === "") {
        return [
            {
                slot,
                rows: SHOP_TIERS.map((tier) => ({ tier, price: tierPrice(catalog, tier), items: shop[slot][tier] })),
            },
        ];
    }
    const all = SHOP_SLOTS.flatMap((s) => SHOP_TIERS.flatMap((tier) => shop[s][tier]));
    const hits = searchItems(all, query, matchers);
    return SHOP_SLOTS.flatMap((s) => {
        const items = hits.filter((i) => i.slot === s);
        return items.length > 0 ? [{ slot: s, rows: [{ tier: null, price: null, items }] }] : [];
    });
}

/**
 * Each tier row ordered by `score` (pick %), highest first; items without a score keep shop order after
 * the scored ones. Search hits keep the search ranking.
 */
export function sortByPopularity(
    groups: readonly PickerGroup[],
    score: (itemId: number) => number | undefined,
): PickerGroup[] {
    return groups.map((group) => ({
        slot: group.slot,
        rows: group.rows.map((row) => {
            if (row.tier === null) return row;
            const ranked = row.items.map((item, order) => ({ item, order, score: score(item.id) ?? -1 }));
            ranked.sort((a, b) => b.score - a.score || a.order - b.order);
            return { ...row, items: ranked.map((r) => r.item) };
        }),
    }));
}

export function inBuildCounts(build: BuildView): Map<number, number> {
    return occurrences(build);
}

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export type ArrowKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

/**
 * The card an arrow key moves to from `rects[from]`. Left and right step in reading order; up and down
 * go to the closest card on the nearest wrapped line above or below. Stays put at an edge.
 */
export function nearestCard(rects: readonly Rect[], from: number, key: ArrowKey): number {
    if (key === "ArrowLeft") return Math.max(0, from - 1);
    if (key === "ArrowRight") return Math.min(rects.length - 1, from + 1);
    const current = rects[from];
    if (current === undefined) return from;
    const half = current.height / 2;
    const down = key === "ArrowDown";
    const beyond = rects
        .map((rect, index) => ({ rect, index }))
        .filter(({ rect }) => (down ? rect.y >= current.y + half : rect.y <= current.y - half));
    if (beyond.length === 0) return from;
    const lineY = down ? Math.min(...beyond.map((c) => c.rect.y)) : Math.max(...beyond.map((c) => c.rect.y));
    const centre = (r: Rect) => r.x + r.width / 2;
    let best = beyond[0]!;
    let bestDistance = Infinity;
    for (const candidate of beyond) {
        if (Math.abs(candidate.rect.y - lineY) >= half) continue;
        const distance = Math.abs(centre(candidate.rect) - centre(current));
        if (distance < bestDistance) {
            best = candidate;
            bestDistance = distance;
        }
    }
    return best.index;
}
