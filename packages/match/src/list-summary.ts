import type { Outcome } from "@deadlock-plus/stats/stats";
import type { MatchRow } from "./list";

export interface RowSummary {
    matches: number;
    wins: number;
    losses: number;
    unscored: number;
    winrate: number | null;
    kda: number | null;
    avgKills: number;
    avgDeaths: number;
    avgAssists: number;
    avgSouls: number;
    netDelta: number | null;
    topHero: { heroId: number; games: number } | null;
}

export interface FormPip {
    matchId: number;
    outcome: Outcome;
}

export interface DayGroup {
    key: string;
    startTime: number;
    wins: number;
    losses: number;
    rows: MatchRow[];
}

export const FORM_LENGTH = 10;

export const kdaRatio = (r: Pick<MatchRow, "kills" | "deaths" | "assists">) =>
    (r.kills + r.assists) / Math.max(1, r.deaths);

/** Rows are newest first; ties for the top hero go to the most recently played one. */
export function summarizeRows(rows: MatchRow[]): RowSummary {
    const n = rows.length;
    let wins = 0;
    let losses = 0;
    let unscored = 0;
    let kills = 0;
    let deaths = 0;
    let assists = 0;
    let souls = 0;
    let netDelta: number | null = null;
    const games = new Map<number, number>();

    for (const r of rows) {
        if (r.outcome === "win") wins++;
        else if (r.outcome === "loss") losses++;
        else unscored++;
        kills += r.kills;
        deaths += r.deaths;
        assists += r.assists;
        souls += r.souls;
        if (r.rankDelta !== null) netDelta = (netDelta ?? 0) + r.rankDelta;
        games.set(r.heroId, (games.get(r.heroId) ?? 0) + 1);
    }

    let topHero: RowSummary["topHero"] = null;
    for (const [heroId, count] of games) {
        if (topHero === null || count > topHero.games) topHero = { heroId, games: count };
    }

    const scored = wins + losses;
    return {
        matches: n,
        wins,
        losses,
        unscored,
        winrate: scored === 0 ? null : wins / scored,
        kda: n === 0 ? null : (kills + assists) / Math.max(1, deaths),
        avgKills: n === 0 ? 0 : kills / n,
        avgDeaths: n === 0 ? 0 : deaths / n,
        avgAssists: n === 0 ? 0 : assists / n,
        avgSouls: n === 0 ? 0 : Math.round(souls / n),
        netDelta,
        topHero,
    };
}

export function formStrip(rows: MatchRow[], limit = FORM_LENGTH): FormPip[] {
    return rows
        .slice(0, limit)
        .map((r) => ({ matchId: r.matchId, outcome: r.outcome }))
        .reverse();
}

export function dayKey(startTimeS: number): string {
    const d = new Date(startTimeS * 1000);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function groupByDay(rows: MatchRow[]): DayGroup[] {
    const groups: DayGroup[] = [];
    for (const r of rows) {
        const key = dayKey(r.startTime);
        let g = groups[groups.length - 1];
        if (g?.key !== key) {
            g = { key, startTime: r.startTime, wins: 0, losses: 0, rows: [] };
            groups.push(g);
        }
        g.rows.push(r);
        if (r.outcome === "win") g.wins++;
        else if (r.outcome === "loss") g.losses++;
    }
    return groups;
}
