import { deadlockApi } from "$lib/core/deadlock-api";
import { gradeMatch } from "$lib/features/match-history/mvp";
import { playerNames } from "$lib/features/match-history/names";
import type { DeadlockApi } from "@deadlock-plus/deadlock-api";
import type { MvpMatchGrade } from "@deadlock-plus/ipc-types/MvpMatchGrade";
import type { Companion, EditionWindow, Enrichment, GradedCandidate } from "@deadlock-plus/stats/dispatch/types";
import type { Match } from "@deadlock-plus/stats/stats";

export interface EnrichDeps {
    api: Pick<DeadlockApi, "playerHeroStats" | "mateStats" | "enemyStats">;
    gradeMatch(matchId: number): Promise<MvpMatchGrade | null>;
    names(ids: number[]): Promise<Map<number, string>>;
}

export function defaultEnrichDeps(): EnrichDeps {
    return {
        api: deadlockApi,
        gradeMatch,
        names: (ids) => playerNames.resolve(ids),
    };
}

const NAMED_PER_LIST = 5;

const attempt = async <T>(call: () => Promise<T>): Promise<T | null> => {
    try {
        return await call();
    } catch {
        return null;
    }
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const wholeId = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);

function parseCompanions(body: unknown, idKey: string): Companion[] | null {
    if (!Array.isArray(body)) return null;
    const out: Companion[] = [];
    for (const row of body) {
        if (!isRecord(row)) continue;
        const id = wholeId(row[idKey]);
        const matches = finite(row.matches_played);
        const wins = finite(row.wins);
        if (id === null || matches === null || wins === null) continue;
        if (!Number.isInteger(matches) || !Number.isInteger(wins) || matches < 1 || wins < 0 || wins > matches)
            continue;
        out.push({ accountId: id, name: null, matches, wins });
    }
    return out.sort((a, b) => b.matches - a.matches || b.wins - a.wins || a.accountId - b.accountId);
}

function parseHeroCombat(body: unknown, accountId: number) {
    if (!Array.isArray(body)) return null;
    const out: NonNullable<Enrichment["heroCombat"]> = [];
    for (const row of body) {
        if (!isRecord(row)) continue;
        const heroId = wholeId(row.hero_id);
        const matches = finite(row.matches_played);
        if (heroId === null || matches === null || matches < 1) continue;
        if (typeof row.account_id === "number" && row.account_id !== accountId) continue;
        const counts = Array.isArray(row.mvp_rank_counts) ? row.mvp_rank_counts : [];
        out.push({
            heroId,
            matches,
            damage: finite(row.total_player_damage),
            objDamagePerMin: finite(row.obj_damage_per_min),
            accuracy: finite(row.accuracy),
            critRate: finite(row.crit_shot_rate),
            mvpRankCounts: counts.filter((n): n is number => finite(n) !== null),
            mvpRated: finite(row.mvp_rated_matches) ?? 0,
        });
    }
    return out;
}

/** The enemy who beat the viewer most often, which is not always among the most-played. */
const mostLosses = (enemies: readonly Companion[]): Companion | undefined =>
    enemies.reduce<Companion | undefined>(
        (best, e) => (e.matches - e.wins > (best ? best.matches - best.wins : 0) ? e : best),
        undefined,
    );

async function gradeCandidate(match: Match, accountId: number, deps: EnrichDeps): Promise<GradedCandidate> {
    const none = { matchId: match.matchId, letter: null, s10: null, place: null };
    const found = await attempt(() => deps.gradeMatch(match.matchId));
    const own = found?.players.find((p) => p.accountId === accountId);
    return own ? { matchId: match.matchId, letter: own.letter, s10: own.s10, place: own.place } : none;
}

async function companions(window: { minS: number; maxS: number }, accountId: number, deps: EnrichDeps) {
    const [mates, enemies] = await Promise.all([
        attempt(async () => parseCompanions(await deps.api.mateStats(accountId, window), "mate_id")),
        attempt(async () => parseCompanions(await deps.api.enemyStats(accountId, window), "enemy_id")),
    ]);

    const nemesis = mostLosses(enemies ?? []);
    const wanted = [
        ...(mates ?? []).slice(0, NAMED_PER_LIST),
        ...(enemies ?? []).slice(0, NAMED_PER_LIST),
        ...(nemesis ? [nemesis] : []),
    ].map((c) => c.accountId);
    const names = wanted.length === 0 ? null : await attempt(() => deps.names([...new Set(wanted)]));

    const named = (list: Companion[] | null) =>
        list?.map((c) => ({ ...c, name: names?.get(c.accountId) ?? null })) ?? null;
    return { mates: named(mates), enemies: named(enemies) };
}

/**
 * One independent call per field: a failure leaves that field `null` and never throws. Only a handful of players
 * get names, so a big friend list costs no more than a small one.
 */
export async function enrichEdition(
    window: EditionWindow,
    accountId: number,
    candidates: readonly Match[],
    deps: EnrichDeps,
): Promise<Enrichment> {
    const range = { minS: window.startS, maxS: window.endS - 1 };
    // A Collector's Copy covers ranked games only; mate-stats and enemy-stats take no mode filter.
    const heroRange = window.kind === "collectors" ? { ...range, matchMode: ["ranked"] } : range;
    const [heroCombat, grades, people] = await Promise.all([
        attempt(async () => parseHeroCombat(await deps.api.playerHeroStats(accountId, heroRange), accountId)),
        Promise.all(candidates.map((m) => gradeCandidate(m, accountId, deps))),
        companions(range, accountId, deps),
    ]);
    return { ...people, heroCombat, grades };
}
