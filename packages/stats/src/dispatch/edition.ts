import type { MvpLetter } from "@deadlock-plus/ipc-types/MvpLetter";
import { rankTrack } from "../rank";
import { groupSessions, summarizeSession } from "../sessions";
import { heroBreakdown, record, streaks, totalPlaytime, type Match } from "../stats";
import { detectDispatchStories } from "./stories";
import {
    BEST_GAME_CANDIDATES,
    EDITION_SCHEMA,
    MIN_EDITION_MATCHES,
    type BestGame,
    type BuildInput,
    type Companion,
    type Edition,
    type EditionDay,
    type EditionMonth,
    type EditionRank,
    type EditionStats,
    type EditionWindow,
    type GradedCandidate,
    type RankPoint,
} from "./types";

// ECitadelMatchMode / ECitadelGameMode values from Valve's protobufs.
const MATCH_MODE_UNRANKED = 1;
const MATCH_MODE_RANKED = 4;
const GAME_MODE_NORMAL = 1;
const MIN_GRADABLE_S = 600;
const NIGHT_END_HOUR = 6;
const MIN_NEMESIS_LOSSES = 2;

const LETTERS: readonly MvpLetter[] = [
    "S+",
    "S",
    "S-",
    "A+",
    "A",
    "A-",
    "B+",
    "B",
    "B-",
    "C+",
    "C",
    "C-",
    "D+",
    "D",
    "D-",
    "E+",
    "E",
    "E-",
    "F",
];

interface LocalTime {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
}

const formats = new Map<string, Intl.DateTimeFormat>();

function localTime(unixS: number, tz: string): LocalTime {
    let f = formats.get(tz);
    if (!f) {
        f = new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            hourCycle: "h23",
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
        });
        formats.set(tz, f);
    }
    const parts: Record<string, number> = {};
    for (const p of f.formatToParts(unixS * 1000)) if (p.type !== "literal") parts[p.type] = Number(p.value);
    return {
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hour: parts.hour,
        minute: parts.minute,
        second: parts.second,
    };
}

const offsetS = (unixS: number, tz: string) => {
    const l = localTime(unixS, tz);
    return Date.UTC(l.year, l.month - 1, l.day, l.hour, l.minute, l.second) / 1000 - unixS;
};

// The offset is read twice because local midnight can sit on the other side of a DST change
// from the naive UTC guess.
function localMidnight(l: Pick<LocalTime, "year" | "month" | "day">, tz: string): number {
    const naive = Date.UTC(l.year, l.month - 1, l.day) / 1000;
    return naive - offsetS(naive - offsetS(naive, tz), tz);
}

const kda = (m: Match) => (m.kills + m.assists) / Math.max(1, m.deaths);
const byKda = (a: Match, b: Match) => kda(b) - kda(a) || b.netWorth - a.netWorth || a.startTime - b.startTime;

const gradable = (m: Match) =>
    m.gameMode === GAME_MODE_NORMAL &&
    (m.matchMode === MATCH_MODE_RANKED || m.matchMode === MATCH_MODE_UNRANKED) &&
    m.durationS >= MIN_GRADABLE_S;

const toBestGame = (m: Match, grade: GradedCandidate | undefined): BestGame => ({
    matchId: m.matchId,
    heroId: m.heroId,
    kills: m.kills,
    deaths: m.deaths,
    assists: m.assists,
    netWorth: m.netWorth,
    startTime: m.startTime,
    letter: grade?.letter ?? null,
    place: grade?.place ?? null,
});

function byGrade(a: GradedCandidate | undefined, b: GradedCandidate | undefined): number {
    const la = a?.letter ? LETTERS.indexOf(a.letter) : LETTERS.length;
    const lb = b?.letter ? LETTERS.indexOf(b.letter) : LETTERS.length;
    if (la !== lb) return la - lb;
    if (la === LETTERS.length) return 0;
    return (b?.s10 ?? -Infinity) - (a?.s10 ?? -Infinity) || (a?.place ?? Infinity) - (b?.place ?? Infinity);
}

/** The window's matches, oldest first; a Collector's Copy keeps only ranked matches. */
export function windowRows(history: readonly Match[], window: EditionWindow): Match[] {
    const rankedOnly = window.kind === "collectors";
    return history
        .filter(
            (m) =>
                m.startTime >= window.startS &&
                m.startTime < window.endS &&
                (!rankedOnly || m.matchMode === MATCH_MODE_RANKED),
        )
        .sort((a, b) => a.startTime - b.startTime);
}

/** Up to `n` gradable matches with the best KDA, net worth breaking ties. */
export function bestGameCandidates(rows: readonly Match[], n: number): Match[] {
    return rows.filter(gradable).sort(byKda).slice(0, n);
}

/** The candidate with the best grade; KDA order when no candidate has one. */
export function pickBestGame(candidates: readonly Match[], grades: readonly GradedCandidate[] | null): BestGame | null {
    const byId = new Map((grades ?? []).map((g) => [g.matchId, g]));
    const best = [...candidates]
        .sort(byKda)
        .map((m) => ({ m, g: byId.get(m.matchId) }))
        .sort((x, y) => byGrade(x.g, y.g))[0];
    return best ? toBestGame(best.m, best.g) : null;
}

function editionStats(rows: Match[], tz: string): EditionStats & EditionCalendar {
    const rec = record(rows);
    const longestSession = groupSessions(rows)
        .map((s) => ({ matches: s.matches.length, ...summarizeSession(s) }))
        .reduce<EditionStats["longestSession"]>(
            (best, s) =>
                !best || s.matches > best.matches || (s.matches === best.matches && s.durationS > best.durationS)
                    ? { matches: s.matches, startS: s.startTime, durationS: s.durationS }
                    : best,
            null,
        );

    const days = new Map<string, { dayStartS: number; matches: number }>();
    let night = 0;
    for (const m of rows) {
        const l = localTime(m.startTime, tz);
        if (l.hour < NIGHT_END_HOUR) night++;
        const key = `${l.year}-${l.month}-${l.day}`;
        const day = days.get(key);
        if (day) day.matches++;
        else days.set(key, { dayStartS: localMidnight(l, tz), matches: 1 });
    }
    const busiestDay = [...days.values()].reduce<EditionStats["busiestDay"]>(
        (best, d) =>
            !best || d.matches > best.matches || (d.matches === best.matches && d.dayStartS < best.dayStartS)
                ? d
                : best,
        null,
    );

    return {
        matches: rows.length,
        wins: rec.wins,
        losses: rec.losses,
        unscored: rec.unscored,
        winrate: rec.winrate,
        playtimeS: totalPlaytime(rows),
        kills: rows.reduce((s, m) => s + m.kills, 0),
        deaths: rows.reduce((s, m) => s + m.deaths, 0),
        assists: rows.reduce((s, m) => s + m.assists, 0),
        netWorth: rows.reduce((s, m) => s + m.netWorth, 0),
        longestMatchS: Math.max(0, ...rows.map((m) => m.durationS)),
        longestSession,
        busiestDay,
        nightShare: rows.length ? night / rows.length : null,
        ...editionCalendar(rows, tz),
    };
}

/** Calendar totals the stories of longer editions need; `busiestMonth` ties go to the earlier month. */
export interface EditionCalendar {
    /** Distinct local days with at least one match. */
    daysPlayed: number;
    busiestMonth: { monthStartS: number; matches: number } | null;
}

export function editionCalendar(rows: readonly Match[], tz: string): EditionCalendar {
    const days = new Set<string>();
    const months = new Map<string, { monthStartS: number; matches: number }>();
    for (const r of rows) {
        const l = localTime(r.startTime, tz);
        days.add(`${l.year}-${l.month}-${l.day}`);
        const key = `${l.year}-${l.month}`;
        const month = months.get(key);
        if (month) month.matches++;
        else months.set(key, { monthStartS: localMidnight({ ...l, day: 1 }, tz), matches: 1 });
    }
    const busiestMonth = [...months.values()].reduce<EditionCalendar["busiestMonth"]>(
        (best, mo) =>
            !best || mo.matches > best.matches || (mo.matches === best.matches && mo.monthStartS < best.monthStartS)
                ? mo
                : best,
        null,
    );
    return { daysPlayed: days.size, busiestMonth };
}

/** Heroes first played inside the window across the whole history, and played in `rows`. */
function newHeroes(history: readonly Match[], window: EditionWindow, rows: readonly Match[]): number[] {
    const played = new Set(rows.map((r) => r.heroId));
    const first = new Map<number, number>();
    for (const m of history) {
        const seen = first.get(m.heroId);
        if (seen === undefined || m.startTime < seen) first.set(m.heroId, m.startTime);
    }
    return [...first]
        .filter(([heroId, t]) => t >= window.startS && t < window.endS && played.has(heroId))
        .sort((a, b) => a[1] - b[1] || a[0] - b[0])
        .map(([heroId]) => heroId);
}

const dayKey = (l: Pick<LocalTime, "year" | "month" | "day">) => `${l.year}-${l.month}-${l.day}`;
const monthKey = (l: Pick<LocalTime, "year" | "month">) => `${l.year}-${l.month}`;

function tally<T extends { matches: number; wins: number }>(
    buckets: Map<string, T>,
    rows: readonly Match[],
    tz: string,
    key: (l: LocalTime) => string,
): T[] {
    for (const r of rows) {
        const bucket = buckets.get(key(localTime(r.startTime, tz)));
        if (!bucket) continue;
        bucket.matches++;
        if (r.outcome === "win") bucket.wins++;
    }
    return [...buckets.values()];
}

// Civil dates are stepped through `Date.UTC`, not by adding 86 400 s, so a 23- or 25-hour day stays one day.
function editionDays(rows: readonly Match[], { startS, endS, tz }: EditionWindow): EditionDay[] {
    const days = new Map<string, EditionDay>();
    const first = localTime(startS, tz);
    for (let i = 0; ; i++) {
        const d = new Date(Date.UTC(first.year, first.month - 1, first.day + i));
        const civil = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
        const dayStartS = localMidnight(civil, tz);
        if (dayStartS >= endS) break;
        days.set(dayKey(civil), { dayStartS, matches: 0, wins: 0 });
    }
    return tally(days, rows, tz, dayKey);
}

function editionMonths(rows: readonly Match[], { startS, endS, tz }: EditionWindow): EditionMonth[] {
    const months = new Map<string, EditionMonth>();
    const first = localTime(startS, tz);
    for (let i = 0; ; i++) {
        const d = new Date(Date.UTC(first.year, first.month - 1 + i, 1));
        const civil = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: 1 };
        const monthStartS = localMidnight(civil, tz);
        if (monthStartS >= endS) break;
        months.set(monthKey(civil), { monthStartS, matches: 0, wins: 0 });
    }
    return tally(months, rows, tz, monthKey);
}

const rankSeries = (rows: Match[]): RankPoint[] =>
    rankTrack(rows).map((p) => ({ startS: p.startTime, badge: p.badge, outcome: p.outcome }));

function editionRank(rows: Match[]): EditionRank | null {
    const track = rankTrack(rows);
    if (!track.length) return null;
    return {
        startBadge: track[0].badge,
        endBadge: track[track.length - 1].badge,
        peakBadge: Math.max(...track.map((p) => p.badge)),
        delta: track.reduce((s, p) => s + (p.delta ?? 0), 0),
    };
}

function nemesis(enemies: readonly Companion[]): Companion | null {
    const losses = (c: Companion) => c.matches - c.wins;
    return (
        enemies
            .filter((c) => losses(c) >= MIN_NEMESIS_LOSSES)
            .sort((a, b) => losses(b) - losses(a) || b.matches - a.matches || a.accountId - b.accountId)[0] ?? null
    );
}

export type EditionBase = Omit<Edition, "stories"> & { stats: EditionStats & EditionCalendar };

/** Everything but the stories; `null` when the window holds fewer than `MIN_EDITION_MATCHES` matches. */
export function buildEditionBase(input: BuildInput): EditionBase | null {
    const { window, enrichment } = input;
    const rows = windowRows(input.history, window);
    if (rows.length < MIN_EDITION_MATCHES) return null;

    const candidates = bestGameCandidates(rows, BEST_GAME_CANDIDATES);
    const bestGame = candidates.length
        ? pickBestGame(candidates, enrichment.grades)
        : toBestGame([...rows].sort(byKda)[0], undefined);

    return {
        schema: EDITION_SCHEMA,
        id: window.id,
        window,
        accountId: input.accountId,
        number: input.number,
        volume: localTime(window.startS, window.tz).year,
        issuedAt: input.issuedAt,
        stats: editionStats(rows, window.tz),
        heroes: heroBreakdown(rows).map((h) => ({
            heroId: h.heroId,
            games: h.games,
            wins: h.wins,
            playtimeS: h.playtimeS,
        })),
        newHeroes: newHeroes(input.history, window, rows),
        bestGame,
        longestWin: streaks(rows).longestWin,
        rank: editionRank(rows),
        season: window.kind === "collectors" ? (input.season ?? null) : null,
        mates: [...(enrichment.mates ?? [])].sort(
            (a, b) => b.matches - a.matches || b.wins - a.wins || a.accountId - b.accountId,
        ),
        nemesis: nemesis(enrichment.enemies ?? []),
        combat: enrichment.heroCombat,
        playerName: input.playerName ?? null,
        ...(window.kind === "weekly" || window.kind === "monthly"
            ? { days: editionDays(rows, window) }
            : { months: editionMonths(rows, window) }),
        ...(window.kind === "collectors" ? { rankSeries: rankSeries(rows) } : {}),
    };
}

/** `null` when the window holds fewer than `MIN_EDITION_MATCHES` matches. */
export function buildEdition(input: BuildInput): Edition | null {
    const base = buildEditionBase(input);
    return base && { ...base, stories: detectDispatchStories(base) };
}
