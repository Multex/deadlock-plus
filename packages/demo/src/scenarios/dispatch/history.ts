import { seeded } from "../../random";
import type { ScenarioContext } from "../../scenario";
import { historyRows, type HistoryRow } from "../default/progress";
import { SEASON_1_END_S } from "./seasons";

export const FIRST_MATCH_ID = 980_000_000;
export const LATER_FIRST_MATCH_ID = 991_000_000;

const DAY_S = 86_400;
const WEEK_DAYS = 7;
const MATCH_MODE_UNRANKED = 1;
const MATCH_MODE_RANKED = 4;
const GAME_MODE_NORMAL = 1;
const OUTCOME_WIN = 1;
const OUTCOME_LOSS = 2;

/** A Monday: the generated history starts in this week and ends the day before the default scenario's oldest match. */
export const FIRST_MONDAY_S = Date.UTC(2025, 7, 11) / 1000;

/** Weeks (counted from the first Monday) that break the usual rhythm: a holiday gap, thin weeks, one marathon. */
const WEEK_COUNTS: Readonly<Record<number, number>> = { 2: 2, 9: 1, 19: 0, 20: 1, 28: 25, 33: 2, 41: 0, 49: 2 };
/** The same for the weeks after the default history (up to 2026-12-01): a thin week after the season, and an empty one. */
const LATER_WEEK_COUNTS: Readonly<Record<number, number>> = { 62: 12, 63: 12, 64: 7, 65: 0, 66: 2, 67: 6 };
const PARTIAL_WEEK_MATCHES = 4;

/** The ladder the generated ranked matches climb: a flat total of rank points, ending where the default history starts. */
const START_FLAT = 24_500;
const END_FLAT = 50_300;
/** Where the default history leaves the ladder: its newest ranked match ends on 54 970 points, Oracle 6. */
const DEFAULT_END_FLAT = 54_970;
const WIN_DELTAS = [300, 300, 300, 370, 390, 410];
const LOSS_DELTA = -300;
const AVERAGE_WIN = 330;
const RANKED_SHARE = 0.62;
/** The later ranked rows climb to a peak in season 1 and slip back before it ends; season 2 starts a ladder over. */
const SEASON_1_PEAK_FLAT = 58_400;
const SEASON_1_END_FLAT = 55_000;
const SEASON_1_PEAK_SHARE = 0.6;
const SEASON_2_START_FLAT = 10_400;
const SEASON_2_END_FLAT = 13_900;
const POINTS_PER_TIER = 7000;
const POINTS_PER_SUBRANK = 1000;
const SUBRANKS_PER_TIER = 6;

/** Heroes the player already knows on the first day. Every hero of the default history is among them. */
const STARTING_HEROES = [31, 1, 6, 11, 12, 3, 7];
/** A hero the player first picks up in a given week: [hero id, week counted from the first Monday]. */
const NEW_HEROES: readonly (readonly [number, number])[] = [
    [2, 4],
    [15, 8],
    [17, 12],
    [4, 16],
    [13, 21],
    [19, 25],
    [8, 30],
    [10, 34],
    [14, 38],
    [18, 42],
    [20, 46],
    [25, 50],
    [27, 53],
];
const FAVOURITE_WEIGHTS: Readonly<Record<number, number>> = { 31: 5, 1: 4, 6: 3 };
const NEW_HERO_WEEKS = 2;
const NEW_HERO_WEIGHT = 3;

/** The badge the API shows for a flat rank total: seven thousand points a tier, the sixth subrank twice as long. */
export function badgeOf(flat: number): number {
    const tier = Math.floor(flat / POINTS_PER_TIER) + 1;
    const sub = Math.min(SUBRANKS_PER_TIER, Math.floor((flat % POINTS_PER_TIER) / POINTS_PER_SUBRANK) + 1);
    return tier * 10 + sub;
}

type Rng = () => number;

const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)]!;

function shuffled<T>(rng: Rng, list: readonly T[]): T[] {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
}

function duration(rng: Rng): number {
    const spread = (rng() + rng() + rng()) / 3;
    return Math.min(2700, Math.max(1200, Math.round(1200 + spread * 1500 + (rng() - 0.5) * 200)));
}

interface Planned {
    start: number;
    durationS: number;
    week: number;
    ranked: boolean;
    heroId: number;
}

function weekMatchCount(rng: Rng, week: number, dayCount: number, counts: Readonly<Record<number, number>>): number {
    if (dayCount < WEEK_DAYS) return PARTIAL_WEEK_MATCHES;
    return counts[week] ?? 3 + int(rng, 0, 9) + (rng() < 0.3 ? int(rng, 0, 9) : 0);
}

function pickHero(rng: Rng, week: number): number {
    const pool = [
        ...STARTING_HEROES.map((heroId) => ({ heroId, weight: FAVOURITE_WEIGHTS[heroId] ?? 1 })),
        ...NEW_HEROES.filter(([, from]) => from <= week).map(([heroId, from]) => ({
            heroId,
            weight: week - from < NEW_HERO_WEEKS ? NEW_HERO_WEIGHT : 1,
        })),
    ];
    let roll = rng() * pool.reduce((sum, h) => sum + h.weight, 0);
    for (const h of pool) {
        roll -= h.weight;
        if (roll < 0) return h.heroId;
    }
    return pool[pool.length - 1]!.heroId;
}

/** One day's matches back to back: an evening session or, now and then, a late-night one that starts after midnight. */
function daySession(rng: Rng, dayStart: number, count: number, week: number): Planned[] {
    const durations = Array.from({ length: count }, () => duration(rng));
    const gaps = Array.from({ length: count - 1 }, () => int(rng, 200, 700));
    const total = durations.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0);
    const night = count <= 4 && rng() < 0.14;
    const wanted = night ? int(rng, 600, 7800) : int(rng, 16 * 3600, 21 * 3600);
    let at = dayStart + Math.max(0, Math.min(wanted, DAY_S - 600 - total));
    return durations.map((durationS, i) => {
        const match: Planned = {
            start: at,
            durationS,
            week,
            ranked: rng() < RANKED_SHARE,
            heroId: pickHero(rng, week),
        };
        at += durationS + (gaps[i] ?? 0);
        return match;
    });
}

/** Plans the days from `firstDayStart` to `lastDayStart`, both midnights; weeks count from `FIRST_MONDAY_S`. */
function plan(
    rng: Rng,
    firstDayStart: number,
    lastDayStart: number,
    counts: Readonly<Record<number, number>>,
): Planned[] {
    const out: Planned[] = [];
    const firstWeek = Math.floor((firstDayStart - FIRST_MONDAY_S) / (WEEK_DAYS * DAY_S));
    for (let week = firstWeek; FIRST_MONDAY_S + week * WEEK_DAYS * DAY_S <= lastDayStart; week++) {
        const weekStart = FIRST_MONDAY_S + week * WEEK_DAYS * DAY_S;
        const days = Array.from({ length: WEEK_DAYS }, (_, d) => d).filter(
            (d) => weekStart + d * DAY_S >= firstDayStart && weekStart + d * DAY_S <= lastDayStart,
        );
        const total = weekMatchCount(rng, week, days.length, counts);
        if (total === 0) continue;
        const playDays = Math.min(days.length, Math.max(Math.ceil(total / 6), int(rng, 2, 6)));
        const chosen = shuffled(rng, days).slice(0, playDays);
        for (const [i, day] of chosen.entries()) {
            const count = Math.floor(total / playDays) + (i < total % playDays ? 1 : 0);
            if (count > 0) out.push(...daySession(rng, weekStart + day * DAY_S, count, week));
        }
    }
    return out.sort((a, b) => a.start - b.start);
}

interface Played {
    planned: Planned;
    team: number;
    won: boolean;
    delta: number;
    /** The flat rank total after a ranked match, when the play-out tracks it forward. */
    after?: number;
}

/** Decides every result. Ranked results steer toward the climb's end point, so the total gain lands near it. */
function playOut(rng: Rng, planned: readonly Planned[]): Played[] {
    const weeks = Math.max(...planned.map((p) => p.week)) + 1;
    const form = Array.from({ length: weeks }, () => (rng() - 0.5) * 0.24);
    let rankedLeft = planned.filter((p) => p.ranked).length;
    let flat = START_FLAT;
    return planned.map((p) => {
        let chance = 0.52 + form[p.week]!;
        if (p.ranked) {
            const needed = (END_FLAT - flat) / rankedLeft;
            chance = (needed - LOSS_DELTA) / (AVERAGE_WIN - LOSS_DELTA) + form[p.week]!;
        }
        const won = rng() < Math.min(0.85, Math.max(0.3, chance));
        const delta = won ? pick(rng, WIN_DELTAS) : LOSS_DELTA;
        if (p.ranked) {
            flat += delta;
            rankedLeft--;
        }
        return { planned: p, team: int(rng, 0, 1), won, delta: p.ranked ? delta : 0 };
    });
}

function toRow(rng: Rng, accountId: number, played: Played, matchId: number, finalFlat: number): HistoryRow {
    const { planned, team, won, delta } = played;
    const { durationS, ranked } = planned;
    return {
        account_id: accountId,
        match_id: matchId,
        hero_id: planned.heroId,
        hero_level: Math.round(16 + (durationS - 1325) / 62 + int(rng, -3, 3)),
        start_time: planned.start,
        game_mode: GAME_MODE_NORMAL,
        match_mode: ranked ? MATCH_MODE_RANKED : MATCH_MODE_UNRANKED,
        player_team: team,
        player_kills: Math.max(0, int(rng, 3, 13) + (won ? 2 : -1)),
        player_deaths: Math.max(0, int(rng, 2, 10) + (won ? -1 : 2)),
        player_assists: int(rng, 3, 20),
        denies: int(rng, 2, 18),
        net_worth: Math.round(durationS * (18 + rng() * 3) + (won ? 1500 : 0)),
        last_hits: Math.round(durationS * (0.07 + rng() * 0.07)),
        match_duration_s: durationS,
        match_result: won ? team : 1 - team,
        objectives_mask_team0: int(rng, 0, 65535),
        objectives_mask_team1: int(rng, 0, 65535),
        player_match_outcome: ranked ? (won ? OUTCOME_WIN : OUTCOME_LOSS) : 0,
        ranked_calibration_match: ranked ? 0 : null,
        ranked_delta: ranked ? delta : null,
        ranked_display_badge: ranked ? badgeOf(finalFlat) : null,
        ranked_used_demotion_protection: ranked ? false : null,
        abandoned_time_s: null,
        team_abandoned: null,
        brawl_score_team0: null,
        brawl_score_team1: null,
        brawl_avg_round_time_s: null,
    };
}

/**
 * About 14 months of matches that end the day before the default scenario's oldest one, oldest first, ids from
 * `FIRST_MATCH_ID` up. The ranked ones climb from Oracle 4 to the rank the default history starts at.
 */
export function olderRows(context: ScenarioContext): HistoryRow[] {
    const oldest = Math.min(...historyRows(context).map((row) => row.start_time));
    const lastDayStart = Math.floor(oldest / DAY_S) * DAY_S - DAY_S;
    const rng = seeded(context.seed ^ 0x51ed);
    const played = playOut(rng, plan(rng, FIRST_MONDAY_S, lastDayStart, WEEK_COUNTS));

    const finals = new Map<Played, number>();
    let after = END_FLAT;
    for (const p of [...played].reverse()) {
        if (!p.planned.ranked) continue;
        finals.set(p, after);
        after -= p.delta;
    }
    return played.map((p, i) => toRow(rng, context.identity.accountId, p, FIRST_MATCH_ID + i, finals.get(p) ?? 0));
}

/**
 * Decides every result of the later matches. Ranked ones steer toward a season-1 peak, then a lower end, and
 * after the season ends restart from a low rank. Wins and losses are pushed harder than in `playOut`, since
 * the swing has fewer matches to happen in.
 */
function playLater(rng: Rng, planned: readonly Planned[], startFlat: number): Played[] {
    const weeks = Math.max(...planned.map((p) => p.week)) + 1;
    const form = Array.from({ length: weeks }, () => (rng() - 0.5) * 0.24);
    const ranked = planned.filter((p) => p.ranked);
    const seasonOne = ranked.filter((p) => p.start < SEASON_1_END_S).length;
    const peakAt = Math.max(1, Math.floor(seasonOne * SEASON_1_PEAK_SHARE));
    let flat = startFlat;
    let rankedSoFar = 0;
    return planned.map((p) => {
        let chance = 0.52 + form[p.week]!;
        if (p.ranked) {
            if (rankedSoFar === seasonOne) flat = SEASON_2_START_FLAT;
            const [goal, left] =
                rankedSoFar >= seasonOne
                    ? [SEASON_2_END_FLAT, ranked.length - rankedSoFar]
                    : rankedSoFar < peakAt
                      ? [SEASON_1_PEAK_FLAT, peakAt - rankedSoFar]
                      : [SEASON_1_END_FLAT, seasonOne - rankedSoFar];
            chance = ((goal - flat) / left - LOSS_DELTA) / (AVERAGE_WIN - LOSS_DELTA) + form[p.week]!;
        }
        const won = rng() < Math.min(0.92, Math.max(0.12, chance));
        const delta = won ? pick(rng, WIN_DELTAS) : LOSS_DELTA;
        if (p.ranked) {
            flat += delta;
            rankedSoFar++;
        }
        return {
            planned: p,
            team: int(rng, 0, 1),
            won,
            delta: p.ranked ? delta : 0,
            after: p.ranked ? flat : undefined,
        };
    });
}

/** The match-history answer: the generated rows and the default ones, newest first. */
export function allRows(context: ScenarioContext): HistoryRow[] {
    return [...olderRows(context), ...historyRows(context)].sort((a, b) => b.start_time - a.start_time);
}

/** Whether the player won, read the way the app reads a row. */
export function won(row: HistoryRow): boolean {
    const scored = row.player_match_outcome;
    return scored === OUTCOME_WIN || (scored === 0 && row.match_result === row.player_team);
}

/**
 * The matches between the default history's newest and 2026-12-01, oldest first, ids from `LATER_FIRST_MATCH_ID`
 * up. `anchor` is the context the default history is built at, not the clock of the scenario that serves these.
 * Ranked rows carry on from the default history's rank.
 */
export function laterRows(anchor: ScenarioContext): HistoryRow[] {
    const newest = Math.max(...historyRows(anchor).map((row) => row.start_time));
    const firstDayStart = Math.floor(newest / DAY_S) * DAY_S + DAY_S;
    const lastDayStart = Date.UTC(2026, 11, 1) / 1000;
    const rng = seeded(anchor.seed ^ 0x7e1d);
    const played = playLater(rng, plan(rng, firstDayStart, lastDayStart, LATER_WEEK_COUNTS), DEFAULT_END_FLAT);
    return played.map((p, i) => toRow(rng, anchor.identity.accountId, p, LATER_FIRST_MATCH_ID + i, p.after ?? 0));
}

/** The match-history answer of `dispatch-specials`: generated, later and default rows, newest first. */
export function specialsRows(anchor: ScenarioContext): HistoryRow[] {
    return [...olderRows(anchor), ...laterRows(anchor), ...historyRows(anchor)].sort(
        (a, b) => b.start_time - a.start_time,
    );
}
