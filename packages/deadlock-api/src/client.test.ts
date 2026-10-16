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
        await api.ranks();
        await api.playerMatchHistory(77);
        await api.playerRank(77);
        await api.steamProfiles([1, 2, 3]);
        await api.searchSteamProfiles("a b&c", 8);
        await api.matchMetadata(42);
        expect(fetch.mock.calls).toEqual([
            [`${BASE}/assets/heroes`],
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

    it("returns match metadata as the raw text", async () => {
        const { api } = setup(() => new Response('{"a": 1}'));
        expect(await api.matchMetadata(1)).toBe('{"a": 1}');
    });

    it("rejects a non-ok response with its status", async () => {
        const { api } = setup(() => new Response("", { status: 429 }));
        for (const call of [
            () => api.health(),
            () => api.heroes(),
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
});
