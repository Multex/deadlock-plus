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

/** Filters shared by the `/analytics` endpoints. Undefined fields are left out of the URL. */
export interface AnalyticsFilter {
    heroIds?: readonly number[];
    gameMode?: "normal" | "street_brawl";
    matchMode?: readonly string[];
    minAverageBadge?: number;
    maxAverageBadge?: number;
}

export type CurveMetric =
    "kills" | "deaths" | "assists" | "net_worth" | "player_damage" | "boss_damage" | "player_healing";

/** A point of `/analytics/player-performance-curve`. Values are null when the filter matched no matches. */
export type PerformanceCurvePoint = { game_time: number } & {
    [K in `${CurveMetric}_avg` | `${CurveMetric}_std`]: number | null;
};

/** One entry of `/analytics/player-stats/metrics`. Percentiles are sketch values and may repeat. */
export interface StatDistribution {
    avg: number | null;
    std: number | null;
    percentile1: number | null;
    percentile5: number | null;
    percentile10: number | null;
    percentile25: number | null;
    percentile50: number | null;
    percentile75: number | null;
    percentile90: number | null;
    percentile95: number | null;
    percentile99: number | null;
}

export type PlayerStatsMetrics = Record<string, StatDistribution>;

/** A row of `/analytics/hero-stats`. */
export interface HeroStatsRow {
    hero_id: number;
    matches: number;
    [key: string]: unknown;
}

/** A row of `/players/rank`. `badge` 0 is unranked or in placements; opted-out accounts are absent. */
export interface PlayerRank {
    account_id: number;
    badge: number;
    rank: number;
    subrank: number;
    last_match: { start_time: number; [key: string]: unknown } | null;
}

function analyticsQuery(filter: AnalyticsFilter, leading: [string, string][] = [], withHeroes = true): string {
    const pairs = [...leading];
    if (withHeroes && filter.heroIds !== undefined && filter.heroIds.length > 0) {
        pairs.push(["hero_ids", filter.heroIds.join(",")]);
    }
    if (filter.gameMode !== undefined) pairs.push(["game_mode", filter.gameMode]);
    if (filter.matchMode !== undefined && filter.matchMode.length > 0) {
        pairs.push(["match_mode", filter.matchMode.join(",")]);
    }
    if (filter.minAverageBadge !== undefined) pairs.push(["min_average_badge", String(filter.minAverageBadge)]);
    if (filter.maxAverageBadge !== undefined) pairs.push(["max_average_badge", String(filter.maxAverageBadge)]);
    return pairs.length === 0 ? "" : `?${pairs.map(([k, v]) => `${k}=${v}`).join("&")}`;
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

        /** One hero's cumulative stats by game time. `filter.heroIds` is ignored. */
        performanceCurve: (heroId: number, filter: AnalyticsFilter) =>
            json<PerformanceCurvePoint[]>(
                `/analytics/player-performance-curve${analyticsQuery({ ...filter, heroIds: [heroId] }, [["resolution", "0"]])}`,
            ),

        /** One hero's stat distributions. `filter.heroIds` is ignored. */
        playerStatsMetrics: (heroId: number, filter: AnalyticsFilter) =>
            json<PlayerStatsMetrics>(
                `/analytics/player-stats/metrics${analyticsQuery({ ...filter, heroIds: [heroId] })}`,
            ),

        /** Every hero's row; `filter.heroIds` is never sent. */
        heroStats: (filter: AnalyticsFilter) =>
            json<HeroStatsRow[]>(`/analytics/hero-stats${analyticsQuery(filter, [], false)}`),

        /** Opted-out accounts are absent from the result. At most 1000 ids per call. */
        playerRanks: (accountIds: readonly (number | string)[]) =>
            json<PlayerRank[]>(`/players/rank?account_ids=${accountIds.join(",")}`),

        /** The match metadata as the raw JSON text, so a caller can store exactly what was sent. */
        matchMetadata: async (matchId: number): Promise<string> => (await ok(`/matches/${matchId}/metadata`)).text(),
    };
}
