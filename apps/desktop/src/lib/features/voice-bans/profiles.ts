import { deadlockApi } from "$lib/core/deadlock-api";
import { t } from "$lib/core/i18n.svelte";
import { DeadlockApiError, type SteamProfile } from "@deadlock-plus/deadlock-api";
import { steam32ToSteam64, steam64ToSteam32 } from "$lib/core/player-links";

const BATCH = 50;
const CONCURRENCY = 4;

export interface Profile {
    steamid64: string;
    name: string;
    avatar: string | null;
    profileUrl: string | null;
}

export function toProfile(p: SteamProfile): Profile | null {
    const steamid64 = steam32ToSteam64(String(p.account_id));
    if (!steamid64) return null;
    return {
        steamid64,
        name: p.personaname || t("voice_bans.profile_unknown"),
        avatar: p.avatarmedium ?? null,
        profileUrl: p.profileurl ?? null,
    };
}

export function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

async function orApiError(request: Promise<SteamProfile[]>): Promise<SteamProfile[]> {
    try {
        return await request;
    } catch (e) {
        if (e instanceof DeadlockApiError) throw new Error(t("voice_bans.api_error", { status: e.status }));
        throw e;
    }
}

/** Players the API has never seen are simply absent from the result. */
export async function lookupProfiles(steamids64: string[], onBatch: (profiles: Profile[]) => void): Promise<void> {
    const batches = chunk(steamids64.map(steam64ToSteam32), BATCH);
    let next = 0;
    const worker = async () => {
        while (next < batches.length) {
            const ids = batches[next++];
            try {
                const players = await orApiError(deadlockApi.steamProfiles(ids));
                onBatch(players.map(toProfile).filter((p): p is Profile => p !== null));
            } catch {
                // A failed batch leaves those rows showing their id.
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
}

export async function searchPlayers(query: string, limit = 8): Promise<Profile[]> {
    const players = await orApiError(deadlockApi.searchSteamProfiles(query, limit));
    return players.map(toProfile).filter((p): p is Profile => p !== null);
}
