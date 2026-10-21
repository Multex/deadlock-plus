import { getContext, setContext } from "svelte";
import type { ShopCatalog } from "../../catalog";
import type { HeroPopularity } from "../../editor/popularity.svelte";
import type { ChipItem } from "../../shop-view";

/** A chip that knows its catalog id, so hovering it can show the item's tooltip. */
export type TooltipChip = ChipItem & { id?: number };

export interface ItemTooltipSource {
    catalog: ShopCatalog;
    popularity?: HeroPopularity | null;
}

const KEY = Symbol("item-tooltips");

/** Every item chip below this component shows the game-style tooltip on hover. Call during component init. */
export function provideItemTooltips(source: () => ItemTooltipSource | null): void {
    setContext(KEY, source);
}

export function itemTooltipSource(): () => ItemTooltipSource | null {
    return getContext<(() => ItemTooltipSource | null) | undefined>(KEY) ?? (() => null);
}
