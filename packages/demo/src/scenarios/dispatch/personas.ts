import type { ApiRoute } from "../../fetch";
import { seeded } from "../../random";
import type { Identity } from "../../scenario";
import { fakeAccountId, IDENTITY } from "../default/identity";
import type { HistoryRow } from "../default/progress";
import { badgeOf, won } from "./history";
import { heroStatsRows, inWindow, windowOf, type StatsWindow } from "./player-stats";
import { RANKED_SEASONS } from "./seasons";

export const PERSONA_IDS = ["lantern", "moth", "kettle"] as const;
export type PersonaId = (typeof PERSONA_IDS)[number];

export const personaScenarioId = (id: PersonaId) => `dispatch-specials-${id}`;

const DAY_S = 86_400;
const FIRST_MATCH_ID = 996_000_000;
const MATCH_MODE_UNRANKED = 1;
const MATCH_MODE_RANKED = 4;
const GAME_MODE_NORMAL = 1;
const OUTCOME_WIN = 1;
const OUTCOME_LOSS = 2;
const LOSS_DELTA = 300;
const NO_RANKED_FROM_S = Date.UTC(2026, 10, 5) / 1000;
const MIN_FLAT = 1000;

/** Month 0 is December 2025, the first month of the Year-End window; negative months are the history before it. */
const monthStartS = (month: number) => Date.UTC(2025, 11 + month, 1) / 1000;

type Rng = () => number;
const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

function shuffled<T>(rng: Rng, list: readonly T[]): T[] {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
}

const longestRun = (results: string) => Math.max(...(results.match(/W+|L+/g) ?? [""]).map((run) => run.length));

let mixSeed = 0;
/** `n` results with `wins` wins in a shuffled order, no run longer than `maxRun`. */
function mix(n: number, wins: number, maxRun = 3): string {
    mixSeed++;
    for (let attempt = 0; attempt < 5000; attempt++) {
        const rng = seeded(mixSeed * 7919 + attempt);
        const results = shuffled(rng, [..."W".repeat(wins), ..."L".repeat(n - wins)]).join("");
        if (longestRun(results) <= maxRun) return results;
    }
    throw new Error(`[demo] no ${n}-result order with ${wins} wins and runs of at most ${maxRun}`);
}

const run = (result: "W" | "L", n: number) => result.repeat(n);

/** One month: the matches of each sitting, and every match's result in play order. */
interface MonthSpec {
    sittings: readonly number[];
    results: string;
}

function month(sittings: readonly number[], ...parts: string[]): MonthSpec {
    const results = parts.join("");
    const total = sittings.reduce((a, b) => a + b, 0);
    if (results.length !== total) throw new Error(`[demo] ${total} matches in the sittings, ${results.length} results`);
    return { sittings, results };
}

interface HeroSpec {
    id: number;
    weight: number;
    /** The month the hero is first played; that month holds `games` games on it and nothing else. Absent: known from the start. */
    from?: number;
    games?: number;
    /** The last month the hero is played. */
    until?: number;
}

/** A friend or an enemy who turns up in a share of the player's wins and of their losses, spread evenly. */
interface CompanionSpec {
    nameIndex: number;
    inWins: number;
    inLosses: number;
    /** The first month they turn up. */
    from?: number;
}

interface BestGame {
    month: number;
    at: number;
    kills: number;
    deaths: number;
    assists: number;
}

interface PersonaSpec {
    persona: string;
    months: Readonly<Record<number, MonthSpec>>;
    heroes: readonly HeroSpec[];
    rankedShare: number;
    /** Rank points at the start of the history. */
    startFlat: number;
    /** The share of matches that start between midnight and 6 am (UTC). */
    nightShare: number;
    mates: readonly CompanionSpec[];
    enemies: readonly CompanionSpec[];
    /** Ranges of a match's kills, deaths and assists before the result shifts them; the default is 3-13, 2-10 and 3-20. */
    lines?: { kills: readonly [number, number]; deaths: readonly [number, number]; assists: readonly [number, number] };
    best?: BestGame;
}

const SALTMARSH = 17;
const COPPERHEAD = 8;

/** Lash in most games, an eleven-match run in September and eight in a row in November, a steady climb. */
const lantern = (): PersonaSpec => ({
    persona: "Lantern",
    months: {
        [-3]: month([4, 4, 4], mix(12, 6)),
        [-2]: month([4, 4, 4], mix(12, 6)),
        [-1]: month([4, 4, 4], mix(12, 6)),
        0: month([3, 3], mix(6, 3, 2)),
        1: month([3, 3], mix(6, 3, 2)),
        2: month([3, 4], mix(7, 4, 2)),
        3: month([4, 4], mix(8, 4, 2)),
        4: month([4, 4, 2], mix(10, 5, 2)),
        5: month([4, 4, 3], mix(11, 5, 2)),
        6: month([4, 4, 4], mix(12, 6, 2)),
        7: month([4, 4, 4, 3], mix(15, 8, 2)),
        8: month([5, 5, 5, 5], mix(20, 15, 3)),
        9: month([4, 4, 4, 4, 4, 4], mix(5, 3, 2), "L", run("W", 11), "L", mix(6, 4, 2)),
        10: month([4, 4, 4, 4, 4], mix(20, 15, 3)),
        11: month([2, 3, 2, 3, 2, 3, 2, 2], "L", run("W", 8), "LL", mix(8, 3, 2)),
    },
    heroes: [
        { id: 31, weight: 62 },
        { id: 1, weight: 10 },
        { id: 6, weight: 8 },
        { id: 11, weight: 7 },
        { id: 7, weight: 6 },
        { id: 12, weight: 5 },
        { id: 3, weight: 5 },
    ],
    rankedShare: 0.8,
    startFlat: 20_000,
    nightShare: 0.06,
    mates: [
        { nameIndex: 0, inWins: 0.15, inLosses: 0.15 },
        { nameIndex: 4, inWins: 0.1, inLosses: 0.1 },
    ],
    enemies: [
        { nameIndex: SALTMARSH, inWins: 0.02, inLosses: 0.03 },
        { nameIndex: 18, inWins: 0.04, inLosses: 0.04 },
        { nameIndex: 19, inWins: 0.03, inLosses: 0.03 },
    ],
    best: { month: 9, at: 11, kills: 21, deaths: 1, assists: 19 },
});

/** Twenty heroes tried across the year, four new in November, a slump on the ladder, long nights. */
const moth = (): PersonaSpec => ({
    persona: "Moth",
    months: {
        [-3]: month([3, 3, 2], mix(8, 4, 2)),
        [-2]: month([3, 3, 2], mix(8, 4, 2)),
        [-1]: month([3, 3, 2], mix(8, 4, 2)),
        0: month([3, 3], mix(6, 3, 2)),
        1: month([3, 4], mix(7, 4, 2)),
        2: month([4, 4], mix(8, 5, 2)),
        3: month([4, 4, 3], mix(11, 6, 2)),
        4: month([4, 4, 4], mix(12, 6, 2)),
        5: month([4, 4, 4], mix(12, 6, 2)),
        6: month([4, 4, 4, 3], mix(15, 7, 2)),
        7: month([4, 4, 4, 4], mix(16, 7, 2)),
        8: month([5, 5, 5, 5], mix(20, 6, 3)),
        9: month([5, 5, 5, 5], mix(20, 6, 3)),
        10: month([5, 5, 5, 5], mix(20, 7, 3)),
        11: month([2, 2, 2, 2, 2, 2, 2, 2, 2, 2], mix(20, 6, 3)),
    },
    heroes: [
        { id: 31, weight: 3 },
        { id: 1, weight: 3 },
        { id: 6, weight: 4 },
        { id: 11, weight: 3 },
        { id: 7, weight: 3 },
        { id: 12, weight: 3 },
        { id: 3, weight: 3 },
        { id: 2, weight: 3 },
        { id: 15, weight: 2, from: 1, until: 2 },
        { id: 17, weight: 2, from: 3, until: 4 },
        { id: 4, weight: 2, from: 5, until: 6 },
        { id: 27, weight: 2, from: 6, until: 7 },
        { id: 13, weight: 2, from: 7, until: 8 },
        { id: 19, weight: 2, from: 8, until: 9 },
        { id: 8, weight: 2, from: 9, until: 10 },
        { id: 10, weight: 2, from: 10, until: 10 },
        { id: 14, weight: 2, from: 11, games: 2 },
        { id: 18, weight: 2, from: 11, games: 2 },
        { id: 20, weight: 2, from: 11, games: 2 },
        { id: 25, weight: 2, from: 11, games: 2 },
    ],
    rankedShare: 0.8,
    lines: { kills: [2, 8], deaths: [4, 11], assists: [3, 12] },
    startFlat: 30_000,
    nightShare: 0.38,
    mates: [{ nameIndex: 1, inWins: 0.2, inLosses: 0.2 }],
    enemies: [
        { nameIndex: SALTMARSH, inWins: 0.02, inLosses: 0.22 },
        { nameIndex: 18, inWins: 0.06, inLosses: 0.06 },
        { nameIndex: 21, inWins: 0.05, inLosses: 0.05 },
    ],
});

/** Copperhead in six games of ten, a bad March and a great April, a six-loss run in November with a recovery after it. */
const kettle = (): PersonaSpec => ({
    persona: "Kettle",
    months: {
        [-3]: month([3, 3], mix(6, 3)),
        [-2]: month([3, 3], mix(6, 3)),
        [-1]: month([3, 3], mix(6, 3)),
        0: month([4, 4], mix(8, 4)),
        1: month([4, 4, 4], mix(12, 6)),
        2: month([4, 4, 4], mix(12, 6)),
        3: month([4, 4, 4], mix(12, 2, 4)),
        4: month([5, 5, 5, 5, 5, 4], mix(29, 23, 4)),
        5: month([5, 5, 5], mix(15, 8)),
        6: month([4, 4, 4, 4], mix(16, 8)),
        7: month([5, 5, 5, 5], mix(20, 10)),
        8: month([5, 5, 5, 5], mix(20, 4, 4)),
        9: month([4, 4, 4, 4, 4], mix(20, 5, 4)),
        10: month([7, 5, 5, 4, 4], mix(25, 17, 4)),
        11: month([3, 3, 3, 3, 3, 3, 3, 3], mix(9, 5), "W", run("L", 6), "WWWLWWWW"),
    },
    heroes: [
        { id: 1, weight: 3 },
        { id: 6, weight: 3 },
        { id: 11, weight: 3 },
        { id: 7, weight: 2 },
        { id: 12, weight: 2 },
        { id: 3, weight: 2 },
    ],
    rankedShare: 0.7,
    startFlat: 38_000,
    nightShare: 0.05,
    mates: [
        { nameIndex: COPPERHEAD, inWins: 0.6, inLosses: 0.6 },
        { nameIndex: 12, inWins: 0.1, inLosses: 0.1 },
    ],
    enemies: [
        { nameIndex: SALTMARSH, inWins: 0.03, inLosses: 0.3, from: 10 },
        { nameIndex: 19, inWins: 0.05, inLosses: 0.05 },
        { nameIndex: 20, inWins: 0.05, inLosses: 0.05 },
    ],
});

const FACTORIES: Record<PersonaId, () => PersonaSpec> = { lantern, moth, kettle };
const specs = new Map<PersonaId, PersonaSpec>();
/** Built once: `mix` numbers its shuffles in call order, so a second build would draw different results. */
function specOf(id: PersonaId): PersonaSpec {
    let spec = specs.get(id);
    if (!spec) {
        mixSeed = PERSONA_IDS.indexOf(id) * 1000;
        spec = FACTORIES[id]();
        specs.set(id, spec);
    }
    return spec;
}

/** The persona's name, as the Dispatch greets the player. */
export const personaName = (id: PersonaId) => specOf(id).persona;

interface Planned {
    startS: number;
    durationS: number;
    month: number;
    at: number;
    won: boolean;
}

function monthDays(month: number): number {
    return (monthStartS(month + 1) - monthStartS(month)) / DAY_S;
}

function evening(rng: Rng, dayStartS: number, total: number): number {
    return dayStartS + Math.min(int(rng, 16 * 3600, 19.5 * 3600), DAY_S - 600 - total);
}

function plan(spec: PersonaSpec, rng: Rng): Planned[] {
    const out: Planned[] = [];
    for (const m of Object.keys(spec.months)
        .map(Number)
        .sort((a, b) => a - b)) {
        const { sittings, results } = spec.months[m]!;
        const days = monthDays(m);
        let from = 0;
        let lastDay = -1;
        let nights = 0;
        let all = 0;
        for (const [i, size] of sittings.entries()) {
            const last = sittings.length - 1;
            const base = last === 0 ? 0 : Math.round((i * (days - 1)) / last);
            const room = last === 0 ? 0 : Math.floor((days - 1) / last) - 1;
            const jitter = i === 0 || i === last ? 0 : int(rng, 0, Math.min(2, Math.max(0, room - 3)));
            const day = Math.min(days - 1, Math.max(lastDay + 1, base - jitter));
            lastDay = day;
            const durations = Array.from({ length: size }, () => int(rng, 1200, 2400));
            const gaps = Array.from({ length: size - 1 }, () => int(rng, 180, 600));
            const total = durations.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0);
            const target = spec.nightShare * (all + size);
            const night = Math.abs(nights + size - target) < Math.abs(nights - target);
            const dayStartS = monthStartS(m) + day * DAY_S;
            let at = night ? dayStartS + int(rng, 1800, 7200) : evening(rng, dayStartS, total);
            for (let k = 0; k < size; k++) {
                out.push({
                    startS: at,
                    durationS: durations[k]!,
                    month: m,
                    at: from + k,
                    won: results[from + k] === "W",
                });
                at += durations[k]! + (gaps[k] ?? 0);
            }
            if (night) nights += size;
            all += size;
            from += size;
        }
    }
    return out;
}

/** The hero of each match in a month: shares follow the weights, the heroes new that month get their own games. */
function heroesOfMonth(spec: PersonaSpec, month: number, n: number, rng: Rng): number[] {
    const forced = spec.heroes.filter((h) => h.from === month);
    const picks = forced.flatMap((h) => Array.from({ length: h.games ?? 3 }, () => h.id)).slice(0, n);
    const pool = spec.heroes.filter(
        (h) => (h.from === undefined || h.from < month) && (h.until === undefined || h.until >= month),
    );
    const left = n - picks.length;
    const weight = pool.reduce((sum, h) => sum + h.weight, 0);
    const quotas = pool.map((h) => ({ id: h.id, exact: (left * h.weight) / weight }));
    const counts = new Map(quotas.map((q) => [q.id, Math.floor(q.exact)]));
    let missing = left - [...counts.values()].reduce((a, b) => a + b, 0);
    const byRemainder = [...quotas].sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)));
    for (const q of byRemainder) {
        if (missing-- <= 0) break;
        counts.set(q.id, counts.get(q.id)! + 1);
    }
    for (const [id, count] of counts) picks.push(...Array.from({ length: count }, () => id));
    return shuffled(rng, picks);
}

function gainForWin(streak: number): number {
    return streak <= 2 ? 300 : Math.min(370 + (streak - 3) * 20, 430);
}

function build(id: PersonaId, accountId: number): HistoryRow[] {
    const spec = specOf(id);
    const rng = seeded(0x9e3779b9 ^ ((PERSONA_IDS.indexOf(id) + 1) * 40503));
    const planned = plan(spec, rng);

    const heroOf = new Map<string, number>();
    for (const m of new Set(planned.map((p) => p.month))) {
        const count = planned.filter((p) => p.month === m).length;
        heroesOfMonth(spec, m, count, rng).forEach((hero, at) => heroOf.set(`${m}/${at}`, hero));
    }

    const kdaRange = spec.lines ?? { kills: [3, 13], deaths: [2, 10], assists: [3, 20] };
    let flat = spec.startFlat;
    let streak = 0;
    return planned.map((p, i): HistoryRow => {
        const isBest = spec.best?.month === p.month && spec.best.at === p.at;
        const share = spec.rankedShare;
        const strata = Math.floor((i + 1) * share + 0.37) > Math.floor(i * share + 0.37);
        const ranked = p.startS < NO_RANKED_FROM_S && (strata || isBest);
        const team = int(rng, 0, 1);
        let delta = 0;
        if (ranked) {
            streak = p.won ? streak + 1 : 0;
            delta = p.won ? gainForWin(streak) : -LOSS_DELTA;
            flat = Math.max(MIN_FLAT, flat + delta);
        }
        const kills = isBest ? spec.best!.kills : Math.max(0, int(rng, ...kdaRange.kills) + (p.won ? 2 : -1));
        const deaths = isBest ? spec.best!.deaths : Math.max(0, int(rng, ...kdaRange.deaths) + (p.won ? -1 : 2));
        const assists = isBest ? spec.best!.assists : int(rng, ...kdaRange.assists);
        const durationS = isBest ? 2400 : p.durationS;
        return {
            account_id: accountId,
            match_id: FIRST_MATCH_ID + i,
            hero_id: heroOf.get(`${p.month}/${p.at}`)!,
            hero_level: Math.round(16 + (durationS - 1325) / 62 + int(rng, -3, 3)),
            start_time: p.startS,
            game_mode: GAME_MODE_NORMAL,
            match_mode: ranked ? MATCH_MODE_RANKED : MATCH_MODE_UNRANKED,
            player_team: team,
            player_kills: kills,
            player_deaths: deaths,
            player_assists: assists,
            denies: int(rng, 2, 18),
            net_worth: isBest ? 60_000 : Math.round(durationS * (18 + rng() * 3) + (p.won ? 1500 : 0)),
            last_hits: Math.round(durationS * (0.07 + rng() * 0.07)),
            match_duration_s: durationS,
            match_result: p.won ? team : 1 - team,
            objectives_mask_team0: int(rng, 0, 65535),
            objectives_mask_team1: int(rng, 0, 65535),
            player_match_outcome: ranked ? (p.won ? OUTCOME_WIN : OUTCOME_LOSS) : 0,
            ranked_calibration_match: ranked ? 0 : null,
            ranked_delta: ranked ? delta : null,
            ranked_display_badge: ranked ? badgeOf(flat) : null,
            ranked_used_demotion_protection: ranked ? false : null,
            abandoned_time_s: null,
            team_abandoned: null,
            brawl_score_team0: null,
            brawl_score_team1: null,
            brawl_avg_round_time_s: null,
        };
    });
}

interface Built {
    rows: HistoryRow[];
    mates: Map<number, Set<number>>;
    enemies: Map<number, Set<number>>;
}

/** The matches a companion shows up in: the n-th win (or loss) is theirs when the running share crosses a whole number. */
function appearances(specs: readonly CompanionSpec[], oldestFirst: readonly HistoryRow[]): Map<number, Set<number>> {
    return new Map(
        specs.map((spec, k) => {
            const phase = 0.5 + 0.17 * k;
            const seen = new Set<number>();
            let wins = 0;
            let losses = 0;
            const fromS = spec.from === undefined ? -Infinity : monthStartS(spec.from);
            for (const row of oldestFirst) {
                if (row.start_time < fromS) continue;
                const win = won(row);
                const count = win ? ++wins : ++losses;
                const share = win ? spec.inWins : spec.inLosses;
                if (Math.floor(count * share + phase) > Math.floor((count - 1) * share + phase)) seen.add(row.match_id);
            }
            return [spec.nameIndex, seen];
        }),
    );
}

const built = new Map<string, Built>();

function builtOf(id: PersonaId, accountId: number): Built {
    const key = `${id}/${accountId}`;
    let b = built.get(key);
    if (!b) {
        const oldestFirst = build(id, accountId);
        const spec = specOf(id);
        b = {
            rows: [...oldestFirst].reverse(),
            mates: appearances(spec.mates, oldestFirst),
            enemies: appearances(spec.enemies, oldestFirst),
        };
        built.set(key, b);
    }
    return b;
}

/** The persona's match history, newest first. Ids and times are the same on every call. */
export function personaRows(id: PersonaId, accountId = IDENTITY.accountId): HistoryRow[] {
    return builtOf(id, accountId).rows;
}

function companions(
    identity: Identity,
    rows: readonly HistoryRow[],
    window: StatsWindow,
    appearing: Map<number, Set<number>>,
) {
    const inside = inWindow(rows, window);
    return [...appearing]
        .map(([nameIndex, ids]) => {
            const together = inside.filter((row) => ids.has(row.match_id));
            return {
                id: fakeAccountId(identity, nameIndex),
                wins: together.filter(won).length,
                matches_played: together.length,
                matches: together.map((row) => row.match_id).sort((a, b) => a - b),
            };
        })
        .filter((row) => row.matches_played > 0)
        .sort((a, b) => b.matches_played - a.matches_played || a.id - b.id);
}

/** The answers a persona's scenario serves: its history, and the Dispatch's `hero-stats`, `mate-stats` and `enemy-stats` over it. */
export function personaRoutes(id: PersonaId, identity: Identity): ApiRoute[] {
    const { rows, mates, enemies } = builtOf(id, identity.accountId);
    const accountOf = (url: URL) => Number(url.pathname.split("/")[3]);
    const own = (url: URL) => accountOf(url) === identity.accountId;
    return [
        [/^\/v1\/players\/\d+\/match-history$/, (url) => (own(url) ? rows : [])],
        [
            /^\/v1\/players\/hero-stats$/,
            (url) => {
                const ids = (url.searchParams.get("account_ids") ?? "").split(",").map(Number);
                return ids.includes(identity.accountId) ? heroStatsRows(rows, identity.accountId, windowOf(url)) : [];
            },
        ],
        [
            /^\/v1\/players\/\d+\/mate-stats$/,
            (url) =>
                own(url)
                    ? companions(identity, rows, windowOf(url), mates).map(({ id: mate, ...rest }) => ({
                          mate_id: mate,
                          ...rest,
                      }))
                    : [],
        ],
        [
            /^\/v1\/players\/\d+\/enemy-stats$/,
            (url) =>
                own(url)
                    ? companions(identity, rows, windowOf(url), enemies).map(({ id: enemy, ...rest }) => ({
                          enemy_id: enemy,
                          ...rest,
                      }))
                    : [],
        ],
        [/^\/v1\/assets\/ranked-seasons$/, () => RANKED_SEASONS],
    ];
}
