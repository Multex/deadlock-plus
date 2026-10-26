import { deadlockApi } from "$lib/core/deadlock-api";
import { gradeMatch } from "$lib/features/match-history/mvp";
import { playerNames } from "$lib/features/match-history/names";
import { DeadlockApiError, type DeadlockApi } from "@deadlock-plus/deadlock-api";
import type { MvpMatchGrade } from "@deadlock-plus/ipc-types/MvpMatchGrade";
import {
    EDITION_RIVALS,
    type Companion,
    type EditionWindow,
    type Enrichment,
    type GradedCandidate,
    type PendingField,
} from "@deadlock-plus/stats/dispatch/types";
import type { Match } from "@deadlock-plus/stats/stats";

export interface EnrichDeps {
    api: Pick<DeadlockApi, "playerHeroStats" | "mateStats" | "enemyStats">;
    gradeMatch(matchId: number): Promise<MvpMatchGrade | null>;
    names(ids: number[]): Promise<Map<number, string>>;
    /** Defaults to a timer. */
    sleep?(ms: number): Promise<void>;
}

export type EnrichResult = Enrichment & { pending: PendingField[] };

export function defaultEnrichDeps(): EnrichDeps {
    return {
        api: deadlockApi,
        gradeMatch,
        names: (ids) => playerNames.resolve(ids),
    };
}

const NAMED_PER_LIST = 5;
const DEFAULT_WAIT_S = 5;
// An issue holds the Dispatch queue while it waits, so a long Retry-After is cut short.
const MAX_WAIT_S = 60;

const attempt = async <T>(call: () => Promise<T>): Promise<T | null> => {
    try {
        return await call();
    } catch {
        return null;
    }
};

const timer = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const transient = (e: unknown): e is DeadlockApiError =>
    e instanceof DeadlockApiError && (e.status === 429 || e.status >= 500);

type Fetched<T> = { value: T | null; turnedAway: boolean };

/** One retry after the wait the API asks for; `turnedAway` when a rate limit or outage still lost the answer. */
async function fetchTwice<T>(call: () => Promise<T>, deps: EnrichDeps): Promise<Fetched<T>> {
    try {
        return { value: await call(), turnedAway: false };
    } catch (first) {
        if (!transient(first)) return { value: null, turnedAway: false };
        await (deps.sleep ?? timer)(Math.min(first.retryAfterS ?? DEFAULT_WAIT_S, MAX_WAIT_S) * 1000);
        try {
            return { value: await call(), turnedAway: false };
        } catch (second) {
            return { value: null, turnedAway: transient(second) };
        }
    }
}

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

/** The enemies who beat the viewer most often, who are not always among the most-played. */
const mostLosses = (enemies: readonly Companion[]): Companion[] =>
    enemies
        .filter((e) => e.matches > e.wins)
        .sort((a, b) => b.matches - b.wins - (a.matches - a.wins))
        .slice(0, EDITION_RIVALS);

async function gradeCandidate(match: Match, accountId: number, deps: EnrichDeps): Promise<GradedCandidate> {
    const none = { matchId: match.matchId, letter: null, s10: null, place: null };
    const found = await attempt(() => deps.gradeMatch(match.matchId));
    const own = found?.players.find((p) => p.accountId === accountId);
    return own ? { matchId: match.matchId, letter: own.letter, s10: own.s10, place: own.place } : none;
}

async function companions(window: { minS: number; maxS: number }, accountId: number, deps: EnrichDeps) {
    const [mateRows, enemyRows] = await Promise.all([
        fetchTwice(() => deps.api.mateStats(accountId, window), deps),
        fetchTwice(() => deps.api.enemyStats(accountId, window), deps),
    ]);
    const mates = mateRows.value === null ? null : parseCompanions(mateRows.value, "mate_id");
    const enemies = enemyRows.value === null ? null : parseCompanions(enemyRows.value, "enemy_id");

    const wanted = [
        ...(mates ?? []).slice(0, NAMED_PER_LIST),
        ...(enemies ?? []).slice(0, NAMED_PER_LIST),
        ...mostLosses(enemies ?? []),
    ].map((c) => c.accountId);
    const names = wanted.length === 0 ? null : await attempt(() => deps.names([...new Set(wanted)]));

    const named = (list: Companion[] | null) =>
        list?.map((c) => ({ ...c, name: names?.get(c.accountId) ?? null })) ?? null;
    return {
        mates: named(mates),
        enemies: named(enemies),
        matesAway: mateRows.turnedAway,
        enemiesAway: enemyRows.turnedAway,
    };
}

/**
 * One independent call per field: a failure leaves that field `null` and never throws. A field lost to a rate
 * limit or an outage is listed in `pending`, so the edition can be enriched again later. Only a handful of players
 * get names, so a big friend list costs no more than a small one.
 */
export async function enrichEdition(
    window: EditionWindow,
    accountId: number,
    candidates: readonly Match[],
    deps: EnrichDeps,
): Promise<EnrichResult> {
    const range = { minS: window.startS, maxS: window.endS - 1 };
    // A Collector's Copy covers ranked games only; mate-stats and enemy-stats take no mode filter.
    const heroRange = window.kind === "collectors" ? { ...range, matchMode: ["ranked"] } : range;
    const [hero, grades, people] = await Promise.all([
        fetchTwice(() => deps.api.playerHeroStats(accountId, heroRange), deps),
        Promise.all(candidates.map((m) => gradeCandidate(m, accountId, deps))),
        companions(range, accountId, deps),
    ]);
    const lost: [PendingField, boolean][] = [
        ["mates", people.matesAway],
        ["enemies", people.enemiesAway],
        ["heroCombat", hero.turnedAway],
    ];
    return {
        mates: people.mates,
        enemies: people.enemies,
        heroCombat: hero.value === null ? null : parseHeroCombat(hero.value, accountId),
        grades,
        pending: lost.filter(([, away]) => away).map(([field]) => field),
    };
}
