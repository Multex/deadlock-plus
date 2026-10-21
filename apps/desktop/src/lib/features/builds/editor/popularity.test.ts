import type { HeroStatsRow, ItemStats } from "@deadlock-plus/deadlock-api";
import type { PopularItems } from "@deadlock-plus/ipc-types/PopularItems";
import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/core/deadlock-api", () => ({ deadlockApi: {} }));
vi.mock("$lib/features/gamedata/gamedata", () => ({ loadHeroMinimapArt: vi.fn() }));
vi.mock("$lib/features/gamedata/vdata", () => ({ loadPopularItems: vi.fn() }));
vi.mock("$lib/features/heroes/heroes", () => ({ loadHeroes: vi.fn() }));

import {
    gamePopular,
    heroMatches,
    PHASE_WINDOWS,
    phaseFilter,
    phaseStats,
    pickScore,
    type PhaseStats,
} from "./popularity";
import { HeroPopularity, type PopularityDeps } from "./popularity.svelte";

function row(item_id: number, matches: number, wins: number): ItemStats {
    return {
        item_id,
        bucket: 0,
        wins,
        losses: matches - wins,
        matches,
        players: matches,
        avg_buy_time_s: 0,
        avg_sell_time_s: 0,
        avg_buy_time_relative: 0,
        avg_sell_time_relative: 0,
    };
}

const GAME: PopularItems = {
    timestamp: 1,
    earlyGame: [
        { id: 10, className: "upgrade_a", pickPct: 39.6, winPct: 50 },
        { id: 11, className: "upgrade_b", pickPct: 20.2, winPct: 49 },
    ],
    midGame: [{ id: 10, className: "upgrade_a", pickPct: 12.4, winPct: 51 }],
    lateGame: [{ id: 12, className: "upgrade_c", pickPct: 8, winPct: 52 }],
};

describe("phase windows", () => {
    it("splits the match at 10 and 25 minutes without overlap", () => {
        expect(PHASE_WINDOWS).toEqual({
            early: { maxBoughtAtS: 599 },
            mid: { minBoughtAtS: 600, maxBoughtAtS: 1499 },
            late: { minBoughtAtS: 1500 },
        });
    });

    it("asks item-stats for one hero in one phase of normal matches", () => {
        expect(phaseFilter(7, "mid")).toEqual({
            heroIds: [7],
            gameMode: "normal",
            minBoughtAtS: 600,
            maxBoughtAtS: 1499,
        });
    });
});

describe("heroMatches", () => {
    it("reads the hero's own row, 0 when absent", () => {
        const rows: HeroStatsRow[] = [
            { hero_id: 1, matches: 50 },
            { hero_id: 7, matches: 400 },
        ];
        expect(heroMatches(rows, 7)).toBe(400);
        expect(heroMatches(rows, 9)).toBe(0);
    });
});

describe("phaseStats", () => {
    it("gives pick % of the hero's matches and win % of the matches that bought it", () => {
        const stats = phaseStats([row(10, 100, 55), row(11, 40, 10)], 400);
        const near = (n: number) => expect.closeTo(n, 9);
        expect(stats.get(10)).toEqual({ pickPct: near(25), winPct: near(55), matches: 100 });
        expect(stats.get(11)).toEqual({ pickPct: near(10), winPct: near(25), matches: 40 });
    });

    it("is empty when the hero has no matches, and skips empty rows", () => {
        expect(phaseStats([row(10, 100, 55)], 0).size).toBe(0);
        expect(phaseStats([row(10, 0, 0)], 400).has(10)).toBe(false);
    });

    it("caps pick % at 100 when the two endpoints disagree", () => {
        expect(phaseStats([row(10, 500, 250)], 400).get(10)!.pickPct).toBe(100);
    });
});

describe("gamePopular", () => {
    it("maps each popular item to its phases in game order", () => {
        const popular = gamePopular(GAME);
        expect(popular.get(10)).toEqual([
            { phase: "early", pickPct: 39.6 },
            { phase: "mid", pickPct: 12.4 },
        ]);
        expect(popular.get(12)).toEqual([{ phase: "late", pickPct: 8 }]);
        expect(popular.has(13)).toBe(false);
    });

    it("is empty without game data", () => {
        expect(gamePopular(null).size).toBe(0);
    });
});

const API: PhaseStats = {
    early: new Map([
        [10, { pickPct: 41, winPct: 52, matches: 1 }],
        [13, { pickPct: 5, winPct: 48, matches: 1 }],
    ]),
    mid: new Map([[10, { pickPct: 9, winPct: 47.5, matches: 1 }]]),
    late: new Map(),
};

describe("pickScore", () => {
    it("uses the API's pick % for the phase when it has one", () => {
        const score = pickScore("early", API, gamePopular(GAME));
        expect(score(10)).toBe(41);
        expect(score(13)).toBe(5);
    });

    it("falls back to the game's pick % without API data", () => {
        const score = pickScore("early", null, gamePopular(GAME));
        expect(score(10)).toBe(39.6);
        expect(score(11)).toBe(20.2);
        expect(score(13)).toBeUndefined();
        expect(pickScore("late", null, gamePopular(GAME))(12)).toBe(8);
    });
});

function deps(over: Partial<PopularityDeps> = {}): PopularityDeps {
    return {
        loadGame: vi.fn(async () => GAME),
        itemStats: vi.fn(async (filter) =>
            filter.maxBoughtAtS === 599 ? [row(10, 100, 50)] : filter.maxBoughtAtS === 1499 ? [row(11, 40, 20)] : [],
        ),
        heroStats: vi.fn(async () => [{ hero_id: 7, matches: 200 }]),
        loadIcon: vi.fn(async () => "icon.webp"),
        ...over,
    };
}

describe("HeroPopularity", () => {
    it("loads the game's popular set, the hero icon and API stats for all three phases", async () => {
        const d = deps();
        const store = new HeroPopularity(d);
        await store.load(7);
        expect(d.itemStats).toHaveBeenCalledTimes(3);
        expect(d.heroStats).toHaveBeenCalledWith({ gameMode: "normal" });
        expect(store.isPopular(10)).toBe(true);
        expect(store.isPopular(13)).toBe(false);
        expect(store.icon).toBe("icon.webp");
        expect(store.api?.early.get(10)?.pickPct).toBe(50);
        expect(store.api?.mid.get(11)?.pickPct).toBe(20);
        expect(store.score("early")(10)).toBe(50);
    });

    it("hides API stats when the API is unreachable but keeps the game's marker", async () => {
        const store = new HeroPopularity(deps({ heroStats: vi.fn(async () => Promise.reject(new Error("down"))) }));
        await store.load(7);
        expect(store.api).toBeNull();
        expect(store.isPopular(10)).toBe(true);
    });

    it("keeps only the newest hero's data when loads overlap", async () => {
        let release: (v: PopularItems | null) => void = () => {};
        const slow = new Promise<PopularItems | null>((r) => (release = r));
        const loadGame = vi.fn((hero: number) => (hero === 1 ? slow : Promise.resolve(null)));
        const store = new HeroPopularity(deps({ loadGame }));
        const first = store.load(1);
        await store.load(2);
        release(GAME);
        await first;
        expect(store.isPopular(10)).toBe(false);
    });
});
