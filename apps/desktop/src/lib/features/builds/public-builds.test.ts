import { describe, expect, it, vi } from "vitest";
import type { Build, BuildsQuery } from "@deadlock-plus/deadlock-api";
import {
    createPublicBuilds,
    createWinRates,
    DEFAULT_FILTERS,
    filtersFromParams,
    filtersToParams,
    heroParam,
    liveHeroId,
    mergePublicBuilds,
    MIN_WIN_RATE_MATCHES,
    publicBuildsPlan,
    requestLanguages,
    startingHero,
    steamLanguageFor,
    toPublicBuild,
    windowStart,
    winRates,
    type BrowserFilters,
    type PublicBuildsRequest,
    type PublicSort,
} from "./public-builds";

/** Shaped like a real `/v1/builds` row: optional fields missing or null, as the API sends them. */
function row(
    id: number,
    fields: {
        weekly?: number | null;
        favorites?: number | null;
        updated?: number;
        published?: number;
        version?: number;
        language?: number;
    } = {},
) {
    return {
        hero_build: {
            hero_id: 13,
            hero_build_id: id,
            author_account_id: 90000007,
            name: `Build ${id}`,
            language: fields.language ?? 0,
            version: fields.version ?? 14,
            origin_build_id: 0,
            details: {
                ability_order: {
                    currency_changes: [
                        { ability_id: 2948410412, currency_type: 2, delta: -1 },
                        { ability_id: 2948410412, currency_type: 1, delta: -1, annotation: "max first" },
                    ],
                },
                mod_categories: [
                    {
                        name: "Early",
                        width: null,
                        height: null,
                        mods: [
                            { ability_id: 1548066885 },
                            {
                                ability_id: 2829638276,
                                annotation: "rush",
                                imbue_target_ability_id: 2948410412,
                                required_flex_slots: 1,
                                sell_priority: 2,
                            },
                        ],
                    },
                    { name: "Late", description: "Buy last", width: 340, height: 183.75, optional: true, mods: null },
                ],
            },
            description: null,
            last_updated_timestamp: fields.updated ?? 1_760_000_000,
            publish_timestamp: fields.published ?? 1_750_000_000,
        },
        num_favorites: fields.favorites === undefined ? 9812 : fields.favorites,
        num_weekly_favorites: fields.weekly === undefined ? 412 : fields.weekly,
    } satisfies Build;
}

describe("steamLanguageFor", () => {
    it("maps app locales to Steam's language numbers", () => {
        expect(steamLanguageFor("de")).toBe(1);
        expect(steamLanguageFor("pt-BR")).toBe(22);
        expect(steamLanguageFor("pt")).toBe(11);
        expect(steamLanguageFor("zh-CN")).toBe(6);
        expect(steamLanguageFor("zh-TW")).toBe(7);
        expect(steamLanguageFor("es")).toBe(5);
        expect(steamLanguageFor("en")).toBe(0);
    });

    it("maps Latin American Spanish locales to Latin American Spanish", () => {
        expect(steamLanguageFor("es-419")).toBe(26);
        expect(steamLanguageFor("es-MX")).toBe(26);
        expect(steamLanguageFor("es-ES")).toBe(5);
    });

    it("has no language for a locale the game does not publish in", () => {
        expect(steamLanguageFor("af")).toBeNull();
    });
});

describe("requestLanguages", () => {
    it("is the app's language plus English by default", () => {
        expect(requestLanguages("default", "ru")).toEqual([8, 0]);
    });

    it("asks for English once", () => {
        expect(requestLanguages("default", "en")).toEqual([0]);
        expect(requestLanguages("default", "en-XA")).toEqual([0]);
        expect(requestLanguages("default", "af")).toEqual([0]);
    });

    it("is one chosen language, or no language filter for any", () => {
        expect(requestLanguages(10, "ru")).toEqual([10]);
        expect(requestLanguages("any", "ru")).toBeNull();
    });
});

describe("filters in the URL", () => {
    const params = (search: string) => new URLSearchParams(search);

    it("reads an empty query as the default filters", () => {
        expect(filtersFromParams(params(""))).toEqual(DEFAULT_FILTERS);
    });

    it("round-trips every filter", () => {
        const filters: BrowserFilters = {
            sort: "favorites",
            within: "week",
            tag: 2592289373,
            language: 8,
            minFavorites: 100,
            author: 90000007,
            name: "crit build",
        };
        expect(filtersFromParams(filtersToParams(filters, params("")))).toEqual(filters);
        expect(filtersFromParams(filtersToParams({ ...DEFAULT_FILTERS, language: "any" }, params("")))).toEqual({
            ...DEFAULT_FILTERS,
            language: "any",
        });
    });

    it("leaves defaults out and keeps other parameters such as the hero", () => {
        expect(filtersToParams(DEFAULT_FILTERS, params("hero=13")).toString()).toBe("hero=13");
        expect(filtersToParams({ ...DEFAULT_FILTERS, sort: "updated" }, params("hero=13&sort=weekly")).toString()).toBe(
            "hero=13&sort=updated",
        );
    });

    it("drops values it cannot read", () => {
        expect(filtersFromParams(params("sort=best&updated=year&tag=x&lang=-1&min_fav=lots&author=me"))).toEqual(
            DEFAULT_FILTERS,
        );
    });

    it("trims the name search", () => {
        expect(filtersToParams({ ...DEFAULT_FILTERS, name: "  crit " }, params("")).toString()).toBe("q=crit");
        expect(filtersToParams({ ...DEFAULT_FILTERS, name: "   " }, params("")).toString()).toBe("");
    });
});

describe("windowStart", () => {
    const now = 1_792_577_702;

    it("is the start of the window, floored to the hour so repeated loads share a query", () => {
        expect(windowStart("day", now)).toBe(Math.floor((now - 86_400) / 3600) * 3600);
        expect(windowStart("week", now)).toBe(Math.floor((now - 7 * 86_400) / 3600) * 3600);
        expect(windowStart("month", now)).toBe(Math.floor((now - 30 * 86_400) / 3600) * 3600);
        expect(windowStart("all", now)).toBeNull();
    });
});

describe("publicBuildsPlan", () => {
    const request: PublicBuildsRequest = {
        heroId: 13,
        sort: "weekly",
        since: null,
        tag: null,
        languages: [1, 0],
        author: null,
        name: "",
        minFavorites: 0,
    };
    const base = { heroId: 13, sortDirection: "desc", onlyLatest: true };

    it("asks for one hero's latest versions, one query per language", () => {
        expect(publicBuildsPlan(request)).toEqual({
            top: [],
            rest: [
                { ...base, sortBy: "weekly_favorites", limit: 50, buildLanguage: "German" },
                { ...base, sortBy: "weekly_favorites", limit: 50, buildLanguage: "English" },
            ],
        });
    });

    it("leads the popular view with this week's top builds, then the newest", () => {
        expect(publicBuildsPlan({ ...request, sort: "popular", languages: [0] })).toEqual({
            top: [{ ...base, sortBy: "weekly_favorites", limit: 10, buildLanguage: "English" }],
            rest: [{ ...base, sortBy: "updated_at", limit: 50, buildLanguage: "English" }],
        });
    });

    it("maps each sort to the API's field", () => {
        const sortOf = (sort: PublicSort) => publicBuildsPlan({ ...request, sort, languages: [0] }).rest[0]!.sortBy;
        expect(sortOf("favorites")).toBe("favorites");
        expect(sortOf("updated")).toBe("updated_at");
        expect(sortOf("published")).toBe("published_at");
        expect(sortOf("versions")).toBe("version");
    });

    it("sends the window, tag, author and trimmed name, and no language for any", () => {
        const [query] = publicBuildsPlan({
            ...request,
            since: 1_792_000_000,
            tag: 2592289373,
            author: 90000007,
            name: "  crit ",
            languages: null,
        }).rest;
        expect(query).toEqual({
            ...base,
            sortBy: "weekly_favorites",
            limit: 50,
            minUnixTimestamp: 1_792_000_000,
            tag: 2592289373,
            authorId: 90000007,
            searchName: "crit",
        });
    });

    it("asks by number for a language the API has no name for", () => {
        expect(publicBuildsPlan({ ...request, languages: [7] }).rest[0]).toMatchObject({ language: 7 });
        expect(publicBuildsPlan({ ...request, languages: [7] }).rest[0]!.buildLanguage).toBeUndefined();
    });
});

describe("toPublicBuild", () => {
    it("maps an API row to the build view the shop grid draws", () => {
        const { build, favorites, weeklyFavorites } = toPublicBuild(row(381204));
        expect(favorites).toBe(9812);
        expect(weeklyFavorites).toBe(412);
        expect(build).toEqual({
            heroBuildId: 381204,
            heroId: 13,
            authorAccountId: 90000007,
            lastUpdatedTimestamp: 1_760_000_000,
            name: "Build 381204",
            description: "",
            language: 0,
            version: 14,
            originBuildId: null,
            modCategories: [
                {
                    name: "Early",
                    description: "",
                    width: null,
                    height: null,
                    optional: false,
                    mods: [
                        {
                            abilityId: 1548066885,
                            annotation: null,
                            requiredFlexSlots: null,
                            sellPriority: null,
                            imbueTargetAbilityId: null,
                        },
                        {
                            abilityId: 2829638276,
                            annotation: "rush",
                            requiredFlexSlots: 1,
                            sellPriority: 2,
                            imbueTargetAbilityId: 2948410412,
                        },
                    ],
                },
                { name: "Late", description: "Buy last", width: 340, height: 183.75, optional: true, mods: [] },
            ],
            abilityOrder: [
                { abilityId: 2948410412, currencyType: 2, delta: -1, annotation: null },
                { abilityId: 2948410412, currencyType: 1, delta: -1, annotation: "max first" },
            ],
            tags: [],
            developmentBuild: false,
            publishTimestamp: 1_750_000_000,
            favorited: false,
        });
    });

    it("keeps the origin of a copied build and reads missing counts as unknown", () => {
        const copy = row(2);
        copy.hero_build.origin_build_id = 381204;
        const { build, favorites, weeklyFavorites } = toPublicBuild({
            hero_build: copy.hero_build,
            num_favorites: null,
        });
        expect(build.originBuildId).toBe(381204);
        expect(favorites).toBeNull();
        expect(weeklyFavorites).toBeNull();
    });

    it("reads a build without details lists as empty", () => {
        const bare = row(3);
        bare.hero_build.details = { mod_categories: [] } as never;
        const { build } = toPublicBuild(bare);
        expect(build.modCategories).toEqual([]);
        expect(build.abilityOrder).toEqual([]);
    });
});

describe("mergePublicBuilds", () => {
    it("drops a build both languages returned and keeps the sort across them", () => {
        const german = [row(1, { weekly: 50 }), row(2, { weekly: 5 })].map(toPublicBuild);
        const english = [row(3, { weekly: 400 }), row(1, { weekly: 50 }), row(4, { weekly: 20 })].map(toPublicBuild);
        const ids = mergePublicBuilds([], [german, english], "weekly", 0).map((b) => b.build.heroBuildId);
        expect(ids).toEqual([3, 1, 4, 2]);
    });

    it("sorts by favourites, last update, publish time and version", () => {
        const builds = [
            row(1, { favorites: 10, updated: 300, published: 100, version: 2 }),
            row(2, { favorites: 30, updated: 100, published: 300, version: 1 }),
            row(3, { favorites: 20, updated: 200, published: 200, version: 3 }),
        ].map(toPublicBuild);
        const order = (sort: PublicSort) => mergePublicBuilds([], [builds], sort, 0).map((b) => b.build.heroBuildId);
        expect(order("favorites")).toEqual([2, 3, 1]);
        expect(order("updated")).toEqual([1, 3, 2]);
        expect(order("published")).toEqual([2, 3, 1]);
        expect(order("versions")).toEqual([3, 1, 2]);
    });

    it("puts this week's top builds first, then the newest of the rest", () => {
        const top = [row(1, { weekly: 5 }), row(2, { weekly: 50 })].map(toPublicBuild);
        const rest = [row(3, { updated: 100 }), row(1, { updated: 900 }), row(4, { updated: 500 })].map(toPublicBuild);
        const ids = mergePublicBuilds([top], [rest], "popular", 0).map((b) => b.build.heroBuildId);
        expect(ids).toEqual([2, 1, 4, 3]);
    });

    it("keeps at most ten builds in the popular lead", () => {
        const top = Array.from({ length: 12 }, (_, i) => toPublicBuild(row(i + 1, { weekly: 100 - i })));
        expect(mergePublicBuilds([top], [], "popular", 0)).toHaveLength(10);
    });

    it("leaves out builds below the favourite floor, counting this week's when the total is unknown", () => {
        const builds = [
            toPublicBuild(row(1, { favorites: 500, weekly: null })),
            toPublicBuild(row(2, { favorites: null, weekly: 120 })),
            toPublicBuild(row(3, { favorites: 40, weekly: 2 })),
            toPublicBuild(row(4, { favorites: null, weekly: null })),
        ];
        const ids = mergePublicBuilds([], [builds], "updated", 100).map((b) => b.build.heroBuildId);
        expect(ids.sort()).toEqual([1, 2]);
    });
});

describe("winRates", () => {
    const stats = (id: number, wins: number, losses: number, bucket = 0) => ({
        hero_id: 13,
        hero_build_id: id,
        bucket,
        wins,
        losses,
        matches: wins + losses,
        players: wins + losses,
    });

    it("keeps builds with enough matches, summing buckets", () => {
        const rates = winRates([stats(1, 120, 100), stats(2, 50, 40), stats(3, 60, 50), stats(3, 60, 50, 1)]);
        expect(rates.get(1)).toEqual({ wins: 120, matches: 220 });
        expect(rates.has(2)).toBe(false);
        expect(rates.get(3)).toEqual({ wins: 120, matches: 220 });
        expect(MIN_WIN_RATE_MATCHES).toBe(200);
    });
});

describe("createWinRates", () => {
    it("asks once per hero for builds with enough matches", async () => {
        const fetchStats = vi.fn(async () => [
            { hero_id: 13, hero_build_id: 1, bucket: 0, wins: 150, losses: 100, matches: 250, players: 200 },
        ]);
        const source = createWinRates(fetchStats);
        const first = await source.load(13);
        expect(first.get(1)).toEqual({ wins: 150, matches: 250 });
        expect(await source.load(13)).toBe(first);
        expect(fetchStats).toHaveBeenCalledTimes(1);
        expect(fetchStats).toHaveBeenCalledWith(13, { minMatches: MIN_WIN_RATE_MATCHES });
    });

    it("answers no win rates when the API fails, and asks again next time", async () => {
        const fetchStats = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue([]);
        const source = createWinRates(fetchStats);
        expect((await source.load(13)).size).toBe(0);
        await source.load(13);
        expect(fetchStats).toHaveBeenCalledTimes(2);
    });
});

describe("createPublicBuilds", () => {
    const request: PublicBuildsRequest = {
        heroId: 13,
        sort: "weekly",
        since: null,
        tag: null,
        languages: [1, 0],
        author: null,
        name: "",
        minFavorites: 0,
    };

    it("asks once per language and merges the answers", async () => {
        const fetchBuilds = vi.fn(async (q: BuildsQuery) =>
            q.buildLanguage === "German" ? [row(1, { weekly: 5, language: 1 })] : [row(2, { weekly: 9 })],
        );
        const builds = await createPublicBuilds(fetchBuilds).load(request);
        expect(fetchBuilds).toHaveBeenCalledTimes(2);
        expect(builds.map((b) => b.build.heroBuildId)).toEqual([2, 1]);
    });

    it("asks for the popular lead and the newest builds", async () => {
        const fetchBuilds = vi.fn(async (q: BuildsQuery) =>
            q.sortBy === "weekly_favorites" ? [row(1, { weekly: 90 })] : [row(2, { updated: 5 }), row(1)],
        );
        const builds = await createPublicBuilds(fetchBuilds).load({ ...request, sort: "popular", languages: [0] });
        expect(fetchBuilds).toHaveBeenCalledTimes(2);
        expect(builds.map((b) => b.build.heroBuildId)).toEqual([1, 2]);
    });

    it("answers the same query from memory", async () => {
        const fetchBuilds = vi.fn(async () => [row(1)]);
        const source = createPublicBuilds(fetchBuilds);
        const first = await source.load({ ...request, languages: [0] });
        const again = await source.load({ ...request, languages: [0] });
        expect(again).toBe(first);
        expect(fetchBuilds).toHaveBeenCalledTimes(1);
        await source.load({ ...request, heroId: 6, languages: [0] });
        expect(fetchBuilds).toHaveBeenCalledTimes(2);
    });

    it("asks again after a failed request", async () => {
        const fetchBuilds = vi
            .fn()
            .mockRejectedValueOnce(new Error("down"))
            .mockResolvedValue([row(1)]);
        const source = createPublicBuilds(fetchBuilds);
        await expect(source.load({ ...request, languages: [0] })).rejects.toThrow("down");
        await expect(source.load({ ...request, languages: [0] })).resolves.toHaveLength(1);
        expect(fetchBuilds).toHaveBeenCalledTimes(2);
    });
});

describe("heroParam", () => {
    it.each([
        ["?hero=13", 13],
        ["?hero=abc", null],
        ["?hero=0", null],
        ["?hero=-2", null],
        ["?hero=1.5", null],
        ["", null],
    ])("reads %s as %s", (search, hero) => {
        expect(heroParam(new URLSearchParams(search))).toBe(hero);
    });
});

describe("liveHeroId", () => {
    const player = (heroId: number | null, isYou: boolean) => ({ heroId, isYou });
    const match = (perspective: "playing" | "spectating" | "unknown", players: ReturnType<typeof player>[]) => ({
        perspective,
        teams: [{ players }],
    });

    it("is the hero of the player when playing", () => {
        expect(liveHeroId(match("playing", [player(7, false), player(31, true)]))).toBe(31);
    });

    it("is null when spectating, with no match, or before the hero is known", () => {
        expect(liveHeroId(match("spectating", [player(31, true)]))).toBeNull();
        expect(liveHeroId(null)).toBeNull();
        expect(liveHeroId(match("playing", []))).toBeNull();
        expect(liveHeroId(match("playing", [player(null, true)]))).toBeNull();
    });
});

describe("startingHero", () => {
    const heroes = [{ id: 1 }, { id: 13 }, { id: 31 }];

    it("takes the first candidate that is a known hero", () => {
        expect(startingHero(heroes, [null, 99, 31, 13])).toBe(31);
        expect(startingHero(heroes, [13, 31])).toBe(13);
    });

    it("falls back to the first hero, or null with none", () => {
        expect(startingHero(heroes, [undefined, null, 99])).toBe(1);
        expect(startingHero([], [13])).toBeNull();
    });
});
