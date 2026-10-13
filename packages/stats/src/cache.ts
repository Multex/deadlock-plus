import type { RankInfo, RankTier } from "./rank";
import type { Match } from "./stats";

export interface StatsSnapshot {
    matches: Match[];
    ranks: RankTier[];
    rankInfo: RankInfo | null;
}

export interface CachedStats extends StatsSnapshot {
    at: number;
}

interface StoredStats extends CachedStats {
    accountId: number;
}

export function toStatsCache(accountId: number, at: number, snapshot: StatsSnapshot): StoredStats {
    return { accountId, at, ...snapshot };
}

export function parseStatsCache(raw: unknown, accountId: number): CachedStats | null {
    if (typeof raw !== "object" || raw === null) return null;
    const r = raw as Partial<StoredStats>;
    if (r.accountId !== accountId || typeof r.at !== "number") return null;
    if (!Array.isArray(r.matches) || !Array.isArray(r.ranks)) return null;
    return { at: r.at, matches: r.matches, ranks: r.ranks, rankInfo: r.rankInfo ?? null };
}
