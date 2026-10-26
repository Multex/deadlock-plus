import { deadlockApi } from "$lib/core/deadlock-api";
import { heroBackdrop } from "../../art";

/** The asset rows carry more images than the shared `AssetHero` type lists; only the backdrop is read here. */
interface BackdropRow {
    id: number;
    images?: { background_image_webp?: string | null; background_image?: string | null };
}

let urls: Promise<Map<number, string>> | null = null;

/** The game's own backdrop when its files can be read, else the API's copy of the collage (4096x2312). */
export async function yearEndBackdrop(heroId: number): Promise<string | null> {
    return (await heroBackdrop(heroId)) ?? apiBackdrop(heroId);
}

function apiBackdrop(heroId: number): Promise<string | null> {
    urls ??= deadlockApi
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
            urls = null;
            return new Map<number, string>();
        });
    return urls.then((map) => map.get(heroId) ?? null);
}
