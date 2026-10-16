import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import {
    DeadlockApiError,
    type AnalyticsFilter,
    type HeroStatsRow,
    type PerformanceCurvePoint,
    type PlayerRank,
    type PlayerStatsMetrics,
    type StatDistribution,
} from "@deadlock-plus/deadlock-api";
import type { LiveMatch } from "@deadlock-plus/ipc-types/LiveMatch";
import type { LivePlayer } from "@deadlock-plus/ipc-types/LivePlayer";
import type { LiveState } from "@deadlock-plus/ipc-types/LiveState";

vi.mock("$lib/core/deadlock-api", () => ({ deadlockApi: {} }));
vi.mock("./live.svelte", () => ({ live: { state: null, match: null } }));

import { GradesStore, MAX_HERO_STATS_CALLS, RETRY_DELAYS_MS, type GradesDeps } from "./grades.svelte";

const STEAM64_OFFSET = 76561197960265728n;
const steamId = (accountId: number) => (BigInt(accountId) + STEAM64_OFFSET).toString();
const NOW_SECS = 1_800_000_000;
const HERO = 7;

class FakeLive {
    state = $state.raw<LiveState | null>(null);
    match = $state.raw<LiveMatch | null>(null);
}

function player(key: number, over: Partial<LivePlayer> = {}): LivePlayer {
    return {
        key,
        side: key % 2 === 0 ? "amber" : "sapphire",
        name: null,
        steamId: steamId(key),
        heroId: 10 + key,
        rank: 51,
        souls: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        heroDamage: 0,
        objectiveDamage: 0,
        healing: 0,
        selfHealing: 0,
        isYou: false,
        ...over,
    };
}

interface MatchOptions {
    clockSecs?: number | null;
    matchMode?: LiveMatch["matchMode"];
    gameMode?: LiveMatch["gameMode"];
    you?: Partial<LivePlayer>;
    others?: Partial<LivePlayer>;
}

function match(opts: MatchOptions = {}): LiveMatch {
    const players = [
        player(0, { heroId: HERO, isYou: true, ...opts.you }),
        ...[1, 2, 3, 4, 5].map((k) => player(k, opts.others)),
    ];
    return {
        clockSecs: opts.clockSecs === undefined ? 600 : opts.clockSecs,
        paused: false,
        matchMode: opts.matchMode ?? "ranked",
        gameMode: opts.gameMode ?? "normal",
        perspective: "playing",
        yourSide: "amber",
        teams: [
            { side: "amber", souls: 0, players: players.filter((p) => p.side === "amber") },
            { side: "sapphire", souls: 0, players: players.filter((p) => p.side === "sapphire") },
        ],
        queue: null,
    };
}

const CURVE_METRICS = ["kills", "deaths", "assists", "net_worth", "player_damage", "boss_damage", "player_healing"];
const METRIC_KEYS = [
    "kills",
    "deaths",
    "assists",
    "net_worth_per_min",
    "player_damage_per_min",
    "boss_damage_per_min",
    "player_healing_per_min",
];

function curve(lastSecs = 1200, empty = false): PerformanceCurvePoint[] {
    return [300, lastSecs].map((game_time) => {
        const point: Record<string, number | null> = { game_time };
        for (const m of CURVE_METRICS) {
            point[`${m}_avg`] = empty ? null : game_time;
            point[`${m}_std`] = empty ? null : game_time / 4;
        }
        return point as PerformanceCurvePoint;
    });
}

function metrics(): PlayerStatsMetrics {
    const percentiles = [1, 5, 10, 25, 50, 75, 90, 95, 99].map((p, i) => [`percentile${p}`, 2 + i * 2]);
    const d = Object.fromEntries([["avg", 10], ["std", 5], ...percentiles]) as unknown as StatDistribution;
    return Object.fromEntries(METRIC_KEYS.map((k) => [k, { ...d }]));
}

const heroRows = (matches: number, heroId = HERO): HeroStatsRow[] => [
    { hero_id: heroId, matches },
    { hero_id: 99, matches: 10_000 },
];

const rankRow = (account_id: number, badge: number): PlayerRank => ({
    account_id,
    badge,
    rank: Math.floor(badge / 10),
    subrank: badge % 10,
    last_match: { start_time: NOW_SECS - 86_400 },
});

const api = {
    performanceCurve: vi.fn<(heroId: number, filter: AnalyticsFilter) => Promise<PerformanceCurvePoint[]>>(),
    playerStatsMetrics: vi.fn<(heroId: number, filter: AnalyticsFilter) => Promise<PlayerStatsMetrics>>(),
    heroStats: vi.fn<(filter: AnalyticsFilter) => Promise<HeroStatsRow[]>>(),
    playerRanks: vi.fn<(ids: readonly (number | string)[]) => Promise<PlayerRank[]>>(),
};

let fake: FakeLive;
let store: GradesStore;
let stop: (() => void) | null = null;
let poll = () => {};

// Vitest compiles Svelte for the server here, where `$effect` never runs, so the store's watch is driven by hand.
const pollingWatch: GradesDeps["watch"] = (read, onChange) => {
    let last: string | null | undefined;
    poll = () => {
        const key = read();
        if (key === last) return;
        last = key;
        onChange(key);
    };
    poll();
    return () => {
        poll = () => {};
    };
};

async function settle() {
    flushSync();
    poll();
    for (let i = 0; i < 30; i++) await Promise.resolve();
}

async function show(state: LiveState["phase"], m: LiveMatch) {
    fake.state = { phase: state, matchPresent: true };
    fake.match = m;
    await settle();
}

beforeEach(() => {
    vi.useFakeTimers();
    api.performanceCurve.mockReset().mockResolvedValue(curve());
    api.playerStatsMetrics.mockReset().mockResolvedValue(metrics());
    api.heroStats.mockReset().mockResolvedValue(heroRows(500));
    api.playerRanks.mockReset().mockResolvedValue([]);
    fake = new FakeLive();
    const deps: GradesDeps = { live: fake, api, nowSecs: () => NOW_SECS, watch: pollingWatch };
    store = new GradesStore(deps);
    stop = store.start();
});

afterEach(() => {
    stop?.();
    stop = null;
    vi.useRealTimers();
});

describe("visibility", () => {
    it("is hidden with no match and asks nothing", async () => {
        await settle();
        expect(store.view).toEqual({ kind: "hidden" });
        expect(api.performanceCurve).not.toHaveBeenCalled();
    });

    it("is hidden in a bot match and asks nothing", async () => {
        await show("inMatch", match({ matchMode: "coopBot" }));
        expect(store.view.kind).toBe("hidden");
        expect(api.heroStats).not.toHaveBeenCalled();
    });

    it("hides once the match ends", async () => {
        await show("inMatch", match());
        expect(store.view.kind).toBe("graded");
        await show("postMatch", match());
        expect(store.view.kind).toBe("hidden");
    });
});

describe("first minute", () => {
    it("shows values without grades in pregame and starts fetching once your hero is known", async () => {
        await show("pregame", match({ clockSecs: null, you: { heroId: null } }));
        expect(store.view.kind).toBe("hidden");
        expect(api.performanceCurve).not.toHaveBeenCalled();

        await show("pregame", match({ clockSecs: null, you: { kills: 0, healing: 30, selfHealing: 10 } }));
        expect(store.view).toMatchObject({
            kind: "firstMinute",
            heroId: HERO,
            display: { values: { kills: 0, healing: 30 }, selfHeal: 10, healingTeammates: 20 },
        });
        expect(api.performanceCurve).toHaveBeenCalledTimes(1);
    });

    it("stays in the first-minute state through pregame whatever the clock reads", async () => {
        await show("pregame", match({ clockSecs: 90 }));
        expect(store.view.kind).toBe("firstMinute");
    });

    it("stays in the first-minute state until 1:00 even with targets", async () => {
        await show("inMatch", match({ clockSecs: 59 }));
        expect(store.view.kind).toBe("firstMinute");
        await show("inMatch", match({ clockSecs: 60 }));
        expect(store.view.kind).toBe("graded");
    });
});

describe("comparison group", () => {
    it("filters ranked by the lobby's tier, without a match mode", async () => {
        await show("inMatch", match({ matchMode: "ranked" }));
        const filter = { gameMode: "normal", minAverageBadge: 51, maxAverageBadge: 56 };
        expect(api.heroStats).toHaveBeenCalledExactlyOnceWith(filter);
        expect(api.performanceCurve).toHaveBeenCalledExactlyOnceWith(HERO, filter);
        expect(api.playerStatsMetrics).toHaveBeenCalledExactlyOnceWith(HERO, filter);
        expect(api.playerRanks).not.toHaveBeenCalled();
        expect(store.view).toMatchObject({ kind: "graded", heroId: HERO, group: { kind: "rank", tier: 5 } });
    });

    it("widens one tier each side while your hero has under 200 matches", async () => {
        api.heroStats.mockResolvedValueOnce(heroRows(120)).mockResolvedValueOnce(heroRows(250));
        await show("inMatch", match());
        expect(api.heroStats).toHaveBeenCalledTimes(2);
        expect(api.heroStats).toHaveBeenLastCalledWith({
            gameMode: "normal",
            minAverageBadge: 41,
            maxAverageBadge: 66,
        });
        expect(api.performanceCurve).toHaveBeenCalledWith(HERO, {
            gameMode: "normal",
            minAverageBadge: 41,
            maxAverageBadge: 66,
        });
        expect(store.view).toMatchObject({ kind: "graded", group: { kind: "range", fromTier: 4, toTier: 6 } });
    });

    it(`asks hero-stats at most ${MAX_HERO_STATS_CALLS} times`, async () => {
        api.heroStats.mockResolvedValue(heroRows(5));
        await show("inMatch", match({ you: { rank: 11 }, others: { rank: 11 } }));
        expect(api.heroStats).toHaveBeenCalledTimes(MAX_HERO_STATS_CALLS);
        expect(store.view.kind).toBe("graded");
    });

    it("looks up an unranked lobby's ranks in one call, yours included", async () => {
        api.playerRanks.mockResolvedValue([1, 2, 3, 4].map((id) => rankRow(id, 83)));
        await show("inMatch", match({ matchMode: "unranked", you: { rank: null }, others: { rank: null } }));
        expect(api.playerRanks).toHaveBeenCalledExactlyOnceWith([0, 1, 2, 3, 4, 5]);
        expect(api.heroStats).toHaveBeenCalledWith({ gameMode: "normal", minAverageBadge: 81, maxAverageBadge: 86 });
        expect(store.view).toMatchObject({ kind: "graded", group: { kind: "rank", tier: 8 } });
    });

    it("falls back to your own rank from the reply when too few lobby ranks are usable", async () => {
        api.playerRanks.mockResolvedValue([rankRow(0, 92), rankRow(1, 31)]);
        await show("inMatch", match({ matchMode: "unranked", you: { rank: null }, others: { rank: null } }));
        expect(store.view).toMatchObject({ kind: "graded", group: { kind: "rank", tier: 9 } });
    });

    it("compares against all ranks when no rank is known", async () => {
        await show("inMatch", match({ matchMode: "unranked", you: { rank: null }, others: { rank: null } }));
        expect(api.heroStats).not.toHaveBeenCalled();
        expect(api.performanceCurve).toHaveBeenCalledWith(HERO, { gameMode: "normal" });
        expect(store.view).toMatchObject({ kind: "graded", group: { kind: "allRanks" } });
    });

    it("uses Street Brawl data with no rank filter", async () => {
        await show("inMatch", match({ gameMode: "streetBrawl" }));
        expect(api.playerRanks).not.toHaveBeenCalled();
        expect(api.heroStats).not.toHaveBeenCalled();
        expect(api.performanceCurve).toHaveBeenCalledWith(HERO, { gameMode: "street_brawl" });
        expect(store.view).toMatchObject({ kind: "graded", group: { kind: "streetBrawl" } });
    });
});

describe("fetching and caching", () => {
    it("fetches once per hero, not on every tick", async () => {
        await show("inMatch", match({ clockSecs: 600 }));
        await show("inMatch", match({ clockSecs: 601, you: { kills: 3 } }));
        expect(api.performanceCurve).toHaveBeenCalledTimes(1);
        expect(store.view).toMatchObject({ kind: "graded", display: { values: { kills: 3 } } });
    });

    it("refetches on a hero swap and reuses the cached sample counts", async () => {
        api.heroStats.mockResolvedValue([...heroRows(500), { hero_id: 21, matches: 500 }]);
        await show("pregame", match({ clockSecs: null }));
        await show("inMatch", match({ you: { heroId: 21 } }));
        expect(api.performanceCurve.mock.calls.map(([h]) => h)).toEqual([HERO, 21]);
        expect(api.heroStats).toHaveBeenCalledTimes(1);
        expect(store.view).toMatchObject({ kind: "graded", heroId: 21 });
    });

    it("refetches with the lobby's badge when ranked ranks arrive after your hero", async () => {
        await show("pregame", match({ clockSecs: null, you: { rank: null }, others: { rank: null } }));
        expect(api.performanceCurve).toHaveBeenLastCalledWith(HERO, { gameMode: "normal" });

        await show("pregame", match({ clockSecs: null, you: { rank: 83 }, others: { rank: 83 } }));
        expect(api.performanceCurve).toHaveBeenCalledTimes(2);
        expect(api.performanceCurve).toHaveBeenLastCalledWith(HERO, {
            gameMode: "normal",
            minAverageBadge: 81,
            maxAverageBadge: 86,
        });
    });

    it("looks up unranked ranks again when players join after your hero is known", async () => {
        api.playerRanks.mockImplementation(async (ids) => ids.map((id) => rankRow(Number(id), id === 0 ? 0 : 83)));
        const early = match({ matchMode: "unranked", clockSecs: null, you: { rank: null } });
        early.teams = early.teams.map((t) => ({ ...t, players: t.players.filter((p) => p.key <= 2) }));
        await show("pregame", early);
        expect(api.playerRanks).toHaveBeenLastCalledWith([0, 1, 2]);
        expect(api.performanceCurve).toHaveBeenLastCalledWith(HERO, { gameMode: "normal" });

        await show("pregame", match({ matchMode: "unranked", clockSecs: null, you: { rank: null } }));
        expect(api.playerRanks).toHaveBeenLastCalledWith([0, 1, 2, 3, 4, 5]);
        expect(api.performanceCurve).toHaveBeenLastCalledWith(HERO, {
            gameMode: "normal",
            minAverageBadge: 81,
            maxAverageBadge: 86,
        });
    });

    it("does not restart the fetch while the group source is unchanged", async () => {
        // A restart shows "loading" until its cached reply lands, so check before any await.
        const tick = (m: LiveMatch) => {
            fake.match = m;
            flushSync();
            poll();
            return store.view.kind;
        };
        await show("inMatch", match({ clockSecs: 600 }));
        expect(tick(match({ clockSecs: 601, you: { kills: 4 }, others: { souls: 900 } }))).toBe("graded");

        await show("inMatch", match({ gameMode: "streetBrawl" }));
        expect(tick(match({ gameMode: "streetBrawl", others: { rank: 92 } }))).toBe("graded");
        expect(api.performanceCurve).toHaveBeenCalledTimes(2);
    });

    it("reuses cached targets for the same query later in the session", async () => {
        await show("inMatch", match());
        await show("menus", match());
        await show("inMatch", match());
        expect(api.performanceCurve).toHaveBeenCalledTimes(1);
        expect(api.heroStats).toHaveBeenCalledTimes(1);
        expect(store.view.kind).toBe("graded");
    });

    it("ignores a late reply for a hero you swapped away from", async () => {
        let answerFirst!: (c: PerformanceCurvePoint[]) => void;
        api.performanceCurve.mockImplementationOnce(() => new Promise((resolve) => (answerFirst = resolve)));
        api.heroStats.mockResolvedValue([...heroRows(500), { hero_id: 21, matches: 500 }]);
        await show("inMatch", match());
        api.performanceCurve.mockResolvedValue(curve(1200, true));
        await show("inMatch", match({ you: { heroId: 21 } }));
        answerFirst(curve());
        await settle();
        expect(store.view).toMatchObject({ kind: "noTargets", reason: "emptyData", heroId: 21 });
    });
});

describe("states", () => {
    it("is loading, with values, until the targets arrive", async () => {
        api.performanceCurve.mockImplementation(() => new Promise(() => {}));
        await show("inMatch", match({ you: { kills: 2 } }));
        expect(store.view).toMatchObject({ kind: "loading", heroId: HERO, display: { values: { kills: 2 } } });
    });

    it("has no targets when the API returns empty data", async () => {
        api.performanceCurve.mockResolvedValue(curve(1200, true));
        await show("inMatch", match({ you: { kills: 2 } }));
        expect(store.view).toMatchObject({ kind: "noTargets", reason: "emptyData", display: { values: { kills: 2 } } });
    });

    it("grades live values against the targets", async () => {
        await show("inMatch", match({ clockSecs: 600, you: { kills: 600 } }));
        const view = store.view;
        if (view.kind !== "graded") throw new Error(view.kind);
        expect(view.grades.stats.kills.letter).not.toBeNull();
        expect(view.grades.stats.kills.value).toBe(600);
        expect(view.frozen).toBe(false);
    });

    it("marks targets frozen past the last curve point", async () => {
        api.performanceCurve.mockResolvedValue(curve(900));
        await show("inMatch", match({ clockSecs: 1000 }));
        expect(store.view).toMatchObject({ kind: "graded", frozen: true });
    });

    it.each([
        [new TypeError("Failed to fetch"), "offline"],
        [new DeadlockApiError(429), "rateLimited"],
        [new DeadlockApiError(502), "apiDown"],
    ])("names why there are no targets: %s", async (err, reason) => {
        api.heroStats.mockRejectedValue(err);
        await show("inMatch", match());
        expect(store.view).toMatchObject({ kind: "noTargets", reason });
    });
});

describe("retry", () => {
    it(`retries after ${RETRY_DELAYS_MS.join(", ")} ms, then gives up for the match`, async () => {
        api.performanceCurve.mockRejectedValue(new TypeError("Failed to fetch"));
        await show("inMatch", match());
        expect(api.performanceCurve).toHaveBeenCalledTimes(1);

        for (const [i, delay] of RETRY_DELAYS_MS.entries()) {
            await vi.advanceTimersByTimeAsync(delay - 1);
            expect(api.performanceCurve).toHaveBeenCalledTimes(i + 1);
            await vi.advanceTimersByTimeAsync(1);
            await settle();
            expect(api.performanceCurve).toHaveBeenCalledTimes(i + 2);
            expect(store.view).toMatchObject({ kind: "noTargets", reason: "offline" });
        }

        await vi.advanceTimersByTimeAsync(10 * 60_000);
        expect(api.performanceCurve).toHaveBeenCalledTimes(RETRY_DELAYS_MS.length + 1);
        expect(store.view).toMatchObject({ kind: "noTargets", reason: "offline" });
    });

    it("grades once a retry succeeds", async () => {
        api.performanceCurve.mockRejectedValueOnce(new DeadlockApiError(503));
        await show("inMatch", match());
        expect(store.view).toMatchObject({ kind: "noTargets", reason: "apiDown" });
        await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
        await settle();
        expect(store.view.kind).toBe("graded");
    });

    it("does not cache a failure", async () => {
        api.heroStats.mockRejectedValueOnce(new DeadlockApiError(503));
        await show("inMatch", match());
        await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
        await settle();
        expect(api.heroStats).toHaveBeenCalledTimes(2);
    });

    it("stops retrying once the match ends", async () => {
        api.performanceCurve.mockRejectedValue(new TypeError("Failed to fetch"));
        await show("inMatch", match());
        await show("postMatch", match());
        await vi.advanceTimersByTimeAsync(10 * 60_000);
        expect(api.performanceCurve).toHaveBeenCalledTimes(1);
    });

    it("stops retrying after cleanup", async () => {
        api.performanceCurve.mockRejectedValue(new TypeError("Failed to fetch"));
        await show("inMatch", match());
        stop?.();
        stop = null;
        await vi.advanceTimersByTimeAsync(10 * 60_000);
        expect(api.performanceCurve).toHaveBeenCalledTimes(1);
    });
});
