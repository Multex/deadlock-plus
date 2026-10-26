import type { Build, BuildsQuery, HeroBuildStats, HeroBuildStatsQuery, ItemStats, ItemStatsBucket } from "./builds";

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

/** One level of a hero's `level_info`. Levels that grant an ability unlock list `EAbilityUnlocks`, the others `EAbilityPoints`. */
export interface AssetLevelInfo {
    required_gold: number;
    bonus_currencies?: string[];
    use_standard_upgrade?: boolean;
}

/** A row of `/assets/heroes`. */
export interface AssetHero {
    id: number;
    name: string;
    /** Class names by slot; `signature1` to `signature4` are the hero's four abilities. */
    items?: Record<string, string>;
    /** Keyed by level number as a string. */
    level_info?: Record<string, AssetLevelInfo>;
    hideout_rich_presence?: string | null;
    disabled?: boolean;
    in_development?: boolean;
    player_selectable?: boolean;
    /** `release` or `pre_release`; absent for heroes the game has not released. */
    development_state?: string | null;
    /** `style_hex` is the hero's own colour; `ui` repeats one value across many heroes. */
    colors?: { style_hex?: string | null };
    images?: {
        icon_image_small_webp?: string | null;
        icon_hero_card?: string | null;
        icon_image_small?: string | null;
    };
}

/** A row of `/assets/items`. The shop fields exist on `type: "upgrade"` rows only. */
export interface AssetItem {
    id: number;
    class_name: string;
    name: string;
    type: "ability" | "weapon" | "upgrade";
    /** Ids of the heroes that use the item. */
    heroes: number[];
    item_slot_type?: "weapon" | "vitality" | "spirit";
    /** 1 to 4 are shop tiers; 5 marks unreleased items priced 9999. */
    item_tier?: number;
    cost?: number;
    is_active_item?: boolean;
    shopable?: boolean;
    disabled?: boolean;
    /** Class names of the items this one upgrades from. */
    component_items?: string[];
    shop_image?: string;
    shop_image_webp?: string;
}

/** A row of `/players/steam` and `/players/steam-search`. */
export interface SteamProfile {
    account_id: number;
    personaname?: string | null;
    avatarmedium?: string | null;
    profileurl?: string | null;
}

/** A row of `/players/hero-stats`: one hero's totals for the account in the window. There is no healing field. */
export interface PlayerHeroStatsRow {
    account_id: number;
    hero_id: number;
    matches_played: number;
    time_played: number;
    wins: number;
    kills: number;
    deaths: number;
    assists: number;
    total_player_damage: number;
    obj_damage_per_min: number;
    accuracy: number;
    crit_shot_rate: number;
    /** Valve MVP placements in order; present since 2026-01-06. */
    mvp_rank_counts: number[];
    mvp_rated_matches: number;
    [key: string]: unknown;
}

/** A row of `/players/{id}/mate-stats`. `wins` are the viewer's wins in `matches`. */
export interface PlayerMateStats {
    mate_id: number;
    wins: number;
    matches_played: number;
    matches: number[];
}

/** A row of `/players/{id}/enemy-stats`. `wins` are the viewer's wins in `matches`. */
export interface PlayerEnemyStats {
    enemy_id: number;
    wins: number;
    matches_played: number;
    matches: number[];
}

/** Match start times in unix seconds, both ends sent as given. */
export interface PlayerStatsWindow {
    minS: number;
    maxS: number;
}

export interface PlayerHeroStatsQuery extends PlayerStatsWindow {
    /** The API defaults to `ranked,unranked`. */
    matchMode?: readonly string[];
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

/** Filter of `/analytics/item-stats`. Undefined fields and empty lists are left out of the URL. */
export interface ItemStatsFilter extends AnalyticsFilter {
    bucket?: ItemStatsBucket;
    /** Matches where any of these heroes was on the opposing team, unless `enemyHeroIdsAllMatch`. */
    enemyHeroIds?: readonly number[];
    enemyHeroIdsAllMatch?: boolean;
    minEnemyNetworth?: number;
    maxEnemyNetworth?: number;
    sameLaneFilter?: boolean;
    /** Match start time. The API defaults to 30 days ago. */
    minUnixTimestamp?: number;
    maxUnixTimestamp?: number;
    minDurationS?: number;
    maxDurationS?: number;
    minNetworth?: number;
    maxNetworth?: number;
    minMatchId?: number;
    maxMatchId?: number;
    includeItemIds?: readonly number[];
    excludeItemIds?: readonly number[];
    abilityOrderPrefix?: readonly number[];
    abilityUnlockOrderPrefix?: readonly number[];
    heroBuildId?: number;
    /** The API defaults to 20. */
    minMatches?: number;
    maxMatches?: number;
    accountIds?: readonly (number | string)[];
    minBoughtAtS?: number;
    maxBoughtAtS?: number;
    /** Each entry is one ordering of item ids, sent as its own `item_order` parameter. */
    itemOrder?: readonly (readonly (number | string)[])[];
    corruptedItems?: "exclude" | "include" | "only";
    enhancedItems?: "include" | "exclude" | "only";
}

type Scalar = string | number | boolean | undefined;

function windowQuery({ minS, maxS }: PlayerStatsWindow): string {
    return `min_unix_timestamp=${minS}&max_unix_timestamp=${maxS}`;
}

function pushScalars(pairs: [string, string][], fields: readonly (readonly [string, Scalar])[]) {
    for (const [key, value] of fields) if (value !== undefined) pairs.push([key, String(value)]);
}

function pushList(pairs: [string, string][], key: string, list: readonly (number | string)[] | undefined) {
    if (list !== undefined && list.length > 0) pairs.push([key, list.join(",")]);
}

function buildsQuery(q: BuildsQuery): string {
    const pairs: [string, string][] = [];
    pushScalars(pairs, [
        ["min_unix_timestamp", q.minUnixTimestamp],
        ["max_unix_timestamp", q.maxUnixTimestamp],
        ["min_published_unix_timestamp", q.minPublishedUnixTimestamp],
        ["max_published_unix_timestamp", q.maxPublishedUnixTimestamp],
        ["sort_by", q.sortBy],
        ["start", q.start],
        ["limit", q.limit],
        ["sort_direction", q.sortDirection],
        ["search_name", q.searchName === undefined ? undefined : encodeURIComponent(q.searchName)],
        ["search_description", q.searchDescription === undefined ? undefined : encodeURIComponent(q.searchDescription)],
        ["only_latest", q.onlyLatest],
        ["language", q.language],
        ["build_language", q.buildLanguage],
        ["build_id", q.buildId],
        ["version", q.version],
        ["hero_id", q.heroId],
        ["tag", q.tag],
        ["rollup_category", q.rollupCategory],
        ["author_id", q.authorId],
    ]);
    return pairs.length === 0 ? "" : `?${pairs.map(([k, v]) => `${k}=${v}`).join("&")}`;
}

function itemStatsTrailing(f: ItemStatsFilter): [string, string][] {
    const pairs: [string, string][] = [];
    pushScalars(pairs, [["bucket", f.bucket]]);
    pushList(pairs, "enemy_hero_ids", f.enemyHeroIds);
    pushScalars(pairs, [
        ["enemy_hero_ids_all_match", f.enemyHeroIdsAllMatch],
        ["min_enemy_networth", f.minEnemyNetworth],
        ["max_enemy_networth", f.maxEnemyNetworth],
        ["same_lane_filter", f.sameLaneFilter],
        ["min_unix_timestamp", f.minUnixTimestamp],
        ["max_unix_timestamp", f.maxUnixTimestamp],
        ["min_duration_s", f.minDurationS],
        ["max_duration_s", f.maxDurationS],
        ["min_networth", f.minNetworth],
        ["max_networth", f.maxNetworth],
        ["min_match_id", f.minMatchId],
        ["max_match_id", f.maxMatchId],
    ]);
    pushList(pairs, "include_item_ids", f.includeItemIds);
    pushList(pairs, "exclude_item_ids", f.excludeItemIds);
    pushList(pairs, "ability_order_prefix", f.abilityOrderPrefix);
    pushList(pairs, "ability_unlock_order_prefix", f.abilityUnlockOrderPrefix);
    pushScalars(pairs, [
        ["hero_build_id", f.heroBuildId],
        ["min_matches", f.minMatches],
        ["max_matches", f.maxMatches],
    ]);
    pushList(pairs, "account_ids", f.accountIds);
    pushScalars(pairs, [
        ["min_bought_at_s", f.minBoughtAtS],
        ["max_bought_at_s", f.maxBoughtAtS],
    ]);
    for (const order of f.itemOrder ?? []) pushList(pairs, "item_order", order);
    pushScalars(pairs, [
        ["corrupted_items", f.corruptedItems],
        ["enhanced_items", f.enhancedItems],
    ]);
    return pairs;
}

function analyticsQuery(
    filter: AnalyticsFilter,
    leading: [string, string][] = [],
    withHeroes = true,
    trailing: [string, string][] = [],
): string {
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
    pairs.push(...trailing);
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

        items: () => json<AssetItem[]>("/assets/items"),

        ranks: () => json<unknown>("/assets/ranks"),

        rankedSeasons: () => json<unknown>("/assets/ranked-seasons"),

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

        /** Rate limit 100 req/s per IP. */
        builds: (query: BuildsQuery) => json<Build[]>(`/builds${buildsQuery(query)}`),

        /** Cached by the API for 1 hour per parameter set. The analytics rate limit (200 req/min per IP) is shared. */
        heroBuildStats: (heroId: number, query: HeroBuildStatsQuery) =>
            json<HeroBuildStats[]>(
                `/analytics/hero-build-stats/${heroId}${query.minMatches === undefined ? "" : `?min_matches=${query.minMatches}`}`,
            ),

        /** Cached by the API for 1 hour per parameter set. The analytics rate limit (200 req/min per IP) is shared. */
        itemStats: (filter: ItemStatsFilter) =>
            json<ItemStats[]>(`/analytics/item-stats${analyticsQuery(filter, [], true, itemStatsTrailing(filter))}`),

        /** Opted-out accounts are absent from the result. At most 1000 ids per call. */
        playerRanks: (accountIds: readonly (number | string)[]) =>
            json<PlayerRank[]>(`/players/rank?account_ids=${accountIds.join(",")}`),

        /** Rate limit 100 req/s per IP. Covers only matches the API holds metadata for. */
        playerHeroStats: (accountId: number, query: PlayerHeroStatsQuery) =>
            json<PlayerHeroStatsRow[]>(
                `/players/hero-stats?account_ids=${accountId}&${windowQuery(query)}${
                    query.matchMode?.length ? `&match_mode=${query.matchMode.join(",")}` : ""
                }`,
            ),

        /** Players who were in the viewer's party, as the API defines a party. Rate limit 100 req/s per IP. */
        mateStats: (accountId: number, window: PlayerStatsWindow) =>
            json<PlayerMateStats[]>(`/players/${accountId}/mate-stats?same_party=true&${windowQuery(window)}`),

        /** Rate limit 100 req/s per IP. */
        enemyStats: (accountId: number, window: PlayerStatsWindow) =>
            json<PlayerEnemyStats[]>(`/players/${accountId}/enemy-stats?${windowQuery(window)}`),

        /** The match metadata as the raw JSON text, so a caller can store exactly what was sent. */
        matchMetadata: async (matchId: number): Promise<string> => (await ok(`/matches/${matchId}/metadata`)).text(),
    };
}
