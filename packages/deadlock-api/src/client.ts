export const DEFAULT_BASE_URL = "https://api.deadlock-api.com/v1";

export interface DeadlockApiOptions {
    fetch: typeof fetch;
    baseUrl?: string;
}

/** The API answered with a status outside 200-299. A network failure is not one of these: it rejects as it came. */
export class DeadlockApiError extends Error {
    readonly status: number;

    constructor(status: number) {
        super(`HTTP ${status}`);
        this.name = "DeadlockApiError";
        this.status = status;
    }
}

/** A row of `/assets/heroes`. */
export interface AssetHero {
    id: number;
    name: string;
    hideout_rich_presence?: string | null;
    images?: {
        icon_image_small_webp?: string | null;
        icon_hero_card?: string | null;
        icon_image_small?: string | null;
    };
}

/** A row of `/players/steam` and `/players/steam-search`. */
export interface SteamProfile {
    account_id: number;
    personaname?: string | null;
    avatarmedium?: string | null;
    profileurl?: string | null;
}

export interface MatchHistoryResponse {
    ok: boolean;
    status: number;
    /** The parsed body whatever the status, or null when it is not JSON. */
    body: unknown;
}

export type DeadlockApi = ReturnType<typeof createDeadlockApi>;

export function createDeadlockApi({ fetch, baseUrl = DEFAULT_BASE_URL }: DeadlockApiOptions) {
    const send = (path: string, init?: RequestInit): Promise<Response> =>
        init === undefined ? fetch(`${baseUrl}${path}`) : fetch(`${baseUrl}${path}`, init);

    async function ok(path: string, init?: RequestInit): Promise<Response> {
        const res = await send(path, init);
        if (!res.ok) throw new DeadlockApiError(res.status);
        return res;
    }

    const json = async <T>(path: string, init?: RequestInit): Promise<T> => (await ok(path, init)).json() as Promise<T>;

    return {
        /** `/info/health`: which of the API's services are up. */
        health: (init?: { signal?: AbortSignal }) => json<unknown>("/info/health", init),

        heroes: () => json<AssetHero[]>("/assets/heroes"),

        ranks: () => json<unknown>("/assets/ranks"),

        /** Never rejects on a status: a rate-limited response still carries the stored history in its body. */
        async playerMatchHistory(accountId: number): Promise<MatchHistoryResponse> {
            const res = await send(`/players/${accountId}/match-history`);
            const body: unknown = await res.json().catch(() => null);
            return { ok: res.ok, status: res.status, body };
        },

        playerRank: (accountId: number) => json<unknown>(`/players/${accountId}/rank`),

        /** Players the API has never seen are absent from the result. */
        steamProfiles: (accountIds: readonly (number | string)[]) =>
            json<SteamProfile[]>(`/players/steam?account_ids=${accountIds.join(",")}`),

        searchSteamProfiles: (query: string, limit: number) =>
            json<SteamProfile[]>(`/players/steam-search?search_query=${encodeURIComponent(query)}&limit=${limit}`),

        /** The match metadata as the raw JSON text, so a caller can store exactly what was sent. */
        matchMetadata: async (matchId: number): Promise<string> => (await ok(`/matches/${matchId}/metadata`)).text(),
    };
}
