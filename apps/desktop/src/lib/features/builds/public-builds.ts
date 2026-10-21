import { deadlockApi } from "$lib/core/deadlock-api";
import type { Build, BuildLanguage, BuildSortBy, BuildsQuery } from "@deadlock-plus/deadlock-api";
import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";

export type PublicSort = "weekly" | "all_time" | "newest";

export interface PublicBuildsRequest {
    heroId: number;
    sort: PublicSort;
    search: string;
    languages: BuildLanguage[];
}

export interface PublicBuild {
    build: BuildView;
    favorites: number;
    weeklyFavorites: number;
}

const PAGE_SIZE = 50;

const SORT_BY: Record<PublicSort, BuildSortBy> = {
    weekly: "weekly_favorites",
    all_time: "favorites",
    newest: "updated_at",
};

const SORT_KEY: Record<PublicSort, (b: PublicBuild) => number> = {
    weekly: (b) => b.weeklyFavorites,
    all_time: (b) => b.favorites,
    newest: (b) => b.build.lastUpdatedTimestamp ?? 0,
};

const LANGUAGES: Record<string, BuildLanguage> = {
    en: "English",
    de: "German",
    fr: "French",
    it: "Italian",
    ko: "Korean",
    es: "SpanishSpain",
    "zh-CN": "ChineseSimplified",
    ru: "Russian",
    th: "Thai",
    ja: "Japanese",
    pt: "PortuguesePortugal",
    "pt-BR": "PortugueseBrazil",
    pl: "Polish",
    cs: "Czech",
    tr: "Turkish",
    uk: "Ukrainian",
};

/** The game has no Traditional Chinese build language, so `zh-TW` must not fall back to `zh`. */
export function buildLanguageFor(locale: string): BuildLanguage | null {
    if (locale in LANGUAGES) return LANGUAGES[locale]!;
    const base = locale.split("-")[0]!;
    if (base === "es") return locale === "es-ES" ? "SpanishSpain" : "SpanishLatinAmerica";
    return base !== "zh" && base in LANGUAGES ? LANGUAGES[base]! : null;
}

export function browserLanguages(locale: string): BuildLanguage[] {
    return [...new Set<BuildLanguage>([buildLanguageFor(locale) ?? "English", "English"])];
}

/** `/v1/builds` filters by one language, so each language is its own query. */
export function publicBuildsQueries(request: PublicBuildsRequest): BuildsQuery[] {
    const searchName = request.search.trim() || undefined;
    return request.languages.map((buildLanguage) => ({
        heroId: request.heroId,
        sortBy: SORT_BY[request.sort],
        sortDirection: "desc",
        onlyLatest: true,
        limit: PAGE_SIZE,
        buildLanguage,
        ...(searchName === undefined ? {} : { searchName }),
    }));
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
        favorites: row.num_favorites ?? 0,
        weeklyFavorites: row.num_weekly_favorites ?? 0,
    };
}

export function mergePublicBuilds(lists: readonly PublicBuild[][], sort: PublicSort): PublicBuild[] {
    const byId = new Map<number, PublicBuild>();
    for (const list of lists)
        for (const b of list) if (!byId.has(b.build.heroBuildId)) byId.set(b.build.heroBuildId, b);
    const key = SORT_KEY[sort];
    return [...byId.values()].sort((a, b) => key(b) - key(a) || b.build.heroBuildId - a.build.heroBuildId);
}

export interface PublicBuildsSource {
    load(request: PublicBuildsRequest): Promise<PublicBuild[]>;
}

/** Keeps every answer for the session; a failed request is forgotten so the next load asks again. */
export function createPublicBuilds(fetchBuilds: (query: BuildsQuery) => Promise<Build[]>): PublicBuildsSource {
    const cache = new Map<string, Promise<PublicBuild[]>>();
    return {
        load(request) {
            const queries = publicBuildsQueries(request);
            const key = JSON.stringify(queries);
            const hit = cache.get(key);
            if (hit) return hit;
            const pending = Promise.all(
                queries.map(async (query) => (await fetchBuilds(query)).map(toPublicBuild)),
            ).then((lists) => mergePublicBuilds(lists, request.sort));
            cache.set(key, pending);
            pending.catch(() => {
                if (cache.get(key) === pending) cache.delete(key);
            });
            return pending;
        },
    };
}

export const publicBuilds = createPublicBuilds((query) => deadlockApi.builds(query));
