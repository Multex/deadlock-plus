import { describe, expect, it } from "vitest";
import { leaderboardProgress, LEADERBOARD_RULES } from "./leaderboard";
import type { Match } from "./stats";

const DAY = 86_400;
const NOW = 1_800_000_000;

const match = (over: Partial<Match> = {}): Match => ({
    matchId: 1,
    heroId: 10,
    startTime: NOW - DAY,
    matchMode: 1,
    gameMode: 1,
    outcome: "win",
    kills: 0,
    deaths: 0,
    assists: 0,
    netWorth: 0,
    durationS: 1800,
    rankBadge: 0,
    rankDelta: null,
    calibration: false,
    demotionProtected: false,
    ...over,
});

const many = (n: number, over: Partial<Match> = {}, startId = 1) =>
    Array.from({ length: n }, (_, i) => match({ ...over, matchId: startId + i }));

describe("leaderboardProgress", () => {
    it("ignores provisional matches", () => {
        const p = leaderboardProgress([match({ matchId: 1 }), match({ matchId: 2, provisional: true })], NOW);
        expect(p.totalGames).toBe(1);
        expect(p.recentGames).toBe(1);
        expect(p.heroes[0].wins).toBe(1);
    });

    it("uses the published requirements", () => {
        expect(LEADERBOARD_RULES).toEqual({
            region: { gamesInWindow: 75, windowDays: 30, totalGames: 500 },
            hero: { gamesInWindow: 30, windowDays: 30, lifetimeWins: 100, totalGames: 500 },
        });
    });

    it("counts total games and recent games, not just wins", () => {
        const old = many(3, { startTime: NOW - 40 * DAY, outcome: "loss" }, 100);
        const p = leaderboardProgress([...many(2), ...old], NOW);
        expect(p.totalGames).toBe(5);
        expect(p.recentGames).toBe(2);
    });

    it("marks the region board ready only when both bars are met", () => {
        const recentOnly = leaderboardProgress(many(75), NOW);
        expect(recentOnly.recentGames).toBe(75);
        expect(recentOnly.regionReady).toBe(false);

        const both = leaderboardProgress([...many(75), ...many(425, { startTime: NOW - 60 * DAY }, 1000)], NOW);
        expect(both.totalGames).toBe(500);
        expect(both.regionReady).toBe(true);
    });

    it("ignores bot, private and other non-queue modes", () => {
        const p = leaderboardProgress([match({ matchMode: 3 }), match({ matchMode: 2 }), match({ matchMode: 4 })], NOW);
        expect(p.totalGames).toBe(1);
    });

    it("counts Street Brawl toward the account total", () => {
        expect(leaderboardProgress([match({ gameMode: 4 }), match({ matchId: 2 })], NOW).totalGames).toBe(2);
    });

    it("counts ranked and unranked games together", () => {
        const p = leaderboardProgress([match({ matchMode: 1 }), match({ matchMode: 4, matchId: 2 })], NOW);
        expect(p.totalGames).toBe(2);
    });

    it("tracks each hero's recent games and lifetime wins separately", () => {
        const rows = leaderboardProgress(
            [
                ...many(4, { heroId: 1 }, 1),
                ...many(2, { heroId: 1, outcome: "loss" }, 50),
                ...many(3, { heroId: 1, startTime: NOW - 50 * DAY }, 100),
                ...many(1, { heroId: 2 }, 200),
            ],
            NOW,
        ).heroes;
        const one = rows.find((h) => h.heroId === 1)!;
        expect(one).toMatchObject({ recentGames: 6, wins: 7 });
        expect(rows.find((h) => h.heroId === 2)).toMatchObject({ recentGames: 1, wins: 1 });
    });

    it("does not count unscored games as wins but does count them as games", () => {
        const p = leaderboardProgress([match({ outcome: "unscored" })], NOW);
        expect(p.totalGames).toBe(1);
        expect(p.heroes[0]).toMatchObject({ recentGames: 1, wins: 0 });
    });

    it("needs all three hero bars, including the account total", () => {
        const hero = [...many(30, { heroId: 1 }, 1), ...many(70, { heroId: 1, startTime: NOW - 60 * DAY }, 100)];
        const short = leaderboardProgress(hero, NOW);
        expect(short.heroes[0]).toMatchObject({ recentGames: 30, wins: 100, ready: false });

        const filler = many(400, { heroId: 2, startTime: NOW - 60 * DAY, outcome: "loss" }, 1000);
        const full = leaderboardProgress([...hero, ...filler], NOW);
        expect(full.heroes.find((h) => h.heroId === 1)!.ready).toBe(true);
    });

    it("sorts ready heroes first, then by closeness to the bars", () => {
        const rows = leaderboardProgress(
            [...many(2, { heroId: 1 }, 1), ...many(10, { heroId: 2 }, 100), ...many(5, { heroId: 3 }, 200)],
            NOW,
        ).heroes;
        expect(rows.map((h) => h.heroId)).toEqual([2, 3, 1]);
    });

    it("returns empty progress for no matches", () => {
        expect(leaderboardProgress([], NOW)).toEqual({
            totalGames: 0,
            recentGames: 0,
            regionReady: false,
            heroes: [],
        });
    });
});
