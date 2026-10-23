import { deadlockApi } from "$lib/core/deadlock-api";
import type {
    Build,
    BuildLanguage,
    BuildSortBy,
    BuildsQuery,
    HeroBuildStats,
    HeroBuildStatsQuery,
} from "@deadlock-plus/deadlock-api";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
import type { LiveMatch } from "@deadlock-plus/ipc-types/LiveMatch";
import type { LivePlayer } from "@deadlock-plus/ipc-types/LivePlayer";

/** `popular` mirrors the game's Build Browser: this week's top builds, then the newest. */
export type PublicSort = "popular" | "weekly" | "favorites" | "updated" | "published" | "versions";
export const PUBLIC_SORTS: readonly PublicSort[] = [
    "popular",
    "weekly",
    "favorites",
    "updated",
    "published",
    "versions",
];

/** Matches the build's last update. */
export type UpdatedWithin = "day" | "week" | "month" | "all";
export const UPDATED_WITHIN: readonly UpdatedWithin[] = ["day", "week", "month", "all"];

/** `default` is the app's language plus English; a number is one Steam ELanguage. */
export type LanguageChoice = "default" | "any" | number;

export interface BrowserFilters {
    sort: PublicSort;
    within: UpdatedWithin;
    tag: number | null;
    language: LanguageChoice;
    /** 0 shows every build. */
    minFavorites: number;
    /** The author's SteamID3. */
    author: number | null;
    name: string;
}

export const DEFAULT_FILTERS: BrowserFilters = {
    sort: "popular",
    within: "all",
    tag: null,
    language: "default",
    minFavorites: 0,
    author: null,
    name: "",
};

export const MIN_FAVORITES_STEPS = [0, 10, 100, 1000] as const;

export interface PublicBuildsRequest {
    heroId: number;
    sort: PublicSort;
    /** Unix seconds; null for all time. */
    since: number | null;
    tag: number | null;
    /** Steam ELanguage ids; null for any language. */
    languages: number[] | null;
    author: number | null;
    name: string;
    minFavorites: number;
}

export interface PublicBuild {
    build: BuildView;
    /** Null when the API's row has no count: it records either the total or this week's, not both. */
    favorites: number | null;
    weeklyFavorites: number | null;
}

const PAGE_SIZE = 50;
/** The game's Build Browser leads with about ten of the week's and day's top builds; the API has no daily count. */
export const POPULAR_LEAD = 10;

const SORT_BY: Record<PublicSort, BuildSortBy> = {
    popular: "updated_at",
    weekly: "weekly_favorites",
    favorites: "favorites",
    updated: "updated_at",
    published: "published_at",
    versions: "version",
};

const SORT_KEY: Record<PublicSort, (b: PublicBuild) => number> = {
    popular: (b) => b.build.lastUpdatedTimestamp ?? 0,
    weekly: (b) => b.weeklyFavorites ?? 0,
    favorites: (b) => b.favorites ?? 0,
    updated: (b) => b.build.lastUpdatedTimestamp ?? 0,
    published: (b) => b.build.publishTimestamp ?? 0,
    versions: (b) => b.build.version,
};

const WINDOW_S: Record<Exclude<UpdatedWithin, "all">, number> = { day: 86_400, week: 7 * 86_400, month: 30 * 86_400 };

/** Steam ELanguage ids the API's `build_language` names; others go through its numeric `language`. */
const BUILD_LANGUAGES: Record<number, BuildLanguage> = {
    0: "English",
    1: "German",
    2: "French",
    3: "Italian",
    4: "Korean",
    5: "SpanishSpain",
    6: "ChineseSimplified",
    8: "Russian",
    9: "Thai",
    10: "Japanese",
    11: "PortuguesePortugal",
    12: "Polish",
    19: "Czech",
    21: "Turkish",
    22: "PortugueseBrazil",
    25: "Ukrainian",
    26: "SpanishLatinAmerica",
    27: "Vietnamese",
};

const LANGUAGE_BY_BASE: Record<string, number> = {
    en: 0,
    de: 1,
    fr: 2,
    it: 3,
    ko: 4,
    ru: 8,
    th: 9,
    ja: 10,
    pl: 12,
    hu: 18,
    cs: 19,
    tr: 21,
    uk: 25,
    vi: 27,
    id: 28,
};

/** Steam ELanguage of an app locale, or null when the game has no such language. */
export function steamLanguageFor(locale: string): number | null {
    const [base = "", region = ""] = locale.toLowerCase().split("-");
    if (base === "pt") return region === "br" ? 22 : 11;
    if (base === "zh") return ["tw", "hk", "mo", "hant"].includes(region) ? 7 : 6;
    if (base === "es") return region === "" || region === "es" ? 5 : 26;
    return LANGUAGE_BY_BASE[base] ?? null;
}

export function requestLanguages(choice: LanguageChoice, locale: string): number[] | null {
    if (choice === "any") return null;
    if (choice !== "default") return [choice];
    return [...new Set([steamLanguageFor(locale) ?? 0, 0])];
}

/** Floored to the hour so loads within the hour share a cached query. */
export function windowStart(within: UpdatedWithin, nowS: number): number | null {
    if (within === "all") return null;
    return Math.floor((nowS - WINDOW_S[within]) / 3600) * 3600;
}

const id = (raw: string | null): number | null => {
    if (raw === null || !/^\d+$/.test(raw)) return null;
    const n = Number(raw);
    return Number.isSafeInteger(n) ? n : null;
};

export function filtersFromParams(params: URLSearchParams): BrowserFilters {
    const sort = params.get("sort") as PublicSort | null;
    const within = params.get("updated") as UpdatedWithin | null;
    const lang = params.get("lang");
    return {
        sort: sort !== null && PUBLIC_SORTS.includes(sort) ? sort : DEFAULT_FILTERS.sort,
        within: within !== null && UPDATED_WITHIN.includes(within) ? within : DEFAULT_FILTERS.within,
        tag: id(params.get("tag")),
        language: lang === "any" ? "any" : (id(lang) ?? "default"),
        minFavorites: id(params.get("min_fav")) ?? 0,
        author: id(params.get("author")),
        name: params.get("q") ?? "",
    };
}

/** Writes non-default filters over `params`; every other parameter, such as `hero`, is kept. */
export function filtersToParams(filters: BrowserFilters, params: URLSearchParams): URLSearchParams {
    const out = new URLSearchParams(params);
    const set = (key: string, value: string | null) => (value === null ? out.delete(key) : out.set(key, value));
    set("sort", filters.sort === DEFAULT_FILTERS.sort ? null : filters.sort);
    set("updated", filters.within === DEFAULT_FILTERS.within ? null : filters.within);
    set("tag", filters.tag === null ? null : String(filters.tag));
    set("lang", filters.language === "default" ? null : String(filters.language));
    set("min_fav", filters.minFavorites > 0 ? String(filters.minFavorites) : null);
    set("author", filters.author === null ? null : String(filters.author));
    set("q", filters.name.trim() || null);
    return out;
}

export interface PublicBuildsPlan {
    /** The popular view's lead, by this week's favourites. */
    top: BuildsQuery[];
    rest: BuildsQuery[];
}

/** `/v1/builds` filters by one language, so each language is its own query. */
export function publicBuildsPlan(request: PublicBuildsRequest): PublicBuildsPlan {
    const searchName = request.name.trim() || undefined;
    const base: BuildsQuery = {
        heroId: request.heroId,
        sortDirection: "desc",
        onlyLatest: true,
        ...(request.since === null ? {} : { minUnixTimestamp: request.since }),
        ...(request.tag === null ? {} : { tag: request.tag }),
        ...(request.author === null ? {} : { authorId: request.author }),
        ...(searchName === undefined ? {} : { searchName }),
    };
    const languages = (request.languages ?? [null]).map((language): BuildsQuery => {
        if (language === null) return {};
        const name = BUILD_LANGUAGES[language];
        return name === undefined ? { language } : { buildLanguage: name };
    });
    const queries = (sortBy: BuildSortBy, limit: number) =>
        languages.map((language) => ({ ...base, sortBy, limit, ...language }));
    return {
        top: request.sort === "popular" ? queries("weekly_favorites", POPULAR_LEAD) : [],
        rest: queries(SORT_BY[request.sort], PAGE_SIZE),
    };
}

/** `?hero=<id>` from a hero page's link. */
export function heroParam(params: URLSearchParams): number | null {
    const raw = params.get("hero");
    if (raw === null || !/^\d+$/.test(raw)) return null;
    const id = Number(raw);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

type LiveHeroMatch = Pick<LiveMatch, "perspective"> & {
    teams: readonly { players: readonly Pick<LivePlayer, "heroId" | "isYou">[] }[];
};

/** While spectating, `isYou` marks the followed player, whose hero is not the player's own. */
export function liveHeroId(match: LiveHeroMatch | null): number | null {
    if (match?.perspective !== "playing") return null;
    for (const team of match.teams) for (const p of team.players) if (p.isYou && p.heroId) return p.heroId;
    return null;
}

export function startingHero(
    heroes: readonly { id: number }[],
    candidates: readonly (number | null | undefined)[],
): number | null {
    for (const id of candidates) if (id != null && heroes.some((h) => h.id === id)) return id;
    return heroes[0]?.id ?? null;
}

export function toPublicBuild(row: Build): PublicBuild {
    const hero = row.hero_build;
    return {
        build: {
            heroBuildId: hero.hero_build_id,
            heroId: hero.hero_id,
            authorAccountId: hero.author_account_id,
            lastUpdatedTimestamp: hero.last_updated_timestamp ?? null,
            name: hero.name,
            description: hero.description ?? "",
            language: hero.language,
            version: hero.version,
            originBuildId: hero.origin_build_id || null,
            modCategories: (hero.details.mod_categories ?? []).map((category) => ({
                name: category.name,
                description: category.description ?? "",
                width: category.width ?? null,
                height: category.height ?? null,
                optional: category.optional ?? false,
                mods: (category.mods ?? []).map((mod) => ({
                    abilityId: mod.ability_id,
                    annotation: mod.annotation ?? null,
                    requiredFlexSlots: mod.required_flex_slots ?? null,
                    sellPriority: mod.sell_priority ?? null,
                    imbueTargetAbilityId: mod.imbue_target_ability_id ?? null,
                })),
            })),
            abilityOrder: (hero.details.ability_order?.currency_changes ?? []).map((step) => ({
                abilityId: step.ability_id,
                currencyType: step.currency_type,
                delta: step.delta,
                annotation: step.annotation ?? null,
            })),
            tags: hero.tags ?? [],
            developmentBuild: hero.development_build ?? false,
            publishTimestamp: hero.publish_timestamp ?? null,
            favorited: false,
        },
        favorites: row.num_favorites ?? null,
        weeklyFavorites: row.num_weekly_favorites ?? null,
    };
}

/** A lower bound: a row with only this week's count has at least that many in total. */
export function knownFavorites(b: PublicBuild): number {
    return Math.max(b.favorites ?? 0, b.weeklyFavorites ?? 0);
}

function unique(lists: readonly PublicBuild[][]): PublicBuild[] {
    const byId = new Map<number, PublicBuild>();
    for (const list of lists)
        for (const b of list) if (!byId.has(b.build.heroBuildId)) byId.set(b.build.heroBuildId, b);
    return [...byId.values()];
}

function sorted(builds: PublicBuild[], key: (b: PublicBuild) => number): PublicBuild[] {
    return builds.sort((a, b) => key(b) - key(a) || b.build.heroBuildId - a.build.heroBuildId);
}

export function mergePublicBuilds(
    top: readonly PublicBuild[][],
    rest: readonly PublicBuild[][],
    sort: PublicSort,
    minFavorites: number,
): PublicBuild[] {
    const keep = (b: PublicBuild) => minFavorites <= 0 || knownFavorites(b) >= minFavorites;
    const lead = sorted(unique(top).filter(keep), SORT_KEY.weekly).slice(0, POPULAR_LEAD);
    const led = new Set(lead.map((b) => b.build.heroBuildId));
    const others = unique(rest).filter((b) => keep(b) && !led.has(b.build.heroBuildId));
    return [...lead, ...sorted(others, SORT_KEY[sort])];
}

export interface PublicBuildsSource {
    load(request: PublicBuildsRequest): Promise<PublicBuild[]>;
}

/** Keeps every answer for the session; a failed request is forgotten so the next load asks again. */
export function createPublicBuilds(fetchBuilds: (query: BuildsQuery) => Promise<Build[]>): PublicBuildsSource {
    const cache = new Map<string, Promise<PublicBuild[]>>();
    const fetchAll = (queries: BuildsQuery[]) =>
        Promise.all(queries.map(async (query) => (await fetchBuilds(query)).map(toPublicBuild)));
    return {
        load(request) {
            const plan = publicBuildsPlan(request);
            const key = JSON.stringify([plan, request.minFavorites]);
            const hit = cache.get(key);
            if (hit) return hit;
            const pending = Promise.all([fetchAll(plan.top), fetchAll(plan.rest)]).then(([top, rest]) =>
                mergePublicBuilds(top, rest, request.sort, request.minFavorites),
            );
            cache.set(key, pending);
            pending.catch(() => {
                if (cache.get(key) === pending) cache.delete(key);
            });
            return pending;
        },
    };
}

export const publicBuilds = createPublicBuilds((query) => deadlockApi.builds(query));

/** Below this a win rate swings too much to show: at 200 matches the 95% margin is about 7 points. */
export const MIN_WIN_RATE_MATCHES = 200;

export interface WinRate {
    wins: number;
    matches: number;
}

/** By build id, over the API's default window (ranked and unranked matches of the last 30 days). */
export function winRates(rows: readonly HeroBuildStats[], minMatches = MIN_WIN_RATE_MATCHES): Map<number, WinRate> {
    const sums = new Map<number, WinRate>();
    for (const row of rows) {
        const sum = sums.get(row.hero_build_id) ?? { wins: 0, matches: 0 };
        sums.set(row.hero_build_id, { wins: sum.wins + row.wins, matches: sum.matches + row.matches });
    }
    for (const [buildId, sum] of sums) if (sum.matches < minMatches) sums.delete(buildId);
    return sums;
}

export interface WinRatesSource {
    /** Never rejects: an unreachable API answers no win rates. */
    load(heroId: number): Promise<ReadonlyMap<number, WinRate>>;
}

export function createWinRates(
    fetchStats: (heroId: number, query: HeroBuildStatsQuery) => Promise<HeroBuildStats[]>,
): WinRatesSource {
    const cache = new Map<number, Promise<ReadonlyMap<number, WinRate>>>();
    return {
        load(heroId) {
            const hit = cache.get(heroId);
            if (hit) return hit;
            const pending = fetchStats(heroId, { minMatches: MIN_WIN_RATE_MATCHES })
                .then((rows) => winRates(rows))
                .catch((): ReadonlyMap<number, WinRate> => {
                    if (cache.get(heroId) === pending) cache.delete(heroId);
                    return new Map();
                });
            cache.set(heroId, pending);
            return pending;
        },
    };
}

export const buildWinRates = createWinRates((heroId, query) => deadlockApi.heroBuildStats(heroId, query));
