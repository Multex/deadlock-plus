import { command } from "$lib/core/tauri";
import type { HeroAbilities } from "@deadlock-plus/ipc-types/HeroAbilities";
import type { HeroProgression } from "@deadlock-plus/ipc-types/HeroProgression";
import type { PopularItems } from "@deadlock-plus/ipc-types/PopularItems";
import type { ShopItem } from "@deadlock-plus/ipc-types/ShopItem";

/** Every shop item in the installed game, disabled ones included. Empty while the game cannot be read. */
export function loadShopItems(): Promise<ShopItem[]> {
    return command<ShopItem[]>("game_shop_items").catch((): ShopItem[] => []);
}

/** The installed game's level table. No levels while the game cannot be read. */
export function loadHeroProgression(): Promise<HeroProgression> {
    return command<HeroProgression>("game_hero_progression").catch((): HeroProgression => ({ levels: [] }));
}

/** Each hero's four ability ids from the installed game, the ultimate last. */
export function loadHeroAbilities(): Promise<HeroAbilities[]> {
    return command<HeroAbilities[]>("game_hero_abilities").catch((): HeroAbilities[] => []);
}

/** The popular items the installed game ships for a hero; null for unreleased heroes or an unreadable game. */
export function loadPopularItems(heroId: number): Promise<PopularItems | null> {
    return command<PopularItems | null>("game_popular_items", { heroId }).catch(() => null);
}
