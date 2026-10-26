import { describe, expect, it } from "vitest";
import type { Outcome } from "../stats";
import { editionSignals, type Signal, type SignalId } from "./signals";
import {
    EDITION_SCHEMA,
    type BestGame,
    type Companion,
    type Edition,
    type EditionDay,
    type EditionMonth,
    type RankPoint,
    type TapeMatch,
} from "./types";

const at = (y: number, mo: number, d: number, h = 0) => Date.UTC(y, mo - 1, d, h) / 1000;
const october = (d: number) => at(2026, 10, d);

// 1 Oct 2026 is a Thursday; the played days 1, 4, ... 31 put 4 of 11 on a weekend.
const PLAYED = Array.from({ length: 11 }, (_, i) => 1 + i * 3);

function daysOf(matchesOn: Record<number, number>, winsOn: Record<number, number> = {}): EditionDay[] {
    return Array.from({ length: 31 }, (_, i) => ({
        dayStartS: october(i + 1),
        matches: matchesOn[i + 1] ?? 0,
        wins: winsOn[i + 1] ?? 0,
    }));
}

const tapeOf = (outcomes: Outcome[], startS = october(1) + 18 * 3600): TapeMatch[] =>
    outcomes.map((o, i) => [startS + i * 2400, 1, o, 5, 3, 7, 20000, 1800]);

const alternating = (n: number): Outcome[] => Array.from({ length: n }, (_, i) => (i % 2 ? "loss" : "win"));

const game = (over: Partial<BestGame> = {}): BestGame => ({
    matchId: 1,
    heroId: 1,
    kills: 9,
    deaths: 2,
    assists: 11,
    netWorth: 31000,
    startTime: october(4) + 18 * 3600,
    letter: "A",
    place: 2,
    ...over,
});

const mate = (matches: number, wins = 0, name = "Copperhead"): Companion => ({ accountId: 9, name, matches, wins });

/** 22 matches over October, 11-11, nothing notable: no signal fires. */
function base(over: Partial<Edition> = {}): Edition {
    return {
        schema: EDITION_SCHEMA,
        id: "monthly-2026-10",
        window: { kind: "monthly", id: "monthly-2026-10", startS: october(1), endS: at(2026, 11, 1), tz: "UTC" },
        accountId: 42,
        number: 3,
        volume: 2026,
        issuedAt: at(2026, 11, 1),
        stats: {
            matches: 22,
            wins: 11,
            losses: 11,
            unscored: 0,
            winrate: 0.5,
            playtimeS: 22 * 1800,
            kills: 110,
            deaths: 66,
            assists: 154,
            netWorth: 440000,
            longestMatchS: 2400,
            longestSession: { matches: 3, startS: october(4) + 18 * 3600, durationS: 7200 },
            busiestDay: { dayStartS: october(1), matches: 2 },
            nightShare: 0.1,
            daysPlayed: 11,
            busiestMonth: { monthStartS: october(1), matches: 22 },
        },
        heroes: [
            { heroId: 1, games: 5, wins: 3, playtimeS: 9000 },
            { heroId: 2, games: 4, wins: 2, playtimeS: 7200 },
            { heroId: 3, games: 4, wins: 2, playtimeS: 7200 },
            { heroId: 4, games: 3, wins: 2, playtimeS: 5400 },
            { heroId: 5, games: 3, wins: 1, playtimeS: 5400 },
            { heroId: 6, games: 3, wins: 1, playtimeS: 5400 },
        ],
        newHeroes: [],
        bestGame: game(),
        longestWin: 2,
        rank: { startBadge: 41, endBadge: 42, peakBadge: 42, delta: 0 },
        season: null,
        mates: [mate(4, 2)],
        nemesis: { accountId: 8, name: "Saltmarsh", matches: 3, wins: 1 },
        combat: [
            {
                heroId: 1,
                matches: 5,
                damage: null,
                objDamagePerMin: null,
                accuracy: null,
                critRate: null,
                mvpRankCounts: [1, 0, 0],
                mvpRated: 5,
            },
        ],
        stories: [],
        playerName: "Lantern",
        days: daysOf(Object.fromEntries(PLAYED.map((d) => [d, 2]))),
        tape: tapeOf(alternating(22)),
        nominees: [game()],
        rivals: [],
        ...over,
    };
}

const ids = (e: Edition, prev?: Edition) => editionSignals(e, prev).map((s) => s.id);
function find<K extends SignalId>(e: Edition, id: K, prev?: Edition) {
    return editionSignals(e, prev).find((s): s is Extract<Signal, { id: K }> => s.id === id);
}
const stats = (over: Partial<Edition["stats"]>) => ({ ...base().stats, ...over });

describe("editionSignals", () => {
    it("finds nothing in an unremarkable month", () => {
        expect(ids(base())).toEqual([]);
    });

    it("streak: 5 straight wins, not 4", () => {
        expect(find(base({ longestWin: 5 }), "streak")?.facts).toEqual({ wins: 5 });
        expect(ids(base({ longestWin: 4 }))).not.toContain("streak");
    });

    it("one_trick: top hero in half the matches, not just under, and never on a handful", () => {
        const heroes = (games: number) => [{ heroId: 12, games, wins: 7, playtimeS: 0 }, ...base().heroes.slice(1)];
        expect(find(base({ heroes: heroes(11) }), "one_trick")?.facts).toEqual({
            heroId: 12,
            games: 11,
            wins: 7,
            share: 0.5,
        });
        expect(ids(base({ heroes: heroes(10) }))).not.toContain("one_trick");
        expect(ids(base({ heroes: heroes(9), stats: stats({ matches: 9 }) }))).not.toContain("one_trick");
    });

    it("explorer: 8 heroes or 3 new ones, not 7 or 2", () => {
        const heroes = (n: number) =>
            Array.from({ length: n }, (_, i) => ({ heroId: i + 1, games: 2, wins: 1, playtimeS: 0 }));
        expect(find(base({ heroes: heroes(8) }), "explorer")?.facts).toEqual({ heroes: 8, newHeroes: [] });
        expect(ids(base({ heroes: heroes(7) }))).not.toContain("explorer");
        expect(find(base({ newHeroes: [4, 5, 6] }), "explorer")?.facts.newHeroes).toEqual([4, 5, 6]);
        expect(ids(base({ newHeroes: [4, 5] }))).not.toContain("explorer");
    });

    it("debut: the most-played new hero with 3 games, not 2", () => {
        const heroes = (games: number) => [
            ...base().heroes,
            { heroId: 20, games, wins: 2, playtimeS: 0 },
            { heroId: 21, games: 1, wins: 1, playtimeS: 0 },
        ];
        expect(find(base({ heroes: heroes(3), newHeroes: [21, 20] }), "debut")?.facts).toEqual({
            heroId: 20,
            games: 3,
            wins: 2,
        });
        expect(ids(base({ heroes: heroes(2), newHeroes: [20] }))).not.toContain("debut");
    });

    it("duo: top mate in 40% of matches, not just under", () => {
        const s = stats({ matches: 20 });
        expect(find(base({ stats: s, mates: [mate(8, 5)] }), "duo")?.facts).toEqual({ mate: mate(8, 5), share: 0.4 });
        expect(ids(base({ stats: s, mates: [mate(7, 5)] }))).not.toContain("duo");
    });

    it("nemesis: 3 losses to them, not 2", () => {
        const rival = { accountId: 8, name: "Saltmarsh", matches: 4, wins: 1 };
        expect(find(base({ nemesis: rival }), "nemesis")?.facts).toEqual({ rival, losses: 3 });
        expect(ids(base({ nemesis: { ...rival, wins: 2 } }))).not.toContain("nemesis");
    });

    it("climb / slide: 3 subranks across a tier, not 2", () => {
        const rank = (startBadge: number, endBadge: number) => ({ startBadge, endBadge, peakBadge: 0, delta: 0 });
        expect(find(base({ rank: rank(34, 41) }), "climb")?.facts).toEqual({ startBadge: 34, endBadge: 41, steps: 3 });
        expect(ids(base({ rank: rank(35, 41) }))).not.toContain("climb");
        expect(find(base({ rank: rank(41, 34) }), "slide")?.facts).toEqual({ startBadge: 41, endBadge: 34, steps: -3 });
        expect(ids(base({ rank: rank(41, 35) }))).not.toContain("slide");
    });

    it("bounce_back: a low 3 subranks under the end badge after the first 10 games", () => {
        const series = (lowAt: number, low: number): RankPoint[] =>
            Array.from({ length: 14 }, (_, i) => ({
                startS: october(1) + i * 3600,
                badge: i === lowAt ? low : i === 13 ? 41 : 36,
                outcome: "win",
            }));
        expect(find(base({ rankSeries: series(10, 34) }), "bounce_back")?.facts).toEqual({
            lowBadge: 34,
            lowS: october(1) + 10 * 3600,
            endBadge: 41,
            steps: 3,
        });
        expect(ids(base({ rankSeries: series(10, 35) }))).not.toContain("bounce_back");
        expect(ids(base({ rankSeries: series(9, 31) }))).not.toContain("bounce_back");
    });

    it("bounce_back: reads the tape's badges when an edition has no rank series", () => {
        const tape = (lowAt: number, low: number): TapeMatch[] =>
            Array.from({ length: 16 }, (_, i): TapeMatch => {
                const row: TapeMatch = [october(1) + i * 3600, 1, "win", 5, 3, 7, 20000, 1800];
                // Unranked matches carry no badge and do not count toward the first 10 ranked games.
                if (i !== 7) row.push(i === lowAt ? low : i === 15 ? 41 : 36);
                return row;
            });
        expect(find(base({ tape: tape(12, 34) }), "bounce_back")?.facts).toEqual({
            lowBadge: 34,
            lowS: october(1) + 12 * 3600,
            endBadge: 41,
            steps: 3,
        });
        expect(ids(base({ tape: tape(12, 35) }))).not.toContain("bounce_back");
        expect(ids(base({ tape: tape(10, 31) }))).not.toContain("bounce_back");
        const yearEnd = base({
            window: { ...base().window, kind: "year_end", id: "year_end-2026" },
            tape: tape(12, 34),
        });
        expect(ids(yearEnd)).toContain("bounce_back");
        expect(ids(base({ tape: tapeOf(alternating(22)) }))).not.toContain("bounce_back");
    });

    it("losing_then_winning: 4 losses, then 5 of the next 6 won", () => {
        const L: Outcome = "loss";
        const W: Outcome = "win";
        const turn = tapeOf([W, L, L, L, L, W, W, W, W, W, L, L]);
        expect(find(base({ tape: turn }), "losing_then_winning")?.facts).toEqual({
            losses: 4,
            lossStartS: turn[1][0],
            wins: 5,
            of: 6,
            turnS: turn[5][0],
        });
        expect(ids(base({ tape: tapeOf([W, L, L, L, W, W, W, W, W, L]) }))).not.toContain("losing_then_winning");
        expect(ids(base({ tape: tapeOf([L, L, L, L, W, W, W, W, L, L]) }))).not.toContain("losing_then_winning");
    });

    it("losing_then_winning: unscored matches neither break nor count", () => {
        const L: Outcome = "loss";
        const W: Outcome = "win";
        const U: Outcome = "unscored";
        expect(ids(base({ tape: tapeOf([L, L, U, L, L, W, W, U, W, W, L, W]) }))).toContain("losing_then_winning");
    });

    it("dry_spell: 5 empty days between played days, not 4 or leading", () => {
        const s = stats({ daysPlayed: 2 });
        expect(find(base({ stats: s, days: daysOf({ 1: 5, 7: 5 }) }), "dry_spell")?.facts).toEqual({
            unit: "day",
            length: 5,
            startS: october(2),
            endS: october(7),
        });
        expect(ids(base({ stats: s, days: daysOf({ 1: 5, 6: 5 }) }))).not.toContain("dry_spell");
        expect(ids(base({ stats: s, days: daysOf({ 20: 5, 21: 5 }) }))).not.toContain("dry_spell");
    });

    it("dry_spell: an empty month inside a year, not a late start", () => {
        const months = (counts: number[]): EditionMonth[] =>
            counts.map((matches, i) => ({ monthStartS: at(2026, i + 1, 1), matches, wins: 0 }));
        const year = (counts: number[]) =>
            base({
                window: {
                    kind: "year_end",
                    id: "year_end-2026",
                    startS: at(2025, 12, 1),
                    endS: at(2026, 12, 1),
                    tz: "UTC",
                },
                days: undefined,
                months: months(counts),
            });
        expect(find(year([10, 0, 10]), "dry_spell")?.facts).toEqual({
            unit: "month",
            length: 1,
            startS: at(2026, 2, 1),
            endS: at(2026, 3, 1),
        });
        expect(ids(year([0, 10, 10]))).not.toContain("dry_spell");
    });

    it("grinder: played 60% of the days, not just under", () => {
        expect(find(base({ stats: stats({ daysPlayed: 19 }) }), "grinder")?.facts).toEqual({
            daysPlayed: 19,
            windowDays: 31,
            share: 19 / 31,
        });
        expect(ids(base({ stats: stats({ daysPlayed: 18 }) }))).not.toContain("grinder");
    });

    it("marathon: a 6-match session, not 5", () => {
        const session = (matches: number) => ({ matches, startS: october(4), durationS: 4 * 3600 });
        expect(find(base({ stats: stats({ longestSession: session(6) }) }), "marathon")?.facts).toEqual(session(6));
        expect(ids(base({ stats: stats({ longestSession: session(5) }) }))).not.toContain("marathon");
    });

    it("night_owl: 30% after midnight, not 29%, and never on a handful", () => {
        expect(find(base({ stats: stats({ nightShare: 0.3 }) }), "night_owl")?.facts).toEqual({
            share: 0.3,
            matches: 22,
        });
        expect(ids(base({ stats: stats({ nightShare: 0.29 }) }))).not.toContain("night_owl");
        expect(ids(base({ stats: stats({ nightShare: 0.5, matches: 9 }) }))).not.toContain("night_owl");
    });

    it("weekender: 60% of matches on Sat/Sun from the days, not just under", () => {
        // 3, 4, 10 and 11 October 2026 are Sat/Sun.
        const days = (weekday: number) => daysOf({ 3: 3, 4: 3, 10: 3, 11: 3, 5: weekday });
        const s = stats({ matches: 20 });
        expect(find(base({ stats: s, days: days(8) }), "weekender")?.facts).toEqual({ matches: 12, share: 0.6 });
        expect(ids(base({ stats: s, days: days(9) }))).not.toContain("weekender");
    });

    it("weekender: falls back to the tape when an edition has no days", () => {
        const saturday = at(2026, 10, 3, 15);
        const tape: TapeMatch[] = [...tapeOf(alternating(6), saturday), ...tapeOf(alternating(4), at(2026, 10, 7, 15))];
        expect(find(base({ stats: stats({ matches: 10 }), days: undefined, tape }), "weekender")?.facts).toEqual({
            matches: 6,
            share: 0.6,
        });
    });

    it("big_game: graded S- or better, not A+ or ungraded", () => {
        expect(find(base({ bestGame: game({ letter: "S-" }) }), "big_game")?.facts.game.letter).toBe("S-");
        expect(ids(base({ bestGame: game({ letter: "A+" }) }))).not.toContain("big_game");
        expect(ids(base({ bestGame: game({ letter: null }) }))).not.toContain("big_game");
        expect(ids(base({ bestGame: null }))).not.toContain("big_game");
    });

    it("swing_month: 20 points over the month before, both with 10 games", () => {
        const months = (prev: [number, number], cur: [number, number]): EditionMonth[] => [
            { monthStartS: at(2026, 3, 1), matches: prev[0], wins: prev[1] },
            { monthStartS: at(2026, 4, 1), matches: cur[0], wins: cur[1] },
        ];
        const year = (m: EditionMonth[]) => base({ days: undefined, months: m });
        expect(find(year(months([10, 3], [10, 5])), "swing_month")?.facts).toEqual({
            month: { monthStartS: at(2026, 4, 1), matches: 10, wins: 5 },
            before: { monthStartS: at(2026, 3, 1), matches: 10, wins: 3 },
            points: 20,
        });
        expect(ids(year(months([10, 3], [10, 4])))).not.toContain("swing_month");
        expect(ids(year(months([9, 2], [10, 5])))).not.toContain("swing_month");
    });

    it("winning / losing: 60% / 40% of 10 scored, not just inside", () => {
        const rec = (wins: number, losses: number) => stats({ wins, losses, winrate: wins / (wins + losses) });
        expect(find(base({ stats: rec(12, 8) }), "winning")?.facts).toEqual({ wins: 12, losses: 8, winrate: 0.6 });
        expect(ids(base({ stats: rec(59, 41) }))).not.toContain("winning");
        expect(find(base({ stats: rec(8, 12) }), "losing")?.facts).toEqual({ wins: 8, losses: 12, winrate: 0.4 });
        expect(ids(base({ stats: rec(41, 59) }))).not.toContain("losing");
        expect(ids(base({ stats: rec(6, 3) }))).not.toContain("winning");
    });

    it("vs_last: matches or winrate moved 20% since the same kind's last edition", () => {
        const prev = (matches: number, wins: number) =>
            base({
                id: "monthly-2026-09",
                stats: stats({ matches, wins, losses: matches - wins, winrate: wins / matches }),
            });
        const s = find(base(), "vs_last", prev(18, 9))?.facts;
        expect(s?.previousId).toBe("monthly-2026-09");
        expect(s?.matchesChange).toBeCloseTo(22 / 18 - 1);
        expect(ids(base(), prev(19, 10))).not.toContain("vs_last");
        expect(find(base(), "vs_last", prev(20, 8))?.facts.winrateChange).toBeCloseTo(0.25);
        const weekly = { ...prev(10, 5), window: { ...base().window, kind: "weekly" as const } };
        expect(ids(base(), weekly)).not.toContain("vs_last");
    });

    it("mvp: 3 Valve MVP placements, not 2", () => {
        const combat = (counts: number[]) => [{ ...base().combat![0], mvpRankCounts: counts }];
        expect(find(base({ combat: combat([1, 1, 1]) }), "mvp")?.facts).toEqual({ placements: 3, rated: 5 });
        expect(ids(base({ combat: combat([1, 1, 0]) }))).not.toContain("mvp");
        expect(ids(base({ combat: null }))).not.toContain("mvp");
    });

    it("sorts by strength, ties in a fixed order, the same every call", () => {
        const e = base({
            longestWin: 12,
            stats: stats({ nightShare: 0.3, longestSession: { matches: 6, startS: 0, durationS: 0 } }),
            bestGame: game({ letter: "S-" }),
        });
        const out = editionSignals(e);
        expect(out.map((s) => s.id)).toEqual(["streak", "big_game", "marathon", "night_owl"]);
        expect(out[0].strength).toBe(1);
        expect(out.slice(1).map((s) => s.strength)).toEqual([0.5, 0.5, 0.5]);
        expect(editionSignals(e)).toEqual(out);
        for (const s of out) expect(s.strength).toBeGreaterThanOrEqual(0);
    });

    it("an old edition without tape, nominees or rivals keeps every signal that does not need the tape", () => {
        const L: Outcome = "loss";
        const W: Outcome = "win";
        const loud = base({
            longestWin: 6,
            newHeroes: [4, 5, 6],
            nemesis: { accountId: 8, name: "Saltmarsh", matches: 5, wins: 1 },
            bestGame: game({ letter: "S" }),
            stats: stats({ nightShare: 0.4, daysPlayed: 20, longestSession: { matches: 8, startS: 0, durationS: 0 } }),
            tape: tapeOf([L, L, L, L, L, W, W, W, W, W, W, ...alternating(11)]),
        });
        const full = ids(loud);
        expect(full).toContain("losing_then_winning");
        const old = { ...loud };
        delete old.tape;
        delete old.nominees;
        delete old.rivals;
        expect(ids(old)).toEqual(full.filter((id) => id !== "losing_then_winning"));
    });
});

describe("personas", () => {
    const p1 = base({
        playerName: "Lantern",
        stats: stats({ matches: 23, wins: 15, losses: 8, winrate: 15 / 23 }),
        heroes: [
            { heroId: 12, games: 12, wins: 9, playtimeS: 0 },
            { heroId: 2, games: 6, wins: 3, playtimeS: 0 },
            { heroId: 3, games: 5, wins: 3, playtimeS: 0 },
        ],
        longestWin: 8,
        rank: { startBadge: 23, endBadge: 34, peakBadge: 34, delta: 0 },
        bestGame: game({ heroId: 12, letter: "S-" }),
    });
    const p2 = base({
        playerName: "Moth",
        stats: stats({ matches: 22, wins: 9, losses: 13, winrate: 9 / 22, nightShare: 0.38 }),
        heroes: Array.from({ length: 12 }, (_, i) => ({ heroId: i + 1, games: i < 10 ? 2 : 1, wins: 1, playtimeS: 0 })),
        newHeroes: [9, 10, 11, 12],
        rank: { startBadge: 41, endBadge: 33, peakBadge: 41, delta: 0 },
    });
    const L: Outcome = "loss";
    const W: Outcome = "win";
    const p3 = base({
        playerName: "Kettle",
        stats: stats({
            matches: 23,
            wins: 12,
            losses: 11,
            winrate: 12 / 23,
            longestSession: { matches: 7, startS: october(10), durationS: 5 * 3600 },
        }),
        mates: [mate(14, 9)],
        nemesis: { accountId: 8, name: "Saltmarsh", matches: 4, wins: 1 },
        tape: tapeOf([W, L, W, L, L, L, L, L, L, W, W, W, L, W, W, W, W, L, W, L, W, L, W]),
    });

    it("P1 Lantern, the one-trick climber", () => {
        expect(ids(p1)).toEqual(expect.arrayContaining(["one_trick", "streak", "climb", "big_game"]));
        expect(ids(p1)[0]).toBe("climb");
    });

    it("P2 Moth, the explorer in a slump", () => {
        expect(ids(p2)).toEqual(expect.arrayContaining(["explorer", "night_owl", "slide"]));
        expect(ids(p2)).not.toContain("losing");
        expect(ids(p2)[0]).toBe("explorer");
    });

    it("P3 Kettle, the duo comeback", () => {
        expect(ids(p3)).toEqual(expect.arrayContaining(["duo", "losing_then_winning", "marathon", "nemesis"]));
        expect(find(p3, "losing_then_winning")?.facts).toMatchObject({ losses: 6, wins: 7, of: 8 });
        expect(ids(p3)[0]).toBe("duo");
    });

    it("their top signals differ", () => {
        const top = [p1, p2, p3].map((p) => ids(p).slice(0, 3).join(","));
        expect(new Set(top).size).toBe(3);
        expect(new Set([p1, p2, p3].map((p) => ids(p)[0])).size).toBe(3);
    });
});
