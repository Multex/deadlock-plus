import {
    DeadlockApiError,
    type CurveMetric,
    type HeroStatsRow,
    type PerformanceCurvePoint,
    type PlayerRank,
    type PlayerStatsMetrics,
} from "@deadlock-plus/deadlock-api";
import type { LiveGameMode } from "@deadlock-plus/ipc-types/LiveGameMode";
import type { LiveMatch } from "@deadlock-plus/ipc-types/LiveMatch";
import type { LivePlayer } from "@deadlock-plus/ipc-types/LivePlayer";
import type { LiveState } from "@deadlock-plus/ipc-types/LiveState";
import {
    GRADED_STATS,
    displayValues,
    type CurvePoint,
    type GradedStat,
    type GradeTargets,
    type PercentileKey,
    type StatMetrics,
} from "@deadlock-plus/stats/grades";
import { meanBadge, unrankedLobbyBadge } from "@deadlock-plus/stats/lobby-badge";
import { accountId, lobbyAccountIds } from "./lobby-ranks";

export type NoTargetsReason = "offline" | "apiDown" | "rateLimited" | "emptyData";

export type ApiGameMode = "normal" | "street_brawl";

export type GroupSource =
    | { kind: "streetBrawl" }
    | { kind: "ranked"; badge: number | null }
    | { kind: "unranked"; accountIds: number[]; you: number | null };

export interface GradeDisplay {
    values: Record<GradedStat, number>;
    selfHeal: number;
    healingTeammates: number;
}

const CURVE_METRIC: Record<GradedStat, CurveMetric> = {
    kills: "kills",
    deaths: "deaths",
    assists: "assists",
    souls: "net_worth",
    damage: "player_damage",
    objectiveDamage: "boss_damage",
    healing: "player_healing",
};

// Never `healing_per_min`: the API adds self healing into it twice.
const METRICS_KEY: Record<GradedStat, string> = {
    kills: "kills",
    deaths: "deaths",
    assists: "assists",
    souls: "net_worth_per_min",
    damage: "player_damage_per_min",
    objectiveDamage: "boss_damage_per_min",
    healing: "player_healing_per_min",
};

const PERCENTILES: PercentileKey[] = [1, 5, 10, 25, 50, 75, 90, 95, 99];

const players = (match: LiveMatch) => match.teams.flatMap((t) => t.players);

export function yourPlayer(match: LiveMatch | null): LivePlayer | null {
    return match === null ? null : (players(match).find((p) => p.isYou) ?? null);
}

export function gradesShown(state: LiveState | null, match: LiveMatch | null): boolean {
    if (state === null || match === null) return false;
    if (state.phase !== "pregame" && state.phase !== "inMatch") return false;
    if (match.matchMode !== "ranked" && match.matchMode !== "unranked") return false;
    if (match.gameMode !== "normal" && match.gameMode !== "streetBrawl") return false;
    if (match.perspective === "spectating") return false;
    const heroId = yourPlayer(match)?.heroId ?? null;
    return heroId !== null && heroId > 0;
}

export function apiGameMode(gameMode: LiveGameMode | null): ApiGameMode {
    return gameMode === "streetBrawl" ? "street_brawl" : "normal";
}

export function groupSource(match: LiveMatch): GroupSource {
    if (match.gameMode === "streetBrawl") return { kind: "streetBrawl" };
    const lobby = players(match);
    if (match.matchMode === "ranked") return { kind: "ranked", badge: meanBadge(lobby.map((p) => p.rank)) };
    return {
        kind: "unranked",
        accountIds: lobbyAccountIds(match),
        you: accountId(yourPlayer(match)?.steamId ?? null),
    };
}

export function unrankedBadge(rows: readonly PlayerRank[], you: number | null, nowSecs: number): number | null {
    const own = you === null ? null : (rows.find((r) => r.account_id === you)?.badge ?? null);
    return unrankedLobbyBadge(rows, own, nowSecs);
}

export function heroMatches(rows: readonly HeroStatsRow[], heroId: number): number {
    return rows.find((r) => r.hero_id === heroId)?.matches ?? 0;
}

function curveFor(points: readonly PerformanceCurvePoint[], metric: CurveMetric): CurvePoint[] | null {
    const out: CurvePoint[] = [];
    for (const point of points) {
        const avg = point[`${metric}_avg`];
        const std = point[`${metric}_std`];
        if (avg === null || std === null) return null;
        out.push({ t: point.game_time, avg, std });
    }
    return out;
}

function metricsFor(metrics: PlayerStatsMetrics, key: string): StatMetrics | null {
    const d = metrics[key];
    if (d === undefined || d.avg === null || d.avg <= 0) return null;
    const percentiles = {} as Record<PercentileKey, number>;
    for (const p of PERCENTILES) {
        const v = d[`percentile${p}`];
        if (v === null) return null;
        percentiles[p] = v;
    }
    return { avg: d.avg, percentiles };
}

/** Null when the filter matched no data: an empty curve, a null value, or a metric with no positive average. */
export function toTargets(curve: readonly PerformanceCurvePoint[], metrics: PlayerStatsMetrics): GradeTargets | null {
    if (curve.length === 0) return null;
    const targets = { curves: {}, metrics: {} } as GradeTargets;
    for (const stat of GRADED_STATS) {
        const c = curveFor(curve, CURVE_METRIC[stat]);
        const m = metricsFor(metrics, METRICS_KEY[stat]);
        if (c === null || m === null) return null;
        targets.curves[stat] = c;
        targets.metrics[stat] = m;
    }
    return targets;
}

export function liveValues(player: LivePlayer): Record<GradedStat, number> {
    return {
        kills: player.kills ?? 0,
        deaths: player.deaths ?? 0,
        assists: player.assists ?? 0,
        souls: player.souls ?? 0,
        damage: player.heroDamage ?? 0,
        objectiveDamage: player.objectiveDamage ?? 0,
        healing: player.healing ?? 0,
    };
}

export function gradeDisplay(player: LivePlayer, clockSecs: number): GradeDisplay {
    const healing = player.healing ?? 0;
    const selfHeal = player.selfHealing ?? 0;
    return {
        values: displayValues(liveValues(player), clockSecs),
        selfHeal,
        healingTeammates: Math.max(0, healing - selfHeal),
    };
}

/** `fetch` rejects with a TypeError when the request never reached a server. */
export function failureReason(err: unknown): Exclude<NoTargetsReason, "emptyData"> {
    if (err instanceof DeadlockApiError) return err.status === 429 ? "rateLimited" : "apiDown";
    return err instanceof TypeError ? "offline" : "apiDown";
}
