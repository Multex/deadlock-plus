import { deadlockApi } from "$lib/core/deadlock-api";
import { command, fileSrc } from "$lib/core/tauri";
import { parseRanks, type RankTier } from "@deadlock-plus/stats/rank";
import type { RankArt } from "@deadlock-plus/ipc-types/RankArt";

/**
 * The API names the tiers. A badge from the installed game replaces its image when there is one; the API
 * url stays as `apiImage` for Discord, which cannot reach local files.
 */
export function mergeRankTiers(api: RankTier[], art: RankArt[]): RankTier[] {
    const local = new Map(art.map((a) => [a.tier, a]));
    return api.map((t) => {
        const lg = local.get(t.tier)?.lg;
        return { ...t, image: lg ? fileSrc(lg) : t.image, apiImage: t.image };
    });
}

/** Tiers with remote images only, safe to store: a game-cache path goes stale when the game updates. */
export function apiForm(tiers: RankTier[]): RankTier[] {
    return tiers.map(({ apiImage, ...t }) => (apiImage === undefined ? t : { ...t, image: apiImage }));
}

export function rankNames(tiers: RankTier[]): Record<number, string> {
    const out: Record<number, string> = {};
    for (const t of tiers) if (t.name !== "") out[t.tier] = t.name;
    return out;
}

let apiTiers: Promise<RankTier[]> | null = null;

/** The API's tier list, fetched once per session; a failed fetch is retried on the next call. */
export function loadApiRanks(): Promise<RankTier[]> {
    if (apiTiers) return apiTiers;
    const p = (async () => {
        try {
            return parseRanks(await deadlockApi.ranks());
        } catch {
            return [];
        }
    })().then((tiers) => {
        if (tiers.length === 0 && apiTiers === p) apiTiers = null;
        return tiers;
    });
    apiTiers = p;
    return p;
}

async function loadArt(): Promise<RankArt[]> {
    try {
        return await command<RankArt[]>("game_rank_art");
    } catch {
        return [];
    }
}

export async function withLocalArt(tiers: RankTier[]): Promise<RankTier[]> {
    return mergeRankTiers(apiForm(tiers), await loadArt());
}

export async function loadRankTiers(): Promise<RankTier[]> {
    const [api, art] = await Promise.all([loadApiRanks(), loadArt()]);
    return mergeRankTiers(api, art);
}

export async function loadRankNames(): Promise<Record<number, string>> {
    return rankNames(await loadApiRanks());
}
