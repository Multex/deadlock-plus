import { describe, expect, it, vi } from "vitest";
import type { Build, BuildsQuery } from "@deadlock-plus/deadlock-api";
import {
    browserLanguages,
    buildLanguageFor,
    createPublicBuilds,
    mergePublicBuilds,
    publicBuildsQueries,
    toPublicBuild,
} from "./public-builds";

/** Shaped like a real `/v1/builds` row: optional fields missing or null, as the API sends them. */
function row(id: number, fields: { weekly?: number; favorites?: number; updated?: number; language?: number } = {}) {
    return {
        hero_build: {
            hero_id: 13,
            hero_build_id: id,
            author_account_id: 90000007,
            name: `Build ${id}`,
            language: fields.language ?? 0,
            version: 14,
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
            publish_timestamp: 1_750_000_000,
        },
        num_favorites: fields.favorites ?? 9812,
        num_weekly_favorites: fields.weekly ?? 412,
    } satisfies Build;
}

describe("buildLanguageFor", () => {
    it("maps app locales to the API's build language names", () => {
        expect(buildLanguageFor("de")).toBe("German");
        expect(buildLanguageFor("pt-BR")).toBe("PortugueseBrazil");
        expect(buildLanguageFor("pt")).toBe("PortuguesePortugal");
        expect(buildLanguageFor("zh-CN")).toBe("ChineseSimplified");
        expect(buildLanguageFor("es")).toBe("SpanishSpain");
        expect(buildLanguageFor("en")).toBe("English");
    });

    it("has no build language for a locale the game does not publish in", () => {
        expect(buildLanguageFor("af")).toBeNull();
        expect(buildLanguageFor("zh-TW")).toBeNull();
    });
});

describe("browserLanguages", () => {
    it("is the game language plus English", () => {
        expect(browserLanguages("ru")).toEqual(["Russian", "English"]);
    });

    it("asks for English once", () => {
        expect(browserLanguages("en")).toEqual(["English"]);
        expect(browserLanguages("en-XA")).toEqual(["English"]);
        expect(browserLanguages("hu")).toEqual(["English"]);
    });
});

describe("publicBuildsQueries", () => {
    it("asks for one hero's latest versions, one query per language", () => {
        const queries = publicBuildsQueries({
            heroId: 13,
            sort: "weekly",
            search: "",
            languages: ["German", "English"],
        });
        expect(queries).toEqual([
            {
                heroId: 13,
                sortBy: "weekly_favorites",
                sortDirection: "desc",
                onlyLatest: true,
                limit: 50,
                buildLanguage: "German",
            },
            {
                heroId: 13,
                sortBy: "weekly_favorites",
                sortDirection: "desc",
                onlyLatest: true,
                limit: 50,
                buildLanguage: "English",
            },
        ]);
    });

    it("sorts all time by favourites and newest by last update", () => {
        const sortOf = (sort: "all_time" | "newest") =>
            publicBuildsQueries({ heroId: 1, sort, search: "", languages: ["English"] })[0]!.sortBy;
        expect(sortOf("all_time")).toBe("favorites");
        expect(sortOf("newest")).toBe("updated_at");
    });

    it("searches by trimmed name and leaves a blank search out", () => {
        const search = (text: string) =>
            publicBuildsQueries({ heroId: 1, sort: "weekly", search: text, languages: ["English"] })[0]!.searchName;
        expect(search("  crit ")).toBe("crit");
        expect(search("   ")).toBeUndefined();
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

    it("keeps the origin of a copied build and reads missing counts as 0", () => {
        const copy = row(2);
        copy.hero_build.origin_build_id = 381204;
        const { build, favorites, weeklyFavorites } = toPublicBuild({
            hero_build: copy.hero_build,
            num_favorites: null,
        });
        expect(build.originBuildId).toBe(381204);
        expect(favorites).toBe(0);
        expect(weeklyFavorites).toBe(0);
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
        const ids = mergePublicBuilds([german, english], "weekly").map((b) => b.build.heroBuildId);
        expect(ids).toEqual([3, 1, 4, 2]);
    });

    it("sorts all time by favourites and newest by last update", () => {
        const builds = [
            row(1, { favorites: 10, updated: 300 }),
            row(2, { favorites: 30, updated: 100 }),
            row(3, { favorites: 20, updated: 200 }),
        ].map(toPublicBuild);
        expect(mergePublicBuilds([builds], "all_time").map((b) => b.build.heroBuildId)).toEqual([2, 3, 1]);
        expect(mergePublicBuilds([builds], "newest").map((b) => b.build.heroBuildId)).toEqual([1, 3, 2]);
    });
});

describe("createPublicBuilds", () => {
    const request = { heroId: 13, sort: "weekly" as const, search: "", languages: ["German", "English"] as const };

    it("asks once per language and merges the answers", async () => {
        const fetchBuilds = vi.fn(async (q: BuildsQuery) =>
            q.buildLanguage === "German" ? [row(1, { weekly: 5, language: 1 })] : [row(2, { weekly: 9 })],
        );
        const builds = await createPublicBuilds(fetchBuilds).load({ ...request, languages: [...request.languages] });
        expect(fetchBuilds).toHaveBeenCalledTimes(2);
        expect(builds.map((b) => b.build.heroBuildId)).toEqual([2, 1]);
    });

    it("answers the same query from memory", async () => {
        const fetchBuilds = vi.fn(async () => [row(1)]);
        const source = createPublicBuilds(fetchBuilds);
        const first = await source.load({ ...request, languages: ["English"] });
        const again = await source.load({ ...request, languages: ["English"] });
        expect(again).toBe(first);
        expect(fetchBuilds).toHaveBeenCalledTimes(1);
        await source.load({ ...request, heroId: 6, languages: ["English"] });
        expect(fetchBuilds).toHaveBeenCalledTimes(2);
    });

    it("asks again after a failed request", async () => {
        const fetchBuilds = vi
            .fn()
            .mockRejectedValueOnce(new Error("down"))
            .mockResolvedValue([row(1)]);
        const source = createPublicBuilds(fetchBuilds);
        await expect(source.load({ ...request, languages: ["English"] })).rejects.toThrow("down");
        await expect(source.load({ ...request, languages: ["English"] })).resolves.toHaveLength(1);
        expect(fetchBuilds).toHaveBeenCalledTimes(2);
    });
});
