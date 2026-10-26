import { command, fileSrc } from "$lib/core/tauri";
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
