import { command, fileSrc } from "$lib/core/tauri";
import type { BuildTag } from "@deadlock-plus/ipc-types/BuildTag";
import type { HeroAbilities } from "@deadlock-plus/ipc-types/HeroAbilities";
import type { HeroProgression } from "@deadlock-plus/ipc-types/HeroProgression";
import type { ItemStats } from "@deadlock-plus/ipc-types/ItemStats";
import type { PopularItems } from "@deadlock-plus/ipc-types/PopularItems";
import type { ShopItem } from "@deadlock-plus/ipc-types/ShopItem";
import type { ShopUiArt } from "@deadlock-plus/ipc-types/ShopUiArt";
import type { ShopUiImage } from "@deadlock-plus/ipc-types/ShopUiImage";

/** Every shop item in the installed game, disabled ones included. Empty while the game cannot be read. */
export function loadShopItems(): Promise<ShopItem[]> {
    return command<ShopItem[]>("game_shop_items").catch((): ShopItem[] => []);
}

/** The stats each item shows in its shop tooltip, labelled in `locale`. Empty while the game cannot be read. */
export function loadItemStats(locale: string): Promise<ItemStats[]> {
    return command<ItemStats[]>("game_item_stats", { locale }).catch((): ItemStats[] => []);
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

/**
 * The game's standard build tags, named in `locale` with English filling gaps; `icon` is the tag picker's
 * icon as an asset url, absent when the game has none. Empty while the game cannot be read.
 */
export async function loadBuildTags(locale: string): Promise<BuildTag[]> {
    try {
        const tags = await command<BuildTag[]>("game_build_tags", { locale });
        return tags.map((tag) => (tag.icon ? { ...tag, icon: fileSrc(tag.icon) } : tag));
    } catch {
        return [];
    }
}

/** Asset urls of the game's shop UI images, keyed by name. Images the game does not have are absent. */
export async function loadShopUiArt(): Promise<Partial<Record<ShopUiImage, string>>> {
    const out: Partial<Record<ShopUiImage, string>> = {};
    try {
        for (const art of await command<ShopUiArt[]>("game_shop_ui_art")) out[art.image] = fileSrc(art.path);
    } catch {
        // No local art: callers draw the cards with plain CSS.
    }
    return out;
}
