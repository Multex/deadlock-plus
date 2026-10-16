import type { ApiRoute } from "../../fetch";

/** Match seconds the performance curve has a point at: every three minutes up to 15, then every five up to 50. */
const CURVE_TIMES = [180, 360, 540, 720, 900, 1200, 1500, 1800, 2100, 2400, 2700, 3000];

interface CurveShape {
    /** The average at 20 minutes. */
    at20: number;
    /** How much faster than linear the average grows. */
    growth: number;
    /** Standard deviation over average at one minute; it narrows with the square root of time. */
    spread: number;
}

/**
 * Lash at Oracle, the scenario's lobby. Objective damage spreads so wide that at 23 minutes it is still too
 * early to grade; it narrows enough by the last point.
 */
const CURVES: Record<string, CurveShape> = {
    kills: { at20: 3.84, growth: 1.15, spread: 3 },
    deaths: { at20: 3.86, growth: 1, spread: 2.4 },
    assists: { at20: 8.08, growth: 1.1, spread: 2.4 },
    net_worth: { at20: 21600, growth: 1.25, spread: 0.9 },
    player_damage: { at20: 24380, growth: 1.3, spread: 1.5 },
    boss_damage: { at20: 3250, growth: 1.5, spread: 6.2 },
    player_healing: { at20: 3290, growth: 1.1, spread: 2 },
};

const round2 = (value: number) => Math.round(value * 100) / 100;

/** `GET /v1/analytics/player-performance-curve`: cumulative averages and spreads by match time. */
export function performanceCurve(): Record<string, number>[] {
    return CURVE_TIMES.map((t) => {
        const point: Record<string, number> = { game_time: t };
        for (const [metric, { at20, growth, spread }] of Object.entries(CURVES)) {
            const avg = at20 * (t / 1200) ** growth;
            point[`${metric}_avg`] = round2(avg);
            point[`${metric}_std`] = round2((avg * spread) / Math.sqrt(t / 60));
        }
        return point;
    });
}

/** Columns: avg, std, then percentiles 1, 5, 10, 25, 50, 75, 90, 95 and 99, as the API's sketch rounds them. */
const METRICS: Record<string, readonly number[]> = {
    kills: [8.4, 5.1, 1, 2, 3, 5, 8, 11, 15, 17, 22],
    deaths: [7.1, 2.9, 2, 3, 4, 5, 7, 9, 10, 11, 14],
    assists: [11.2, 5.4, 2, 4, 5, 8, 11, 14, 17, 19, 24],
    net_worth_per_min: [1185, 220, 720, 830, 900, 1030, 1170, 1320, 1460, 1550, 1720],
    player_damage_per_min: [1240, 410, 520, 690, 780, 960, 1190, 1470, 1730, 1910, 2290],
    boss_damage_per_min: [210, 160, 20, 45, 65, 110, 180, 270, 380, 460, 640],
    player_healing_per_min: [145, 105, 12, 30, 45, 80, 130, 190, 260, 310, 420],
    // The API counts self healing twice in this one.
    healing_per_min: [262, 170, 25, 58, 84, 148, 236, 340, 470, 560, 760],
};

const PERCENTILES = [1, 5, 10, 25, 50, 75, 90, 95, 99];

/** `GET /v1/analytics/player-stats/metrics`: whole-match distributions. */
export function playerStatsMetrics(): Record<string, Record<string, number>> {
    return Object.fromEntries(
        Object.entries(METRICS).map(([key, [avg, std, ...percentiles]]) => [
            key,
            {
                avg: avg!,
                std: std!,
                ...Object.fromEntries(PERCENTILES.map((p, i) => [`percentile${p}`, percentiles[i]!])),
            },
        ]),
    );
}

/** Columns: hero, matches in one rank tier over the last 30 days, win rate. */
const HEROES: readonly (readonly number[])[] = [
    [1, 1630, 0.508],
    [2, 1180, 0.497],
    [3, 980, 0.512],
    [4, 1050, 0.489],
    [6, 1410, 0.503],
    [7, 1720, 0.495],
    [8, 870, 0.521],
    [10, 940, 0.486],
    [11, 1260, 0.517],
    [12, 1090, 0.509],
    [13, 1530, 0.494],
    [14, 610, 0.478],
    [15, 1380, 0.501],
    [16, 820, 0.492],
    [17, 1150, 0.506],
    [18, 1310, 0.498],
    [19, 760, 0.515],
    [20, 1020, 0.488],
    [25, 690, 0.502],
    [27, 1460, 0.511],
    [31, 1240, 0.507],
    [35, 930, 0.496],
    [50, 1110, 0.504],
    [52, 580, 0.483],
    [58, 1350, 0.499],
    [60, 1010, 0.513],
];

const TIERS = 11;

function tiersIn(url: URL): number {
    const min = Number(url.searchParams.get("min_average_badge") ?? 11);
    const max = Number(url.searchParams.get("max_average_badge") ?? TIERS * 10 + 6);
    return Math.max(1, Math.floor(max / 10) - Math.floor(min / 10) + 1);
}

/** `GET /v1/analytics/hero-stats`: every hero's row; more tiers in the badge range mean more matches. */
export function heroStats(url: URL): Record<string, number>[] {
    const tiers = tiersIn(url);
    return HEROES.map(([hero, perTier, winRate]) => {
        const matches = perTier! * tiers;
        const wins = Math.round(matches * winRate!);
        return { hero_id: hero!, wins, losses: matches - wins, matches, players: Math.round(matches * 0.83) };
    });
}

export const analyticsRoutes: ApiRoute[] = [
    [/^\/v1\/analytics\/player-performance-curve$/, performanceCurve],
    [/^\/v1\/analytics\/player-stats\/metrics$/, playerStatsMetrics],
    [/^\/v1\/analytics\/hero-stats$/, heroStats],
];
