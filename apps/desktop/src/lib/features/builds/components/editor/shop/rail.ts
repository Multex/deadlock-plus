import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import { Cross, Crosshair, Search, Sparkles, ThumbsUp } from "@lucide/svelte";
import type { Component } from "svelte";
import type { ItemMatcher, ShopCatalog, ShopItem, ShopSlot } from "../../../catalog";
import { addCategory, addItems } from "../../../editor/document";
import {
    GRID_SLOTS,
    inCategories,
    itemFilters,
    searchHits,
    shopGrid,
    type FilterCategory,
    type GridRow,
} from "../../../editor/picker";
import type { GamePopular, Phase } from "../../../editor/popularity";

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

export const RAIL_ICONS: Readonly<Record<RailTab, Component>> = {
    popular: ThumbsUp,
    weapon: Crosshair,
    vitality: Cross,
    spirit: Sparkles,
    search: Search,
};

export interface FlyoutRow extends GridRow {
    key: string;
}

export interface FlyoutView {
    query: string;
    /** Popular tab only: one phase, or null for every phase like the game's page. */
    phase: Phase | null;
    /** Search tab only. */
    categories: ReadonlySet<FilterCategory>;
    /** The game's computed `EShopFilter` tags of an item, when known. */
    filtersOf?: (item: ShopItem) => readonly string[];
}

const keyed = (rows: GridRow[]): FlyoutRow[] => rows.map((row) => ({ ...row, key: `tier-${row.tier}` }));

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

/** The hero's Popular page: the game's tier rows of Weapon, Spirit and Vitality, optionally one phase only. */
export function popularRows(
    catalog: ShopCatalog,
    game: ReadonlyMap<number, readonly GamePopular[]>,
    phase: Phase | null,
): FlyoutRow[] {
    return keyed(
        shopGrid(catalog, GRID_SLOTS, (item) => {
            const listed = game.get(item.id);
            return listed !== undefined && (phase === null ? listed.length > 0 : listed.some((p) => p.phase === phase));
        }),
    );
}

export function flyoutRows(
    catalog: ShopCatalog,
    tab: RailTab,
    view: FlyoutView,
    game: ReadonlyMap<number, readonly GamePopular[]>,
    matchers?: readonly ItemMatcher[],
): FlyoutRow[] {
    if (tab === "popular") return popularRows(catalog, game, view.phase);
    if (tab === "search") {
        const hits = searchHits(catalog, view.query, matchers);
        return keyed(
            shopGrid(
                catalog,
                GRID_SLOTS,
                (item) =>
                    (hits === null || hits.has(item.id)) &&
                    inCategories(itemFilters(item, view.filtersOf?.(item)), view.categories),
            ),
        );
    }
    return keyed(shopGrid(catalog, [tab]));
}
