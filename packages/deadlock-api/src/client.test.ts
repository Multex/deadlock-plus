import { describe, expect, it, vi } from "vitest";
import { createDeadlockApi, DeadlockApiError, DEFAULT_BASE_URL } from "./client";

const BASE = "https://api.deadlock-api.com/v1";

function setup(response: () => Response = () => Response.json({ ok: 1 })) {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => response());
    return { fetch, api: createDeadlockApi({ fetch: fetch as unknown as typeof globalThis.fetch }) };
}

describe("createDeadlockApi", () => {
    it("uses the public API unless told otherwise", async () => {
        expect(DEFAULT_BASE_URL).toBe(BASE);
        const fetch = vi.fn(async () => Response.json([]));
        const api = createDeadlockApi({ fetch: fetch as unknown as typeof globalThis.fetch, baseUrl: "http://x/v9" });
        await api.ranks();
        expect(fetch).toHaveBeenCalledWith("http://x/v9/assets/ranks");
    });

    it("requests each endpoint with the URL alone", async () => {
        const { fetch, api } = setup();
        await api.heroes();
        await api.items();
        await api.ranks();
        await api.playerMatchHistory(77);
        await api.playerRank(77);
        await api.steamProfiles([1, 2, 3]);
        await api.searchSteamProfiles("a b&c", 8);
        await api.matchMetadata(42);
        expect(fetch.mock.calls).toEqual([
            [`${BASE}/assets/heroes`],
            [`${BASE}/assets/items`],
            [`${BASE}/assets/ranks`],
            [`${BASE}/players/77/match-history`],
            [`${BASE}/players/77/rank`],
            [`${BASE}/players/steam?account_ids=1,2,3`],
            [`${BASE}/players/steam-search?search_query=a%20b%26c&limit=8`],
            [`${BASE}/matches/42/metadata`],
        ]);
    });

    it("passes the abort signal of a health check through", async () => {
        const { fetch, api } = setup();
        const signal = new AbortController().signal;
        expect(await api.health({ signal })).toEqual({ ok: 1 });
        expect(fetch).toHaveBeenCalledWith(`${BASE}/info/health`, { signal });
    });

    it("returns the parsed body of an ok response", async () => {
        const { api } = setup(() => Response.json([{ account_id: 5, personaname: "Ada" }]));
        expect(await api.steamProfiles([5])).toEqual([{ account_id: 5, personaname: "Ada" }]);
    });

    it("returns the shop item and hero level rows typed as the API sends them", async () => {
        const item = {
            id: 709540378,
            class_name: "upgrade_non_player_bonus_sacrifice",
            name: "Cultist Sacrifice",
            type: "upgrade" as const,
            item_slot_type: "weapon" as const,
            item_tier: 3,
            cost: 3200,
            is_active_item: true,
            shopable: true,
            component_items: ["upgrade_non_player_bonus"],
            shop_image_webp: "https://x/a.webp",
        };
        const hero = {
            id: 1,
            name: "Infernus",
            items: { signature1: "ability_incendiary_projectile" },
            level_info: { "1": { bonus_currencies: ["EAbilityUnlocks"], required_gold: 0 } },
        };
        const { api: itemsApi } = setup(() => Response.json([item]));
        const [row] = await itemsApi.items();
        expect(row?.component_items?.[0]).toBe("upgrade_non_player_bonus");
        expect(row?.item_slot_type).toBe("weapon");
        expect(row).toEqual(item);
        const { api: heroApi } = setup(() => Response.json([hero]));
        const [h] = await heroApi.heroes();
        expect(h?.items?.signature1).toBe("ability_incendiary_projectile");
        expect(h?.level_info?.["1"]?.required_gold).toBe(0);
        expect(h?.level_info?.["1"]?.bonus_currencies).toEqual(["EAbilityUnlocks"]);
    });

    it("returns match metadata as the raw text", async () => {
        const { api } = setup(() => new Response('{"a": 1}'));
        expect(await api.matchMetadata(1)).toBe('{"a": 1}');
    });

    it("rejects a non-ok response with its status", async () => {
        const { api } = setup(() => new Response("", { status: 429 }));
        for (const call of [
            () => api.health(),
            () => api.heroes(),
            () => api.items(),
            () => api.ranks(),
            () => api.playerRank(1),
            () => api.steamProfiles([1]),
            () => api.searchSteamProfiles("x", 1),
            () => api.matchMetadata(1),
        ]) {
            const error = await call().catch((e: unknown) => e);
            expect(error).toBeInstanceOf(DeadlockApiError);
            expect((error as DeadlockApiError).status).toBe(429);
            expect((error as DeadlockApiError).message).toBe("HTTP 429");
        }
    });

    it("lets a network failure through unchanged", async () => {
        const offline = new Error("offline");
        const api = createDeadlockApi({
            fetch: (async () => {
                throw offline;
            }) as unknown as typeof globalThis.fetch,
        });
        await expect(api.heroes()).rejects.toBe(offline);
        await expect(api.playerMatchHistory(1)).rejects.toBe(offline);
    });

    it("keeps the body of a failed match history response, which still carries the stored matches", async () => {
        const { api } = setup(() => Response.json([{ match_id: 9 }], { status: 429 }));
        expect(await api.playerMatchHistory(1)).toEqual({ ok: false, status: 429, body: [{ match_id: 9 }] });
    });

    it("reports an unreadable match history body as null", async () => {
        const { api } = setup(() => new Response("<html>", { status: 502 }));
        expect(await api.playerMatchHistory(1)).toEqual({ ok: false, status: 502, body: null });
    });

    describe("analytics", () => {
        const filter = {
            gameMode: "street_brawl",
            matchMode: ["ranked", "unranked"],
            minAverageBadge: 61,
            maxAverageBadge: 100,
        } as const;
        const query = "game_mode=street_brawl&match_mode=ranked,unranked&min_average_badge=61&max_average_badge=100";

        it("requests the performance curve for one hero", async () => {
            const { fetch, api } = setup();
            await api.performanceCurve(7, {});
            await api.performanceCurve(7, filter);
            expect(fetch.mock.calls).toEqual([
                [`${BASE}/analytics/player-performance-curve?resolution=0&hero_ids=7`],
                [`${BASE}/analytics/player-performance-curve?resolution=0&hero_ids=7&${query}`],
            ]);
        });

        it("requests the player stat metrics for one hero", async () => {
            const { fetch, api } = setup();
            await api.playerStatsMetrics(7, {});
            await api.playerStatsMetrics(7, filter);
            expect(fetch.mock.calls).toEqual([
                [`${BASE}/analytics/player-stats/metrics?hero_ids=7`],
                [`${BASE}/analytics/player-stats/metrics?hero_ids=7&${query}`],
            ]);
        });

        it("requests hero stats without a hero filter", async () => {
            const { fetch, api } = setup();
            await api.heroStats({ heroIds: [1, 2], ...filter });
            await api.heroStats({});
            const [first, second] = fetch.mock.calls.map(([url]) => url);
            expect(first).toBe(`${BASE}/analytics/hero-stats?${query}`);
            expect(second).toBe(`${BASE}/analytics/hero-stats`);
            expect(first).not.toContain("hero_ids");
        });

        it("omits undefined filter fields and empty match mode lists", async () => {
            const { fetch, api } = setup();
            await api.heroStats({ gameMode: undefined, matchMode: [], minAverageBadge: 0 });
            expect(fetch).toHaveBeenCalledWith(`${BASE}/analytics/hero-stats?min_average_badge=0`);
        });

        it("keeps a hero id from the filter out of the performance curve query", async () => {
            const { fetch, api } = setup();
            await api.performanceCurve(7, { heroIds: [1, 2] });
            expect(fetch).toHaveBeenCalledWith(`${BASE}/analytics/player-performance-curve?resolution=0&hero_ids=7`);
        });

        it("returns null-filled bodies as they came", async () => {
            const { api } = setup(() => Response.json([{ game_time: 180, kills_avg: null, kills_std: null }]));
            expect(await api.performanceCurve(7, {})).toEqual([{ game_time: 180, kills_avg: null, kills_std: null }]);
        });

        it("joins account ids when asking for player ranks", async () => {
            const { fetch, api } = setup();
            await api.playerRanks([5, "6", 7]);
            expect(fetch).toHaveBeenCalledWith(`${BASE}/players/rank?account_ids=5,6,7`);
        });

        it("rejects a non-ok analytics response with its status", async () => {
            const { api } = setup(() => new Response("", { status: 429 }));
            for (const call of [
                () => api.performanceCurve(1, {}),
                () => api.playerStatsMetrics(1, {}),
                () => api.heroStats({}),
                () => api.playerRanks([1]),
            ]) {
                const error = await call().catch((e: unknown) => e);
                expect(error).toBeInstanceOf(DeadlockApiError);
                expect((error as DeadlockApiError).status).toBe(429);
            }
        });
    });

    describe("builds", () => {
        it("requests builds without a query by default", async () => {
            const { fetch, api } = setup(() => Response.json([]));
            await api.builds({});
            expect(fetch).toHaveBeenCalledWith(`${BASE}/builds`);
        });

        it("sends each parameter under its spec name, in a fixed order", async () => {
            const { fetch, api } = setup(() => Response.json([]));
            await api.builds({
                minUnixTimestamp: 1,
                maxUnixTimestamp: 2,
                minPublishedUnixTimestamp: 3,
                maxPublishedUnixTimestamp: 4,
                sortBy: "weekly_favorites",
                start: 5,
                limit: 6,
                sortDirection: "asc",
                searchName: "a b&c",
                searchDescription: "d e",
                onlyLatest: true,
                language: 0,
                buildLanguage: "German",
                buildId: 7,
                version: 8,
                heroId: 9,
                tag: 10,
                rollupCategory: 11,
                authorId: 12,
            });
            expect(fetch).toHaveBeenCalledWith(
                `${BASE}/builds?min_unix_timestamp=1&max_unix_timestamp=2&min_published_unix_timestamp=3` +
                    "&max_published_unix_timestamp=4&sort_by=weekly_favorites&start=5&limit=6&sort_direction=asc" +
                    "&search_name=a%20b%26c&search_description=d%20e&only_latest=true&language=0" +
                    "&build_language=German&build_id=7&version=8&hero_id=9&tag=10&rollup_category=11&author_id=12",
            );
        });

        it("keeps zero and false values and drops undefined ones", async () => {
            const { fetch, api } = setup(() => Response.json([]));
            await api.builds({ heroId: 0, start: 0, onlyLatest: false, searchName: undefined });
            expect(fetch).toHaveBeenCalledWith(`${BASE}/builds?start=0&only_latest=false&hero_id=0`);
        });

        it("returns the builds as they came and rejects a failed status", async () => {
            const body = [{ hero_build: { hero_id: 1, details: { mod_categories: [] } }, num_favorites: null }];
            expect(await setup(() => Response.json(body)).api.builds({})).toEqual(body);
            const error = await setup(() => new Response("", { status: 429 }))
                .api.builds({})
                .catch((e: unknown) => e);
            expect((error as DeadlockApiError).status).toBe(429);
        });
    });

    describe("item stats", () => {
        it("requests item stats without a query by default", async () => {
            const { fetch, api } = setup(() => Response.json([]));
            await api.itemStats({});
            expect(fetch).toHaveBeenCalledWith(`${BASE}/analytics/item-stats`);
        });

        it("sends the shared analytics filter first, then the item parameters", async () => {
            const { fetch, api } = setup(() => Response.json([]));
            await api.itemStats({
                heroIds: [7],
                gameMode: "normal",
                matchMode: ["ranked"],
                minAverageBadge: 61,
                maxAverageBadge: 100,
                bucket: "game_time_min",
                enemyHeroIds: [1, 2],
                enemyHeroIdsAllMatch: true,
                minEnemyNetworth: 10,
                maxEnemyNetworth: 20,
                sameLaneFilter: false,
                minUnixTimestamp: 30,
                maxUnixTimestamp: 40,
                minDurationS: 50,
                maxDurationS: 60,
                minNetworth: 70,
                maxNetworth: 80,
                minMatchId: 90,
                maxMatchId: 100,
                includeItemIds: [3, 4],
                excludeItemIds: [5],
                abilityOrderPrefix: [6, 7],
                abilityUnlockOrderPrefix: [8, 9],
                heroBuildId: 110,
                minMatches: 120,
                maxMatches: 130,
                accountIds: [140, 150],
                minBoughtAtS: 160,
                maxBoughtAtS: 170,
                itemOrder: [
                    [1, 2],
                    [3, 4, 5],
                ],
                corruptedItems: "only",
                enhancedItems: "exclude",
            });
            expect(fetch).toHaveBeenCalledWith(
                `${BASE}/analytics/item-stats?hero_ids=7&game_mode=normal&match_mode=ranked` +
                    "&min_average_badge=61&max_average_badge=100&bucket=game_time_min&enemy_hero_ids=1,2" +
                    "&enemy_hero_ids_all_match=true&min_enemy_networth=10&max_enemy_networth=20" +
                    "&same_lane_filter=false&min_unix_timestamp=30&max_unix_timestamp=40&min_duration_s=50" +
                    "&max_duration_s=60&min_networth=70&max_networth=80&min_match_id=90&max_match_id=100" +
                    "&include_item_ids=3,4&exclude_item_ids=5&ability_order_prefix=6,7" +
                    "&ability_unlock_order_prefix=8,9&hero_build_id=110&min_matches=120&max_matches=130" +
                    "&account_ids=140,150&min_bought_at_s=160&max_bought_at_s=170&item_order=1,2&item_order=3,4,5" +
                    "&corrupted_items=only&enhanced_items=exclude",
            );
        });

        it("drops empty lists and keeps zero values", async () => {
            const { fetch, api } = setup(() => Response.json([]));
            await api.itemStats({ includeItemIds: [], itemOrder: [], minBoughtAtS: 0, minMatches: 1 });
            expect(fetch).toHaveBeenCalledWith(`${BASE}/analytics/item-stats?min_matches=1&min_bought_at_s=0`);
        });

        it("returns the rows as they came and rejects a failed status", async () => {
            const body = [{ item_id: 1, bucket: 0, wins: 2, losses: 1, matches: 3, players: 3 }];
            expect(await setup(() => Response.json(body)).api.itemStats({})).toEqual(body);
            const error = await setup(() => new Response("", { status: 500 }))
                .api.itemStats({})
                .catch((e: unknown) => e);
            expect((error as DeadlockApiError).status).toBe(500);
        });
    });
});
