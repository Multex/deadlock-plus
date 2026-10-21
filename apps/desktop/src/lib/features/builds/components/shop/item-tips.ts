import { getContext, setContext } from "svelte";
import type { ShopCatalog } from "../../catalog";
import type { HeroPopularity } from "../../editor/popularity.svelte";

export interface ItemTipSource {
    catalog: ShopCatalog;
    popularity?: HeroPopularity | null;
}

const KEY = Symbol("item-tips");

/** Every item card below this component shows the game's item tooltip on hover. Call during component init. */
export function provideItemTips(source: () => ItemTipSource | null): void {
    setContext(KEY, source);
}

export function itemTipSource(): () => ItemTipSource | null {
    return getContext<(() => ItemTipSource | null) | undefined>(KEY) ?? (() => null);
}
