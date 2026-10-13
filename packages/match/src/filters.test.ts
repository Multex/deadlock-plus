import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, filterRows, type RowFilters } from "./filters";
import type { MatchRow, RowMode } from "./list";

const DAY = 86_400;
const NOW = 100 * DAY;

const row = (over: Partial<MatchRow> = {}): MatchRow => ({
    matchId: 1,
    heroId: 10,
    outcome: "win",
    mode: "unranked",
    kills: 0,
    deaths: 0,
    assists: 0,
    souls: 0,
    durationS: 0,
    startTime: NOW - DAY,
    rankBadge: 0,
    rankDelta: null,
    calibration: false,
    source: "api",
    ...over,
});

const ids = (rows: MatchRow[]) => rows.map((r) => r.matchId);
const run = (rows: MatchRow[], over: Partial<RowFilters> = {}) =>
    ids(filterRows(rows, { ...DEFAULT_FILTERS, ...over }, NOW));

describe("filterRows", () => {
    it("returns an empty list for an empty list", () => {
        expect(run([])).toEqual([]);
    });

    it("keeps everything visible by default", () => {
        const rows = [row({ matchId: 1 }), row({ matchId: 2, mode: "ranked" }), row({ matchId: 3, mode: "other" })];
        expect(run(rows)).toEqual([1, 2, 3]);
    });

    it("filters by mode", () => {
        const rows = (["ranked", "unranked", "streetBrawl"] as RowMode[]).map((mode, i) =>
            row({ matchId: i + 1, mode }),
        );
        expect(run(rows, { mode: "ranked" })).toEqual([1]);
        expect(run(rows, { mode: "unranked" })).toEqual([2]);
        expect(run(rows, { mode: "streetBrawl" })).toEqual([3]);
    });

    it("filters by hero", () => {
        const rows = [row({ matchId: 1, heroId: 10 }), row({ matchId: 2, heroId: 20 })];
        expect(run(rows, { heroId: 20 })).toEqual([2]);
    });

    it("filters by outcome", () => {
        const rows = [
            row({ matchId: 1, outcome: "win" }),
            row({ matchId: 2, outcome: "loss" }),
            row({ matchId: 3, outcome: "unscored" }),
        ];
        expect(run(rows, { outcome: "loss" })).toEqual([2]);
        expect(run(rows, { outcome: "unscored" })).toEqual([3]);
    });

    it("filters by date window, inclusive of the cutoff", () => {
        const rows = [
            row({ matchId: 1, startTime: NOW - 7 * DAY }),
            row({ matchId: 2, startTime: NOW - 7 * DAY - 1 }),
            row({ matchId: 3, startTime: NOW }),
        ];
        expect(run(rows, { days: 7 })).toEqual([1, 3]);
    });

    it("combines filters", () => {
        const rows = [
            row({ matchId: 1, heroId: 10, outcome: "win" }),
            row({ matchId: 2, heroId: 10, outcome: "loss" }),
            row({ matchId: 3, heroId: 20, outcome: "win" }),
        ];
        expect(run(rows, { heroId: 10, outcome: "win" })).toEqual([1]);
    });

    describe("hidden matches", () => {
        const rows = [
            row({ matchId: 1, mode: "bot" }),
            row({ matchId: 2, mode: "custom" }),
            row({ matchId: 3, mode: "custom", source: "provisional" }),
            row({ matchId: 4, mode: "bot", source: "provisional" }),
            row({ matchId: 5, mode: "ranked" }),
        ];

        it("hides bot and custom matches outside the Custom filter", () => {
            expect(run(rows)).toEqual([5]);
            expect(run(rows, { mode: "ranked" })).toEqual([5]);
        });

        it("shows API-known custom matches under the Custom filter only", () => {
            expect(run(rows, { custom: true })).toEqual([2]);
        });

        it("never shows bot matches", () => {
            expect(run(rows, { custom: true })).not.toContain(1);
            expect(run(rows, { custom: true })).not.toContain(4);
        });

        it("never shows provisional matches of hidden modes", () => {
            expect(run(rows, { custom: true })).not.toContain(3);
        });

        it("still applies the other filters under Custom", () => {
            const custom = [
                row({ matchId: 1, mode: "custom", heroId: 10 }),
                row({ matchId: 2, mode: "custom", heroId: 20 }),
                row({ matchId: 3, mode: "custom", outcome: "loss", heroId: 20 }),
            ];
            expect(run(custom, { custom: true, heroId: 20, outcome: "win" })).toEqual([2]);
        });

        it("ignores the mode filter under Custom", () => {
            expect(run(rows, { custom: true, mode: "ranked" })).toEqual([2]);
        });
    });
});
