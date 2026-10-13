import { apiOnly } from "./provisional";
import type { Match } from "./stats";

export const LEADERBOARD_RULES = {
    region: { gamesInWindow: 75, windowDays: 30, totalGames: 500 },
    hero: { gamesInWindow: 30, windowDays: 30, lifetimeWins: 100, totalGames: 500 },
} as const;

export interface HeroLeaderboard {
    heroId: number;
    recentGames: number;
    wins: number;
    ready: boolean;
}

export interface LeaderboardProgress {
    totalGames: number;
    recentGames: number;
    regionReady: boolean;
    heroes: HeroLeaderboard[];
}

const DAY_S = 86_400;
// ECitadelMatchMode: unranked and ranked are the real queues. Street Brawl (game mode 4) is included
// because the in-game total games count matches it. Which queues Valve counts for boards is not
// published, so the UI labels this approximate.
const COUNTED_MODES = new Set([1, 4]);

const fraction = (value: number, need: number) => Math.min(1, value / need);

export function leaderboardProgress(matches: Match[], nowS: number): LeaderboardProgress {
    const { region, hero } = LEADERBOARD_RULES;
    const regionCutoff = nowS - region.windowDays * DAY_S;
    const heroCutoff = nowS - hero.windowDays * DAY_S;

    let totalGames = 0;
    let recentGames = 0;
    const perHero = new Map<number, { recentGames: number; wins: number }>();

    for (const m of apiOnly(matches)) {
        if (!COUNTED_MODES.has(m.matchMode)) continue;
        totalGames++;
        if (m.startTime >= regionCutoff) recentGames++;

        const row = perHero.get(m.heroId) ?? { recentGames: 0, wins: 0 };
        if (m.startTime >= heroCutoff) row.recentGames++;
        if (m.outcome === "win") row.wins++;
        perHero.set(m.heroId, row);
    }

    const heroes = [...perHero].map(([heroId, row]): HeroLeaderboard => ({
        heroId,
        ...row,
        ready: row.recentGames >= hero.gamesInWindow && row.wins >= hero.lifetimeWins && totalGames >= hero.totalGames,
    }));

    const closeness = (h: HeroLeaderboard) =>
        fraction(h.recentGames, hero.gamesInWindow) +
        fraction(h.wins, hero.lifetimeWins) +
        fraction(totalGames, hero.totalGames);
    heroes.sort((a, b) => Number(b.ready) - Number(a.ready) || closeness(b) - closeness(a) || a.heroId - b.heroId);

    return {
        totalGames,
        recentGames,
        regionReady: recentGames >= region.gamesInWindow && totalGames >= region.totalGames,
        heroes,
    };
}
