import { describe, expect, it } from "vitest";
import { bestHero, heroRows } from "./hero-rows";
import type { HeroLeaderboard } from "./leaderboard";
import type { HeroStat } from "./stats";

const stat = (heroId: number, games: number, winrate: number | null): HeroStat => ({
    heroId,
    games,
    wins: 0,
    winrate,
    kda: 0,
    avgNetWorth: 0,
    playtimeS: 0,
});
const board = (heroId: number, ready = false): HeroLeaderboard => ({ heroId, recentGames: 0, wins: 0, ready });

describe("heroRows", () => {
    it("sorts by games, then ready, then hero id", () => {
        const rows = heroRows([board(3), board(1, true), board(2), board(4)], [stat(4, 9, 0.5)], [stat(4, 9, 0.5)]);
        expect(rows.map((r) => r.heroId)).toEqual([4, 1, 2, 3]);
    });

    it("carries lifetime games when the selection has none", () => {
        const [row] = heroRows([board(1)], [], [stat(1, 7, 0.4)]);
        expect(row.stat).toBeNull();
        expect(row.lifetimeGames).toBe(7);
    });
});

describe("bestHero", () => {
    it("needs 5 games and a winrate", () => {
        expect(bestHero([stat(1, 4, 1), stat(2, 9, null)])).toBeNull();
    });
    it("picks the highest winrate", () => {
        expect(bestHero([stat(1, 5, 0.5), stat(2, 6, 0.7), stat(3, 20, 0.6)])?.heroId).toBe(2);
    });
});
