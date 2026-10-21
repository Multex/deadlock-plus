import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { ItemMatcher, ShopCatalog, ShopItem, ShopSlot, ShopTier } from "../../../catalog";
import { addCategory, addItems } from "../../../editor/document";
import { pickerGroups } from "../../../editor/picker";
import { PHASES, type GamePopular, type Phase } from "../../../editor/popularity";

export type RailTab = "popular" | ShopSlot | "search";

export const RAIL_TABS: readonly RailTab[] = ["popular", "weapon", "vitality", "spirit", "search"];

/** The game's tab colours: slot tabs match the item cards, Popular is its red-orange, Search its grey "All" tab. */
export const RAIL_COLORS: Readonly<Record<RailTab, string>> = {
    popular: "#e2603f",
    weapon: "#ec9719",
    vitality: "#7bba1d",
    spirit: "#ce90ff",
    search: "#8b9098",
};

export type FlyoutHeading =
    | { kind: "tier"; tier: ShopTier; price: number | null }
    | { kind: "phase"; phase: Phase }
    | { kind: "slot"; slot: ShopSlot };

export interface FlyoutRow {
    key: string;
    heading: FlyoutHeading;
    items: ShopItem[];
}

/** Appends to the active category, else the last one, else a new one. */
export function addToTarget(build: BuildView, active: number | null, abilityIds: readonly number[]): BuildView {
    const count = build.modCategories.length;
    if (count === 0) return addItems(addCategory(build, 0, ""), 0, 0, abilityIds);
    const target = active !== null && active >= 0 && active < count ? active : count - 1;
    return addItems(build, target, build.modCategories[target]!.mods.length, abilityIds);
}

export function toggleTab(open: RailTab | null, tab: RailTab): RailTab | null {
    return open === tab ? null : tab;
}

/** The hero's Popular page: one row per phase, highest pick % first. */
export function popularRows(catalog: ShopCatalog, game: ReadonlyMap<number, readonly GamePopular[]>): FlyoutRow[] {
    return PHASES.flatMap((phase) => {
        const picks: { item: ShopItem; pct: number }[] = [];
        for (const [id, phases] of game) {
            const item = catalog.byId.get(id);
            const entry = phases.find((p) => p.phase === phase);
            if (item && !item.disabled && entry) picks.push({ item, pct: entry.pickPct });
        }
        picks.sort((a, b) => b.pct - a.pct);
        return picks.length > 0
            ? [{ key: `phase-${phase}`, heading: { kind: "phase", phase } as const, items: picks.map((p) => p.item) }]
            : [];
    });
}

export function flyoutRows(
    catalog: ShopCatalog,
    tab: RailTab,
    query: string,
    game: ReadonlyMap<number, readonly GamePopular[]>,
    matchers?: readonly ItemMatcher[],
): FlyoutRow[] {
    if (tab === "popular") return popularRows(catalog, game);
    if (tab === "search") {
        if (query.trim() === "") return [];
        return pickerGroups(catalog, "weapon", query, matchers).map((group) => ({
            key: `slot-${group.slot}`,
            heading: { kind: "slot", slot: group.slot },
            items: group.rows.flatMap((r) => r.items),
        }));
    }
    return pickerGroups(catalog, tab, "", matchers).flatMap((group) =>
        group.rows.flatMap((row) =>
            row.tier !== null && row.items.length > 0
                ? [
                      {
                          key: `tier-${row.tier}`,
                          heading: { kind: "tier", tier: row.tier, price: row.price } as const,
                          items: row.items,
                      },
                  ]
                : [],
        ),
    );
}
