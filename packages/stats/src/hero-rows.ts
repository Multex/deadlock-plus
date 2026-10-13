import type { HeroLeaderboard } from "./leaderboard";
import type { HeroStat } from "./stats";

export interface HeroRow {
    heroId: number;
    stat: HeroStat | null;
    lifetimeGames: number;
    board: HeroLeaderboard;
}

export function heroRows(boards: HeroLeaderboard[], windowed: HeroStat[], lifetime: HeroStat[]): HeroRow[] {
    return boards
        .map((b) => ({
            heroId: b.heroId,
            stat: windowed.find((r) => r.heroId === b.heroId) ?? null,
            lifetimeGames: lifetime.find((r) => r.heroId === b.heroId)?.games ?? 0,
            board: b,
        }))
        .sort(
            (a, b) =>
                (b.stat?.games ?? 0) - (a.stat?.games ?? 0) ||
                Number(b.board.ready) - Number(a.board.ready) ||
                a.heroId - b.heroId,
        );
}

export const BEST_HERO_MIN_GAMES = 5;

export function bestHero(rows: HeroStat[]): HeroStat | null {
    return (
        rows
            .filter((r) => r.games >= BEST_HERO_MIN_GAMES && r.winrate !== null)
            .sort((a, b) => (b.winrate ?? 0) - (a.winrate ?? 0))[0] ?? null
    );
}
