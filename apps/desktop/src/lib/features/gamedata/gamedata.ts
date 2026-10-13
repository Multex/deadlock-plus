import { command, fileSrc } from "$lib/core/tauri";
import type { ClassArt } from "@deadlock-plus/ipc-types/ClassArt";
import type { HeroArt } from "@deadlock-plus/ipc-types/HeroArt";
import type { ItemImage } from "@deadlock-plus/ipc-types/ItemImage";
import type { MapItemsPayload } from "@deadlock-plus/ipc-types/MapItemsPayload";
import type { MinimapIcon } from "@deadlock-plus/ipc-types/MinimapIcon";
import type { MinimapIconArt } from "@deadlock-plus/ipc-types/MinimapIconArt";
import type { MinimapArtResult } from "@deadlock-plus/ipc-types/MinimapArtResult";
import type { MinimapSource } from "@deadlock-plus/ipc-types/MinimapSource";

const BATCH = 200;

async function load(name: string, names: string[], extra: Record<string, unknown>): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (let i = 0; i < names.length; i += BATCH) {
        try {
            const found = await command<ClassArt[]>(name, { names: names.slice(i, i + BATCH), ...extra });
            for (const a of found) out[a.className] = fileSrc(a.path);
        } catch {
            // A failed batch only loses its own images; callers fall back to remote art.
        }
    }
    return out;
}

/** Asset urls of item images decoded from the installed game, keyed by class name; absent names have none. */
export function loadItemArt(names: string[], kind: ItemImage): Promise<Record<string, string>> {
    return load("game_item_art", names, { kind });
}

/** Asset urls of ability icons from the installed game. Vector-only icons have no local file and are absent. */
export function loadAbilityArt(names: string[]): Promise<Record<string, string>> {
    return load("game_ability_art", names, {});
}

/** Asset urls of the game's minimap hero heads (transparent cutouts), keyed by hero id. Heroes without one are absent. */
export async function loadHeroMinimapArt(): Promise<Record<number, string>> {
    const out: Record<number, string> = {};
    try {
        for (const hero of await command<HeroArt[]>("game_hero_art")) {
            if (hero.mm) out[hero.id] = fileSrc(hero.mm);
        }
    } catch {
        // No local art: callers draw a plain disc.
    }
    return out;
}

/** Asset urls of the game's minimap marker icons, keyed by stem. Icons the game does not have are absent. */
export async function loadMinimapIcons(icons: MinimapIcon[]): Promise<Partial<Record<MinimapIcon, string>>> {
    const out: Partial<Record<MinimapIcon, string>> = {};
    const wanted = [...new Set(icons)];
    if (wanted.length === 0) return out;
    try {
        for (const art of await command<MinimapIconArt[]>("game_minimap_icons", { icons: wanted })) {
            out[art.icon] = fileSrc(art.path);
        }
    } catch {
        // No local art: callers fall back to the baked icons.
    }
    return out;
}

export interface MinimapArt {
    src: string;
    /** World units from the map centre to the image edge. */
    radius: number;
    source: MinimapSource;
}

/** The minimap from the installed game, else the API's copy. Null when neither is available. */
export async function loadMinimapArt(): Promise<MinimapArt | null> {
    try {
        const result = await command<MinimapArtResult>("game_minimap_art");
        if (result.status !== "ready") return null;
        return { src: fileSrc(result.path), radius: result.radius, source: result.source };
    } catch {
        return null;
    }
}

/** Map objectives, neutrals and lane lines: read from the installed game, else the cache, else the table baked into the app. Null on failure. */
export async function loadMapItems(): Promise<MapItemsPayload | null> {
    try {
        return await command<MapItemsPayload>("game_map_items");
    } catch {
        return null;
    }
}
