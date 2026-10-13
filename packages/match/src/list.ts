import type { ProvisionalMatch } from "@deadlock-plus/ipc-types/ProvisionalMatch";
import { mergeProvisional } from "@deadlock-plus/stats/provisional";
import type { Match, Outcome } from "@deadlock-plus/stats/stats";

export type RowMode = "ranked" | "unranked" | "streetBrawl" | "custom" | "bot" | "other";
export type RowSource = "api" | "provisional";

export interface MatchRow {
    matchId: number;
    heroId: number;
    outcome: Outcome;
    mode: RowMode;
    kills: number;
    deaths: number;
    assists: number;
    souls: number;
    durationS: number;
    startTime: number;
    rankBadge: number;
    rankDelta: number | null;
    calibration: boolean;
    source: RowSource;
}

// ECitadelMatchMode / ECitadelGameMode values from Valve's protobufs.
const MATCH_MODE_UNRANKED = 1;
const MATCH_MODE_PRIVATE_LOBBY = 2;
const MATCH_MODE_COOP_BOT = 3;
const MATCH_MODE_RANKED = 4;
const GAME_MODE_NORMAL = 1;
const GAME_MODE_STREET_BRAWL = 4;

export function rowMode(m: Pick<Match, "matchMode" | "gameMode">): RowMode {
    if (m.matchMode === MATCH_MODE_PRIVATE_LOBBY) return "custom";
    if (m.matchMode === MATCH_MODE_COOP_BOT) return "bot";
    if (m.gameMode === GAME_MODE_STREET_BRAWL) return "streetBrawl";
    if (m.matchMode === MATCH_MODE_RANKED) return "ranked";
    if (m.matchMode === MATCH_MODE_UNRANKED && m.gameMode === GAME_MODE_NORMAL) return "unranked";
    return "other";
}

export const toRow = (m: Match): MatchRow => ({
    matchId: m.matchId,
    heroId: m.heroId,
    outcome: m.outcome,
    mode: rowMode(m),
    kills: m.kills,
    deaths: m.deaths,
    assists: m.assists,
    souls: m.netWorth,
    durationS: m.durationS,
    startTime: m.startTime,
    rankBadge: m.rankBadge,
    rankDelta: m.rankDelta,
    calibration: m.calibration,
    source: m.provisional ? "provisional" : "api",
});

export function buildRows(api: Match[], provisional: ProvisionalMatch[]): MatchRow[] {
    return mergeProvisional(api, provisional)
        .map(toRow)
        .sort((a, b) => b.startTime - a.startTime);
}
