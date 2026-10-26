import { command, fileSrc } from "$lib/core/tauri";
import { deadlockApi } from "$lib/core/deadlock-api";
import { loadHeroes } from "$lib/features/heroes/heroes";

/**
 * The largest portrait the game ships for a hero: the 280x380 card, a transparent cutout. Local game art when
 * installed, else the API's copy of the same file. A null means no art; callers draw a plain mark.
 */
export async function heroPortrait(heroId: number): Promise<string | null> {
    try {
        const heroes = await loadHeroes([heroId]);
        return heroes[heroId]?.portrait ?? null;
    } catch {
        return null;
    }
}

/**
 * The game's hero-select backdrop: a hero-coloured silhouette collage, 2048x1156, transparent where the hero
 * stands. It is the sharp art for a cover; the portrait goes over it at its own size. Decoded on first ask and
 * cached by the app. Null when the game's files cannot be read or the hero has none.
 */
export async function heroBackdrop(heroId: number): Promise<string | null> {
    try {
        const path = await command<string | null>("game_hero_backdrop", { heroId });
        return path ? fileSrc(path) : null;
    } catch {
        return null;
    }
}

/** The asset rows carry more images than the shared `AssetHero` type lists; only the backdrop is read here. */
interface BackdropRow {
    id: number;
    images?: { background_image_webp?: string | null; background_image?: string | null };
}

let apiBackdrops: Promise<Map<number, string>> | null = null;

/** The API's copy of the backdrop collage (4096x2312), for when the game's files cannot be read. */
function apiBackdrop(heroId: number): Promise<string | null> {
    apiBackdrops ??= deadlockApi
        .heroes()
        .then((rows) => {
            const map = new Map<number, string>();
            for (const row of rows as BackdropRow[]) {
                const url = row.images?.background_image_webp ?? row.images?.background_image;
                if (url) map.set(row.id, url);
            }
            return map;
        })
        .catch(() => {
            apiBackdrops = null;
            return new Map<number, string>();
        });
    return apiBackdrops.then((map) => map.get(heroId) ?? null);
}

/** The backdrop for a cover: the game's own when its files can be read, else the API's. */
export async function coverBackdrop(heroId: number): Promise<string | null> {
    return (await heroBackdrop(heroId)) ?? apiBackdrop(heroId);
}
