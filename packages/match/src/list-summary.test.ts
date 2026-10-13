import { describe, expect, it } from "vitest";
import type { MatchRow } from "./list";
import { dayKey, formStrip, groupByDay, kdaRatio, summarizeRows } from "./list-summary";

const row = (over: Partial<MatchRow> = {}): MatchRow => ({
    matchId: 1,
    heroId: 10,
    outcome: "win",
    mode: "ranked",
    kills: 5,
    deaths: 2,
    assists: 7,
    souls: 30000,
    durationS: 1800,
    startTime: 1000,
    rankBadge: 63,
    rankDelta: 12,
    calibration: false,
    source: "api",
    ...over,
});

const at = (day: number, hour: number) => Math.floor(new Date(2026, 9, day, hour, 0, 0).getTime() / 1000);

describe("kdaRatio", () => {
    it("adds kills and assists over deaths", () => {
        expect(kdaRatio({ kills: 5, deaths: 2, assists: 7 })).toBe(6);
    });
    it("treats zero deaths as one", () => {
        expect(kdaRatio({ kills: 3, deaths: 0, assists: 1 })).toBe(4);
    });
});

describe("summarizeRows", () => {
    it("returns an empty summary for no rows", () => {
        expect(summarizeRows([])).toEqual({
            matches: 0,
            wins: 0,
            losses: 0,
            unscored: 0,
            winrate: null,
            kda: null,
            avgKills: 0,
            avgDeaths: 0,
            avgAssists: 0,
            avgSouls: 0,
            netDelta: null,
            topHero: null,
        });
    });

    it("counts outcomes and leaves unscored out of the winrate", () => {
        const s = summarizeRows([
            row({ matchId: 1, outcome: "win" }),
            row({ matchId: 2, outcome: "loss" }),
            row({ matchId: 3, outcome: "win" }),
            row({ matchId: 4, outcome: "unscored" }),
        ]);
        expect(s).toMatchObject({ matches: 4, wins: 2, losses: 1, unscored: 1 });
        expect(s.winrate).toBeCloseTo(2 / 3);
    });

    it("has no winrate when nothing was scored", () => {
        expect(summarizeRows([row({ outcome: "unscored" })]).winrate).toBeNull();
    });

    it("weights KDA by totals, not by per-match ratios", () => {
        const s = summarizeRows([
            row({ matchId: 1, kills: 10, deaths: 0, assists: 0 }),
            row({ matchId: 2, kills: 0, deaths: 10, assists: 0 }),
        ]);
        expect(s.kda).toBe(1);
        expect(s.avgKills).toBe(5);
        expect(s.avgDeaths).toBe(5);
    });

    it("averages souls and rounds", () => {
        const s = summarizeRows([row({ matchId: 1, souls: 10001 }), row({ matchId: 2, souls: 20000 })]);
        expect(s.avgSouls).toBe(15001);
    });

    it("sums known rank deltas and ignores unknown ones", () => {
        const s = summarizeRows([
            row({ matchId: 1, rankDelta: 10 }),
            row({ matchId: 2, rankDelta: -4 }),
            row({ matchId: 3, rankDelta: null }),
        ]);
        expect(s.netDelta).toBe(6);
    });

    it("has no net delta when no row has one", () => {
        expect(summarizeRows([row({ rankDelta: null })]).netDelta).toBeNull();
    });

    it("picks the most played hero, newest first on a tie", () => {
        const s = summarizeRows([
            row({ matchId: 1, heroId: 7 }),
            row({ matchId: 2, heroId: 8 }),
            row({ matchId: 3, heroId: 8 }),
            row({ matchId: 4, heroId: 7 }),
        ]);
        expect(s.topHero).toEqual({ heroId: 7, games: 2 });
    });
});

describe("formStrip", () => {
    it("takes the newest rows and returns them oldest first", () => {
        const rows = [
            row({ matchId: 3, outcome: "loss" }),
            row({ matchId: 2, outcome: "win" }),
            row({ matchId: 1, outcome: "win" }),
        ];
        expect(formStrip(rows, 2)).toEqual([
            { matchId: 2, outcome: "win" },
            { matchId: 3, outcome: "loss" },
        ]);
    });
    it("returns everything when there are fewer rows than the limit", () => {
        expect(formStrip([row({ matchId: 1 })], 10)).toHaveLength(1);
    });
});

describe("groupByDay", () => {
    it("groups consecutive rows by local day, keeping order", () => {
        const rows = [
            row({ matchId: 4, startTime: at(10, 22), outcome: "win" }),
            row({ matchId: 3, startTime: at(10, 9), outcome: "loss" }),
            row({ matchId: 2, startTime: at(9, 23), outcome: "win" }),
            row({ matchId: 1, startTime: at(8, 1), outcome: "unscored" }),
        ];
        const groups = groupByDay(rows);
        expect(groups.map((g) => g.rows.map((r) => r.matchId))).toEqual([[4, 3], [2], [1]]);
        expect(groups[0]).toMatchObject({ key: dayKey(at(10, 22)), startTime: at(10, 22), wins: 1, losses: 1 });
        expect(groups[2]).toMatchObject({ wins: 0, losses: 0 });
    });

    it("returns no groups for no rows", () => {
        expect(groupByDay([])).toEqual([]);
    });
});
