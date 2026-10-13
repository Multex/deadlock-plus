import { gainForWin, subrankAt, type RankPoint } from "./rank";

const LOSS = 300;
const STREAK_CAP = 6;
const DAY_S = 86_400;
const TIER_POINTS = 7000;
const WINDOWS_DAYS = [14, 30];
const MIN_WINDOW_GAMES = 8;

// Expected points per game at a given winrate, treating games as independent. State s is the
// current win streak (capped at 6, where the bonus stops growing). Ignores shields, which make
// low-progress losses cheaper, so this is slightly pessimistic near a rank floor.
export function expectedPointsPerGame(winrate: number): number {
    let total = 0;
    for (let s = 0; s <= STREAK_CAP; s++) {
        const p = s < STREAK_CAP ? (1 - winrate) * winrate ** s : winrate ** STREAK_CAP;
        total += p * (winrate * gainForWin(s + 1) - (1 - winrate) * LOSS);
    }
    return total;
}

export function breakEvenWinrate(): number {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if (expectedPointsPerGame(mid) < 0) lo = mid;
        else hi = mid;
    }
    return (lo + hi) / 2;
}

export interface Eta {
    points: number;
    daysLow: number | null;
    daysHigh: number | null;
}

export interface Forecast {
    perDay: number;
    subrank: Eta;
    tier: Eta | null;
}

function eta(points: number, best: number, worst: number): Eta {
    if (best <= 0) return { points, daysLow: null, daysHigh: null };
    return {
        points,
        daysLow: Math.ceil(points / best),
        daysHigh: worst > 0 ? Math.ceil(points / worst) : null,
    };
}

// Pace is measured in points per calendar day, idle days included, over two windows. The faster
// one gives the optimistic end of the range and the slower one the cautious end.
export function climbForecast(track: RankPoint[], finalFlat: number, nowS: number): Forecast | null {
    const paces: number[] = [];
    for (const days of WINDOWS_DAYS) {
        const inside = track.filter((p) => p.startTime >= nowS - days * DAY_S);
        if (inside.length < MIN_WINDOW_GAMES) continue;
        paces.push(inside.reduce((s, p) => s + (p.delta ?? 0), 0) / days);
    }
    if (paces.length === 0) return null;

    const best = Math.max(...paces);
    const worst = Math.min(...paces);
    const sr = subrankAt(finalFlat);
    const nextSubrank = sr.start + sr.span;
    const nextTier = sr.tier * TIER_POINTS;
    return {
        perDay: paces.reduce((a, b) => a + b, 0) / paces.length,
        subrank: eta(nextSubrank - finalFlat, best, worst),
        tier: nextTier > nextSubrank ? eta(nextTier - finalFlat, best, worst) : null,
    };
}
