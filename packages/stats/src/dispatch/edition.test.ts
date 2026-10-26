import { describe, expect, it } from "vitest";
import type { Match } from "../stats";
import {
    bestGameCandidates,
    buildEdition,
    buildEditionBase,
    editionCalendar,
    pickBestGame,
    windowRows,
} from "./edition";
import { detectDispatchStories } from "./stories";
import type {
    BuildInput,
    Companion,
    EditionWindow,
    Enrichment,
    GradedCandidate,
    HeroCombat,
    RankedSeason,
} from "./types";

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 1000;

let nextId = 1000;
const m = (over: Partial<Match> = {}): Match => ({
    matchId: nextId++,
    heroId: 7,
    startTime: at(2026, 10, 13, 18),
    matchMode: 4,
    gameMode: 1,
    outcome: "win",
    kills: 5,
    deaths: 2,
    assists: 3,
    netWorth: 20000,
    durationS: 1800,
    rankBadge: 0,
    rankDelta: null,
    calibration: false,
    demotionProtected: false,
    ...over,
});

const WEEK: EditionWindow = {
    kind: "weekly",
    id: "weekly-2026-10-12",
    startS: at(2026, 10, 12),
    endS: at(2026, 10, 19),
    tz: "UTC",
};

const NO_ENRICHMENT: Enrichment = { mates: null, enemies: null, heroCombat: null, grades: null };

const input = (history: readonly Match[], over: Partial<BuildInput> = {}): BuildInput => ({
    window: WEEK,
    accountId: 42,
    history,
    enrichment: NO_ENRICHMENT,
    number: null,
    issuedAt: null,
    ...over,
});

// One week of play in UTC: a three-match night session on Monday, a night match on Wednesday,
// a Saturday evening pair (one Street Brawl), and a short Sunday loss.
const BEFORE = [
    m({ matchId: 1, heroId: 7, startTime: at(2026, 9, 1, 18), outcome: "win" }),
    m({ matchId: 2, heroId: 20, startTime: at(2026, 8, 20, 18), outcome: "loss" }),
];
const IN_WEEK = [
    m({ matchId: 10, heroId: 7, startTime: at(2026, 10, 12, 0, 0), rankBadge: 81, rankDelta: 300 }),
    m({
        matchId: 11,
        heroId: 7,
        startTime: at(2026, 10, 12, 0, 40),
        kills: 10,
        deaths: 1,
        assists: 5,
        netWorth: 30000,
        durationS: 2000,
        rankBadge: 86,
        rankDelta: 370,
    }),
    m({
        matchId: 12,
        heroId: 15,
        startTime: at(2026, 10, 12, 1, 30),
        outcome: "loss",
        kills: 2,
        deaths: 8,
        assists: 4,
        netWorth: 15000,
        durationS: 2400,
        rankBadge: 85,
        rankDelta: -300,
    }),
    m({
        matchId: 13,
        heroId: 15,
        startTime: at(2026, 10, 14, 3),
        matchMode: 1,
        outcome: "unscored",
        kills: 8,
        deaths: 2,
        assists: 8,
        netWorth: 25000,
        durationS: 1500,
    }),
    m({
        matchId: 14,
        heroId: 20,
        startTime: at(2026, 10, 17, 20),
        kills: 6,
        deaths: 0,
        assists: 6,
        netWorth: 28000,
        durationS: 3100,
        rankBadge: 84,
        rankDelta: 300,
    }),
    m({
        matchId: 15,
        heroId: 20,
        startTime: at(2026, 10, 17, 21),
        matchMode: 1,
        gameMode: 4,
        kills: 30,
        deaths: 0,
        assists: 0,
        durationS: 900,
    }),
    m({
        matchId: 16,
        heroId: 7,
        startTime: at(2026, 10, 18, 23, 59),
        outcome: "loss",
        kills: 20,
        deaths: 0,
        assists: 0,
        durationS: 500,
    }),
];
const AFTER = [m({ matchId: 17, heroId: 33, startTime: WEEK.endS })];
const HISTORY = [...AFTER, ...IN_WEEK, ...BEFORE];

const SEASON: RankedSeason = {
    id: "season_1",
    name: "Beta Season 1",
    startS: at(2026, 7, 30, 17),
    endS: at(2026, 11, 5, 22),
};
const COLLECTORS: EditionWindow = {
    kind: "collectors",
    id: "collectors-season_1",
    startS: SEASON.startS,
    endS: SEASON.endS,
    tz: "UTC",
};
const YEAR_END: EditionWindow = {
    kind: "year_end",
    id: "year_end-2026",
    startS: at(2026, 1, 1),
    endS: at(2026, 12, 1),
    tz: "UTC",
};

const build = (history: readonly Match[] = HISTORY, over: Partial<BuildInput> = {}) => {
    const e = buildEditionBase(input(history, over));
    if (!e) throw new Error("expected an edition");
    return e;
};

describe("windowRows", () => {
    it("keeps rows from startS inclusive to endS exclusive, oldest first", () => {
        expect(windowRows(HISTORY, WEEK).map((r) => r.matchId)).toEqual([10, 11, 12, 13, 14, 15, 16]);
    });
});

describe("buildEditionBase", () => {
    it("returns null below MIN_EDITION_MATCHES", () => {
        expect(buildEditionBase(input([]))).toBeNull();
        expect(buildEditionBase(input([...BEFORE, ...IN_WEEK.slice(0, 2)]))).toBeNull();
        expect(buildEditionBase(input(IN_WEEK.slice(0, 3)))?.stats.matches).toBe(3);
    });

    it("copies the identity fields", () => {
        const e = build(HISTORY, { number: 4, issuedAt: 1_800_000_000 });
        expect(e).toMatchObject({
            schema: 1,
            id: "weekly-2026-10-12",
            window: WEEK,
            accountId: 42,
            number: 4,
            issuedAt: 1_800_000_000,
            volume: 2026,
        });
    });

    it("totals the window", () => {
        expect(build().stats).toEqual({
            matches: 7,
            wins: 4,
            losses: 2,
            unscored: 1,
            winrate: 4 / 6,
            playtimeS: 1800 + 2000 + 2400 + 1500 + 3100 + 900 + 500,
            kills: 81,
            deaths: 13,
            assists: 26,
            netWorth: 20000 + 30000 + 15000 + 25000 + 28000 + 20000 + 20000,
            longestMatchS: 3100,
            longestSession: { matches: 3, startS: at(2026, 10, 12), durationS: 90 * 60 + 2400 },
            busiestDay: { dayStartS: at(2026, 10, 12), matches: 3 },
            nightShare: 4 / 7,
            daysPlayed: 4,
            busiestMonth: { monthStartS: at(2026, 10, 1), matches: 7 },
        });
    });

    it("has no season outside a Collector's Copy", () => {
        expect(build(HISTORY, { season: SEASON }).season).toBeNull();
    });

    it("leaves winrate null when no game was scored", () => {
        const rows = [1, 2, 3].map((i) => m({ startTime: at(2026, 10, 13, 10 + i), outcome: "unscored" }));
        expect(build(rows).stats.winrate).toBeNull();
    });

    it("breaks a busiest-day tie toward the earlier day", () => {
        const rows = [
            m({ startTime: at(2026, 10, 15, 12) }),
            m({ startTime: at(2026, 10, 15, 14) }),
            m({ startTime: at(2026, 10, 13, 12) }),
            m({ startTime: at(2026, 10, 13, 14) }),
        ];
        expect(build(rows).stats.busiestDay).toEqual({ dayStartS: at(2026, 10, 13), matches: 2 });
    });

    it("lists heroes by games played", () => {
        expect(build().heroes).toEqual([
            { heroId: 7, games: 3, wins: 2, playtimeS: 1800 + 2000 + 500 },
            { heroId: 15, games: 2, wins: 0, playtimeS: 2400 + 1500 },
            { heroId: 20, games: 2, wins: 2, playtimeS: 3100 + 900 },
        ]);
    });

    it("finds heroes first played inside the window across the whole history", () => {
        expect(build().newHeroes).toEqual([15]);
    });

    it("counts the longest win streak inside the window only", () => {
        expect(build().longestWin).toBe(2);
    });

    it("tracks rank over ranked matches with a badge", () => {
        expect(build().rank).toEqual({ startBadge: 81, endBadge: 84, peakBadge: 86, delta: 670 });
    });

    it("has no rank without ranked badges", () => {
        const rows = [1, 2, 3].map((i) => m({ startTime: at(2026, 10, 13, 10 + i), matchMode: 1 }));
        expect(build(rows).rank).toBeNull();
    });

    it("picks the best graded candidate as the best game", () => {
        const grades: GradedCandidate[] = [
            { matchId: 11, letter: "A", s10: 70, place: 3 },
            { matchId: 14, letter: "S-", s10: 60, place: 5 },
            { matchId: 13, letter: "S-", s10: 75, place: 2 },
        ];
        expect(build(HISTORY, { enrichment: { ...NO_ENRICHMENT, grades } }).bestGame).toEqual({
            matchId: 13,
            heroId: 15,
            kills: 8,
            deaths: 2,
            assists: 8,
            netWorth: 25000,
            startTime: at(2026, 10, 14, 3),
            letter: "S-",
            place: 2,
        });
    });

    it("falls back to the best KDA of any row when nothing is gradable", () => {
        const rows = [
            m({ startTime: at(2026, 10, 13, 10), gameMode: 4, kills: 3 }),
            m({ matchId: 77, startTime: at(2026, 10, 13, 11), durationS: 400, kills: 9 }),
            m({ startTime: at(2026, 10, 13, 12), matchMode: 0, kills: 6 }),
        ];
        expect(build(rows).bestGame).toMatchObject({ matchId: 77, kills: 9, letter: null, place: null });
    });

    it("maps the enrichment", () => {
        const c = (accountId: number, matches: number, wins: number): Companion => ({
            accountId,
            name: null,
            matches,
            wins,
        });
        const heroCombat: HeroCombat[] = [
            {
                heroId: 7,
                matches: 3,
                damage: 50000,
                objDamagePerMin: 400,
                accuracy: 0.4,
                critRate: 0.1,
                mvpRankCounts: [1, 0, 0],
                mvpRated: 3,
            },
        ];
        const e = build(HISTORY, {
            enrichment: {
                mates: [c(1, 2, 1), c(2, 5, 3), c(3, 4, 4)],
                enemies: [c(4, 5, 4), c(5, 3, 0), c(6, 6, 3)],
                heroCombat,
                grades: null,
            },
        });
        expect(e.mates.map((x) => x.accountId)).toEqual([2, 3, 1]);
        expect(e.nemesis?.accountId).toBe(6);
        expect(e.combat).toEqual(heroCombat);
    });

    it("leaves sections out when the enrichment is missing or thin", () => {
        const e = build(HISTORY, {
            enrichment: { ...NO_ENRICHMENT, enemies: [{ accountId: 4, name: null, matches: 3, wins: 2 }] },
        });
        expect(e.mates).toEqual([]);
        expect(e.nemesis).toBeNull();
        expect(e.combat).toBeNull();
    });
});

describe("Collector's Copy", () => {
    const SEASON_HISTORY = [
        m({ matchId: 30, heroId: 7, startTime: at(2026, 7, 1, 18), rankBadge: 71 }),
        m({ matchId: 31, heroId: 7, startTime: at(2026, 8, 5, 18), rankBadge: 74, rankDelta: 300 }),
        m({ matchId: 32, heroId: 33, startTime: at(2026, 8, 6, 18), matchMode: 1, kills: 40, deaths: 0 }),
        m({ matchId: 33, heroId: 15, startTime: at(2026, 9, 10, 18), rankBadge: 81, rankDelta: 400 }),
        m({ matchId: 34, heroId: 7, startTime: at(2026, 10, 20, 18), rankBadge: 82, rankDelta: 300 }),
        m({ matchId: 35, heroId: 7, startTime: at(2026, 10, 21, 18), matchMode: 1, kills: 50, deaths: 0 }),
        m({ matchId: 36, heroId: 7, startTime: SEASON.endS, rankBadge: 83 }),
    ];
    const collectors = (history: readonly Match[] = SEASON_HISTORY) =>
        build(history, { window: COLLECTORS, season: SEASON });

    it("keeps only the ranked matches of the season", () => {
        expect(windowRows(SEASON_HISTORY, COLLECTORS).map((r) => r.matchId)).toEqual([31, 33, 34]);
        const e = collectors();
        expect(e.stats.matches).toBe(3);
        expect(e.heroes.map((h) => h.heroId)).toEqual([7, 15]);
        expect(e.bestGame?.matchId).not.toBe(35);
    });

    it("carries the season and its rank block", () => {
        const e = collectors();
        expect(e.season).toEqual(SEASON);
        expect(e.rank).toEqual({ startBadge: 74, endBadge: 82, peakBadge: 82, delta: 1000 });
    });

    it("counts a new hero only when it was played in ranked", () => {
        expect(collectors().newHeroes).toEqual([15]);
    });

    it("needs MIN_EDITION_MATCHES ranked matches, whatever else was played", () => {
        const thin = SEASON_HISTORY.filter((r) => r.matchId !== 34);
        expect(buildEditionBase(input(thin, { window: COLLECTORS, season: SEASON }))).toBeNull();
    });

    it("has no rank block without badges", () => {
        const rows = [1, 2, 3].map((i) => m({ startTime: at(2026, 9, i, 18), rankBadge: 0 }));
        expect(collectors(rows).rank).toBeNull();
    });
});

describe("Year-End Special", () => {
    it("covers every match of the year to Dec 1", () => {
        const rows = [
            m({ startTime: at(2026, 3, 4, 18), matchMode: 1 }),
            m({ startTime: at(2026, 6, 4, 18) }),
            m({ startTime: at(2026, 6, 9, 18), gameMode: 4, matchMode: 1 }),
            m({ startTime: at(2026, 12, 1, 0) }),
        ];
        const e = build(rows, { window: YEAR_END });
        expect(e.stats.matches).toBe(3);
        expect(e.stats.busiestMonth).toEqual({ monthStartS: at(2026, 6, 1), matches: 2 });
        expect(e.season).toBeNull();
    });
});

describe("editionCalendar", () => {
    it("counts distinct local days", () => {
        const rows = [m({ startTime: at(2026, 10, 13, 3) }), m({ startTime: at(2026, 10, 13, 5) })];
        expect(editionCalendar(rows, "UTC").daysPlayed).toBe(1);
        expect(editionCalendar(rows, "America/New_York").daysPlayed).toBe(2);
    });

    it("finds the busiest local month, the earlier one on a tie", () => {
        const rows = [
            m({ startTime: at(2026, 3, 10, 12) }),
            m({ startTime: at(2026, 3, 11, 12) }),
            m({ startTime: at(2026, 1, 10, 12) }),
            m({ startTime: at(2026, 1, 11, 12) }),
            // 23:00 EDT on Oct 31.
            m({ startTime: at(2026, 11, 1, 3) }),
        ];
        expect(editionCalendar(rows, "America/New_York")).toEqual({
            daysPlayed: 5,
            busiestMonth: { monthStartS: at(2026, 1, 1, 5), matches: 2 },
        });
        expect(editionCalendar(rows.slice(4), "America/New_York").busiestMonth).toEqual({
            monthStartS: at(2026, 10, 1, 4),
            matches: 1,
        });
    });

    it("is empty without rows", () => {
        expect(editionCalendar([], "UTC")).toEqual({ daysPlayed: 0, busiestMonth: null });
    });
});

describe("buildEdition", () => {
    it("adds the ranked stories to the base", () => {
        const base = build();
        const e = buildEdition(input(HISTORY));
        expect(e?.stories.length).toBeGreaterThan(0);
        expect(e).toEqual({ ...base, stories: detectDispatchStories(base) });
        expect(buildEdition(input(IN_WEEK.slice(0, 2)))).toBeNull();
    });
});

describe("time zones", () => {
    // Europe/London leaves BST on Sunday 2026-10-25, so this week is 7 days and one hour long.
    const LONDON: EditionWindow = {
        kind: "weekly",
        id: "weekly-2026-10-19",
        startS: at(2026, 10, 18, 23),
        endS: at(2026, 10, 26),
        tz: "Europe/London",
    };

    it("buckets days and nights in local time across a DST change", () => {
        const rows = [
            m({ startTime: at(2026, 10, 19, 4, 30) }), // Mon 05:30 BST: night
            m({ startTime: at(2026, 10, 19, 5, 30) }), // Mon 06:30 BST: day
            m({ startTime: at(2026, 10, 19, 5, 45) }), // Mon 06:45 BST: day
            m({ startTime: at(2026, 10, 24, 23, 30) }), // Sun 00:30 BST: night
            m({ startTime: at(2026, 10, 25, 5, 30) }), // Sun 05:30 GMT: night
            m({ startTime: at(2026, 10, 25, 6, 30) }), // Sun 06:30 GMT: day
            m({ startTime: at(2026, 10, 25, 23, 30) }), // Sun 23:30 GMT: day
        ];
        const e = build(rows, { window: LONDON });
        expect(e.stats.busiestDay).toEqual({ dayStartS: at(2026, 10, 24, 23), matches: 4 });
        expect(e.stats.nightShare).toBe(3 / 7);
    });

    it("starts a day at local midnight when DST ends later that day east of UTC", () => {
        // Australia/Sydney leaves AEDT at 03:00 on Sunday 2026-04-05, so that Sunday starts at 13:00 UTC.
        const sydney: EditionWindow = {
            kind: "weekly",
            id: "weekly-2026-03-30",
            startS: at(2026, 3, 29, 13),
            endS: at(2026, 4, 5, 14),
            tz: "Australia/Sydney",
        };
        const rows = [
            m({ startTime: at(2026, 4, 4, 14) }),
            m({ startTime: at(2026, 4, 5, 2) }),
            m({ startTime: at(2026, 4, 5, 3) }),
        ];
        expect(build(rows, { window: sydney }).stats.busiestDay).toEqual({
            dayStartS: at(2026, 4, 4, 13),
            matches: 3,
        });
    });

    it("takes the volume from the local year of the window start", () => {
        const auckland: EditionWindow = {
            kind: "monthly",
            id: "monthly-2026-01",
            startS: at(2025, 12, 31, 11),
            endS: at(2026, 1, 31, 11),
            tz: "Pacific/Auckland",
        };
        const rows = [1, 2, 3].map((i) => m({ startTime: at(2026, 1, 10, i) }));
        expect(build(rows, { window: auckland }).volume).toBe(2026);
    });
});

describe("frozen calendar", () => {
    it("lists every day of a weekly window, empty days included, with matches and wins", () => {
        const e = build();
        expect(e.days).toEqual([
            { dayStartS: at(2026, 10, 12), matches: 3, wins: 2 },
            { dayStartS: at(2026, 10, 13), matches: 0, wins: 0 },
            { dayStartS: at(2026, 10, 14), matches: 1, wins: 0 },
            { dayStartS: at(2026, 10, 15), matches: 0, wins: 0 },
            { dayStartS: at(2026, 10, 16), matches: 0, wins: 0 },
            { dayStartS: at(2026, 10, 17), matches: 2, wins: 2 },
            { dayStartS: at(2026, 10, 18), matches: 1, wins: 0 },
        ]);
        expect(e.months).toBeUndefined();
        expect(e.rankSeries).toBeUndefined();
    });

    it("lists the 31 days of a month that leaves DST, each from local midnight", () => {
        // Europe/Berlin leaves CEST at 03:00 on Sunday 2026-10-25.
        const berlin: EditionWindow = {
            kind: "monthly",
            id: "monthly-2026-10",
            startS: at(2026, 9, 30, 22),
            endS: at(2026, 10, 31, 23),
            tz: "Europe/Berlin",
        };
        const rows = [
            m({ startTime: at(2026, 9, 30, 22, 30) }), // Oct 1 00:30 CEST
            m({ startTime: at(2026, 10, 25, 22, 30), outcome: "loss" }), // Oct 25 23:30 CET
            m({ startTime: at(2026, 10, 25, 23, 30) }), // Oct 26 00:30 CET
        ];
        const days = build(rows, { window: berlin }).days ?? [];
        expect(days).toHaveLength(31);
        expect(days.slice(0, 2).map((d) => d.dayStartS)).toEqual([at(2026, 9, 30, 22), at(2026, 10, 1, 22)]);
        expect(days.slice(23, 27).map((d) => d.dayStartS)).toEqual([
            at(2026, 10, 23, 22),
            at(2026, 10, 24, 22),
            at(2026, 10, 25, 23),
            at(2026, 10, 26, 23),
        ]);
        expect(days[30].dayStartS).toBe(at(2026, 10, 30, 23));
        expect([days[0], days[24], days[25]]).toEqual([
            { dayStartS: at(2026, 9, 30, 22), matches: 1, wins: 1 },
            { dayStartS: at(2026, 10, 24, 22), matches: 1, wins: 0 },
            { dayStartS: at(2026, 10, 25, 23), matches: 1, wins: 1 },
        ]);
        expect(days.reduce((s, d) => s + d.matches, 0)).toBe(3);
    });

    it("lists the months of a Year-End Special, Jan to Nov, from local midnight on the 1st", () => {
        const berlinYear: EditionWindow = {
            kind: "year_end",
            id: "year_end-2026",
            startS: at(2025, 12, 31, 23),
            endS: at(2026, 11, 30, 23),
            tz: "Europe/Berlin",
        };
        const rows = [
            m({ startTime: at(2025, 12, 31, 23, 30) }), // Jan 1 00:30 CET
            m({ startTime: at(2026, 6, 4, 18), outcome: "loss" }),
            m({ startTime: at(2026, 6, 9, 18) }),
            m({ startTime: at(2026, 10, 31, 23, 30) }), // Nov 1 00:30 CET
        ];
        const e = build(rows, { window: berlinYear });
        const starts = [
            at(2025, 12, 31, 23),
            at(2026, 1, 31, 23),
            at(2026, 2, 28, 23),
            at(2026, 3, 31, 22),
            at(2026, 4, 30, 22),
            at(2026, 5, 31, 22),
            at(2026, 6, 30, 22),
            at(2026, 7, 31, 22),
            at(2026, 8, 31, 22),
            at(2026, 9, 30, 22),
            at(2026, 10, 31, 23),
        ];
        const counts: Record<number, [number, number]> = { 0: [1, 1], 5: [2, 1], 10: [1, 1] };
        expect(e.months).toEqual(
            starts.map((monthStartS, i) => ({
                monthStartS,
                matches: counts[i]?.[0] ?? 0,
                wins: counts[i]?.[1] ?? 0,
            })),
        );
        expect(e.days).toBeUndefined();
        expect(e.rankSeries).toBeUndefined();
    });

    it("lists the season's months and ranked climb on a Collector's Copy, oldest first", () => {
        const history = [
            m({ matchId: 40, startTime: at(2026, 10, 20, 18), rankBadge: 82, outcome: "unscored" }),
            m({ matchId: 41, startTime: at(2026, 8, 20, 18), rankBadge: 73, outcome: "loss" }),
            m({ matchId: 42, startTime: at(2026, 9, 1, 18), rankBadge: 0 }),
            m({ matchId: 43, startTime: at(2026, 8, 5, 18), rankBadge: 74 }),
            m({ matchId: 44, startTime: at(2026, 9, 2, 18), rankBadge: 77, matchMode: 1 }),
            m({ matchId: 45, startTime: at(2026, 7, 1, 18), rankBadge: 71 }),
        ];
        const e = build(history, { window: COLLECTORS, season: SEASON });
        expect(e.rankSeries).toEqual([
            { startS: at(2026, 8, 5, 18), badge: 74, outcome: "win" },
            { startS: at(2026, 8, 20, 18), badge: 73, outcome: "loss" },
            { startS: at(2026, 10, 20, 18), badge: 82, outcome: "unscored" },
        ]);
        expect(e.months).toEqual([
            { monthStartS: at(2026, 7, 1), matches: 0, wins: 0 },
            { monthStartS: at(2026, 8, 1), matches: 2, wins: 1 },
            { monthStartS: at(2026, 9, 1), matches: 1, wins: 1 },
            { monthStartS: at(2026, 10, 1), matches: 1, wins: 0 },
            { monthStartS: at(2026, 11, 1), matches: 0, wins: 0 },
        ]);
        expect(e.days).toBeUndefined();
    });

    it("carries the player name, null when unknown", () => {
        expect(build(HISTORY, { playerName: "Haze Main" }).playerName).toBe("Haze Main");
        expect(build().playerName).toBeNull();
    });
});

describe("bestGameCandidates", () => {
    it("takes gradable matches by KDA", () => {
        expect(bestGameCandidates(IN_WEEK, 3).map((r) => r.matchId)).toEqual([11, 14, 13]);
    });

    it("breaks KDA ties by net worth, then by the earlier start", () => {
        const rows = [
            m({ matchId: 1, startTime: 300, netWorth: 20000 }),
            m({ matchId: 2, startTime: 200, netWorth: 20000 }),
            m({ matchId: 3, startTime: 100, netWorth: 15000 }),
            m({ matchId: 4, startTime: 400, netWorth: 30000 }),
        ];
        expect(bestGameCandidates(rows, 3).map((r) => r.matchId)).toEqual([4, 2, 1]);
    });

    it("counts deaths as at least one and accepts ranked and unranked normal games of 10 minutes", () => {
        const rows = [
            m({ matchId: 1, kills: 4, deaths: 0, assists: 0 }),
            m({ matchId: 2, kills: 5, deaths: 1, assists: 0, matchMode: 1, durationS: 600 }),
            m({ matchId: 3, kills: 50, matchMode: 2 }),
            m({ matchId: 4, kills: 50, durationS: 599 }),
        ];
        expect(bestGameCandidates(rows, 5).map((r) => r.matchId)).toEqual([2, 1]);
    });
});

describe("pickBestGame", () => {
    const [a, b, c] = [m({ matchId: 1, kills: 12 }), m({ matchId: 2, kills: 9 }), m({ matchId: 3, kills: 6 })];
    const g = (matchId: number, letter: GradedCandidate["letter"], s10: number | null, place: number | null) => ({
        matchId,
        letter,
        s10,
        place,
    });

    it("ranks letters by grade, not by text", () => {
        expect(pickBestGame([a, b], [g(1, "A", 90, 1), g(2, "A+", 10, 9)])?.matchId).toBe(2);
        expect(pickBestGame([a, b], [g(1, "A+", 90, 1), g(2, "S-", 10, 9)])?.matchId).toBe(2);
        expect(pickBestGame([a, b], [g(1, "F", 90, 1), g(2, "E-", 10, 9)])?.matchId).toBe(2);
    });

    it("breaks a letter tie by s10, then by place", () => {
        expect(pickBestGame([a, b, c], [g(1, "B", 50, 1), g(2, "B", 60, 4), g(3, "B", 60, 2)])).toMatchObject({
            matchId: 3,
            letter: "B",
            place: 2,
        });
    });

    it("prefers any graded candidate over an ungraded one", () => {
        expect(pickBestGame([a, b], [g(1, null, null, null), g(2, "F", 1, 12)])?.matchId).toBe(2);
    });

    it("keeps KDA order when no candidate has a grade", () => {
        expect(pickBestGame([c, a, b], null)).toMatchObject({ matchId: 1, letter: null, place: null });
        expect(pickBestGame([c, a, b], [])?.matchId).toBe(1);
    });

    it("has no best game without candidates", () => {
        expect(pickBestGame([], null)).toBeNull();
    });
});
