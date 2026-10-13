import { kvGet, kvSet } from "$lib/core/kv";
import { fetchServerGroups } from "./api";
import type { ServerData } from "./types";

const STORE = "server-picker-cache";

export async function readCachedServerData(gameId: string): Promise<ServerData | null> {
    try {
        return (await kvGet<ServerData>(STORE, `serverData:${gameId}`)) ?? null;
    } catch {
        return null;
    }
}

export async function writeCachedServerData(gameId: string, data: ServerData): Promise<void> {
    try {
        await kvSet(STORE, `serverData:${gameId}`, data);
    } catch {
        // Best-effort cache; a failed write just means no instant-paint next launch.
    }
}

/** The saved list; when none is saved yet, a fetched one, which is then saved. Rejects if that fetch fails. */
export async function savedOrFetchedServerData(gameId: string): Promise<ServerData> {
    const saved = await readCachedServerData(gameId);
    if (saved) return saved;
    const fetched = await fetchServerGroups(gameId);
    void writeCachedServerData(gameId, fetched);
    return fetched;
}
