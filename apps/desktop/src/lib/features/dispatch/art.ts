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

/** The asset rows carry more images than the shared `AssetHero` type lists; only these are read here. */
interface ArtRow {
    id: number;
    images?: {
        background_image_webp?: string | null;
        background_image?: string | null;
        hero_card_gloat_webp?: string | null;
        hero_card_gloat?: string | null;
        hero_card_critical_webp?: string | null;
        hero_card_critical?: string | null;
    };
}

let apiRows: Promise<Map<number, ArtRow["images"]>> | null = null;

function apiImages(heroId: number): Promise<ArtRow["images"] | undefined> {
    apiRows ??= deadlockApi
        .heroes()
        .then((rows) => new Map((rows as ArtRow[]).map((row) => [row.id, row.images])))
        .catch(() => {
            apiRows = null;
            return new Map<number, ArtRow["images"]>();
        });
    return apiRows.then((map) => map.get(heroId));
}

/** The API's copy of the backdrop collage (4096x2312), for when the game's files cannot be read. */
async function apiBackdrop(heroId: number): Promise<string | null> {
    const images = await apiImages(heroId);
    return images?.background_image_webp ?? images?.background_image ?? null;
}

/** The backdrop for a cover: the game's own when its files can be read, else the API's. */
export async function coverBackdrop(heroId: number): Promise<string | null> {
    return (await heroBackdrop(heroId)) ?? apiBackdrop(heroId);
}

/** `gloat` is the hero smug, for wins and awards; `critical` is the hero battered, for slumps. */
export type HeroMood = "gloat" | "critical";

async function gameMood(heroId: number, mood: HeroMood): Promise<string | null> {
    try {
        const path = await command<string | null>("game_hero_mood", { heroId, mood });
        return path ? fileSrc(path) : null;
    } catch {
        return null;
    }
}

async function apiMood(heroId: number, mood: HeroMood): Promise<string | null> {
    const images = await apiImages(heroId);
    if (mood === "gloat") return images?.hero_card_gloat_webp ?? images?.hero_card_gloat ?? null;
    return images?.hero_card_critical_webp ?? images?.hero_card_critical ?? null;
}

/**
 * The hero's card in a mood: the same 280x380 transparent cutout as the portrait, with the face changed. The
 * game's own when its files can be read, else the API's, else the plain portrait. Null only when there is no art.
 */
export async function heroMood(heroId: number, mood: HeroMood): Promise<string | null> {
    return (await gameMood(heroId, mood)) ?? (await apiMood(heroId, mood)) ?? heroPortrait(heroId);
}
