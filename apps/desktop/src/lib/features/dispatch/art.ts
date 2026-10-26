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
