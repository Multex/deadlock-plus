export type Outcome = "win" | "loss" | "unscored";
export type Scope = "ranked" | "unranked" | "all";

export interface Match {
    matchId: number;
    heroId: number;
    startTime: number;
    matchMode: number;
    gameMode: number;
    outcome: Outcome;
    kills: number;
    deaths: number;
    assists: number;
    netWorth: number;
    durationS: number;
    rankBadge: number;
    rankDelta: number | null;
    calibration: boolean;
    demotionProtected: boolean;
    /** Captured from the game client; the API has not returned this match yet. */
    provisional?: boolean;
}

// ECitadelMatchMode / ECitadelGameMode values from Valve's protobufs.
const MATCH_MODE_UNRANKED = 1;
const MATCH_MODE_RANKED = 4;
const GAME_MODE_NORMAL = 1;

const DAY_S = 86_400;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function toMatch(row: unknown): Match | null {
    if (typeof row !== "object" || row === null) return null;
    const r = row as Record<string, unknown>;
    const matchId = num(r.match_id);
    const heroId = num(r.hero_id);
    const startTime = num(r.start_time);
    if (matchId === null || heroId === null || startTime === null) return null;

    // player_match_outcome: 1 win, 2 loss; penalized and not-scored rows (3-5) carry no result.
    // Unranked rows always report 0 here, but match_result (the winning team) matches player_team
    // exactly when outcome is 1 on every row that has both, so it fills the gap.
    const code = num(r.player_match_outcome);
    const winner = num(r.match_result);
    const team = num(r.player_team);
    const derived: Outcome =
        code === 0 && winner !== null && team !== null ? (winner === team ? "win" : "loss") : "unscored";
    return {
        matchId,
        heroId,
        startTime,
        matchMode: num(r.match_mode) ?? 0,
        gameMode: num(r.game_mode) ?? 0,
        outcome: code === 1 ? "win" : code === 2 ? "loss" : derived,
        kills: num(r.player_kills) ?? 0,
        deaths: num(r.player_deaths) ?? 0,
        assists: num(r.player_assists) ?? 0,
        netWorth: num(r.net_worth) ?? 0,
        durationS: num(r.match_duration_s) ?? 0,
        rankBadge: num(r.ranked_display_badge) ?? 0,
        rankDelta: num(r.ranked_delta),
        calibration: (num(r.ranked_calibration_match) ?? 0) !== 0,
        demotionProtected: r.ranked_used_demotion_protection === true,
    };
}

export function parseHistory(body: unknown): Match[] {
    if (!Array.isArray(body)) return [];
    const out: Match[] = [];
    for (const row of body) {
        const m = toMatch(row);
        if (m) out.push(m);
    }
    return out.sort((a, b) => a.startTime - b.startTime);
}

export function filterScope(matches: Match[], scope: Scope): Match[] {
    if (scope === "all") return matches;
    if (scope === "ranked") return matches.filter((m) => m.matchMode === MATCH_MODE_RANKED);
    return matches.filter((m) => m.matchMode === MATCH_MODE_UNRANKED && m.gameMode === GAME_MODE_NORMAL);
}

export function inWindow(matches: Match[], days: number | null, nowS: number): Match[] {
    if (days === null) return matches;
    const cutoff = nowS - days * DAY_S;
    return matches.filter((m) => m.startTime >= cutoff);
}

export interface WinLoss {
    games: number;
    wins: number;
    losses: number;
    unscored: number;
    winrate: number | null;
}

export function record(matches: Match[]): WinLoss {
    let wins = 0;
    let losses = 0;
    for (const m of matches) {
        if (m.outcome === "win") wins++;
        else if (m.outcome === "loss") losses++;
    }
    const scored = wins + losses;
    return {
        games: scored,
        wins,
        losses,
        unscored: matches.length - scored,
        winrate: scored > 0 ? wins / scored : null,
    };
}

export interface Streaks {
    current: { kind: "win" | "loss"; length: number } | null;
    longestWin: number;
    longestLoss: number;
}

export function streaks(matches: Match[]): Streaks {
    const scored = matches.filter((m) => m.outcome !== "unscored").sort((a, b) => a.startTime - b.startTime);
    let longestWin = 0;
    let longestLoss = 0;
    let current: Streaks["current"] = null;
    for (const m of scored) {
        const kind = m.outcome as "win" | "loss";
        current = current && current.kind === kind ? { kind, length: current.length + 1 } : { kind, length: 1 };
        if (kind === "win") longestWin = Math.max(longestWin, current.length);
        else longestLoss = Math.max(longestLoss, current.length);
    }
    return { current, longestWin, longestLoss };
}

export interface HeroStat {
    heroId: number;
    games: number;
    wins: number;
    winrate: number | null;
    kda: number;
    avgNetWorth: number;
    playtimeS: number;
}

export function heroBreakdown(matches: Match[]): HeroStat[] {
    const groups = new Map<number, Match[]>();
    for (const m of matches) {
        const list = groups.get(m.heroId);
        if (list) list.push(m);
        else groups.set(m.heroId, [m]);
    }
    const rows: HeroStat[] = [];
    for (const [heroId, list] of groups) {
        const rec = record(list);
        const kills = list.reduce((s, m) => s + m.kills, 0);
        const deaths = list.reduce((s, m) => s + m.deaths, 0);
        const assists = list.reduce((s, m) => s + m.assists, 0);
        rows.push({
            heroId,
            games: list.length,
            wins: rec.wins,
            winrate: rec.winrate,
            kda: (kills + assists) / Math.max(deaths, 1),
            avgNetWorth: list.reduce((s, m) => s + m.netWorth, 0) / list.length,
            playtimeS: list.reduce((s, m) => s + m.durationS, 0),
        });
    }
    return rows.sort((a, b) => b.games - a.games || a.heroId - b.heroId);
}

export function totalPlaytime(matches: Match[]): number {
    return matches.reduce((s, m) => s + m.durationS, 0);
}
