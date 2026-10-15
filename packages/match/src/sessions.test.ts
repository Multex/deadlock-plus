import { describe, expect, it } from "vitest";
import { SESSION_GAP_S } from "@deadlock-plus/stats/sessions";
import type { MatchRow } from "./list";
import { groupBySession, paginateSessions, type SessionGroup } from "./sessions";

const row = (matchId: number, startTime: number, over: Partial<MatchRow> = {}): MatchRow => ({
    matchId,
    heroId: 10,
    outcome: "win",
    mode: "ranked",
    kills: 5,
    deaths: 2,
    assists: 7,
    souls: 30000,
    durationS: 1800,
    startTime,
    rankBadge: 63,
    rankDelta: null,
    calibration: false,
    source: "api",
    ...over,
});

const newestFirst = (rows: MatchRow[]) => [...rows].sort((a, b) => b.startTime - a.startTime);

// Two sessions: matches 1-3 back to back from t=0, then 4-5 after a long break.
const NOW = 10 * 86_400;
const early = [row(1, 0), row(2, 1800 + 60, { outcome: "loss" }), row(3, 3600 + 120, { outcome: "unscored" })];
const lateStart = 3600 + 120 + 1800 + SESSION_GAP_S + 1;
const late = [row(4, lateStart, { rankDelta: 400 }), row(5, lateStart + 1900, { outcome: "loss", rankDelta: -150 })];
const all = newestFirst([...early, ...late]);

describe("groupBySession", () => {
    it("splits on the stats session gap and lists groups newest first", () => {
        const groups = groupBySession(all, all, NOW);
        expect(groups.map((g) => g.rows.map((r) => r.matchId))).toEqual([
            [5, 4],
            [3, 2, 1],
        ]);
    });

    it("keeps a match that starts exactly one gap after the previous end in the same session", () => {
        const rows = newestFirst([row(1, 0), row(2, 1800 + SESSION_GAP_S)]);
        expect(groupBySession(rows, rows, NOW)).toHaveLength(1);
    });

    it("gives each group its start, duration and whole-session results", () => {
        const [last, first] = groupBySession(all, all, NOW);
        expect(first).toMatchObject({ startTime: 0, durationS: 3600 + 120 + 1800, wins: 1, losses: 1, unscored: 1 });
        expect(first.netDelta).toBeNull();
        expect(last).toMatchObject({ startTime: lateStart, durationS: 1900 + 1800, wins: 1, losses: 1, netDelta: 250 });
    });

    it("keys each group by its first match, so a newer match does not change the key", () => {
        const before = groupBySession(all, all, NOW).map((g) => g.key);
        const grown = newestFirst([...all, row(6, lateStart + 3800)]);
        const after = groupBySession(grown, grown, NOW).map((g) => g.key);
        expect(after).toEqual(before);
        expect(new Set(before).size).toBe(2);
    });

    it("shows only visible rows but counts the whole session in the header", () => {
        const visible = all.filter((r) => r.outcome === "win");
        const groups = groupBySession(visible, all, NOW);
        expect(groups.map((g) => g.rows.map((r) => r.matchId))).toEqual([[4], [1]]);
        expect(groups[1]).toMatchObject({ wins: 1, losses: 1, unscored: 1 });
        expect(groups[0]).toMatchObject({ wins: 1, losses: 1, netDelta: 250 });
    });

    it("drops sessions with no visible rows", () => {
        const visible = all.filter((r) => r.matchId >= 4);
        expect(groupBySession(visible, all, NOW).map((g) => g.rows.length)).toEqual([2]);
    });

    it("returns nothing for no rows", () => {
        expect(groupBySession([], all, NOW)).toEqual([]);
        expect(groupBySession([], [], NOW)).toEqual([]);
    });

    it("gives each group the whole-session game count and verdict", () => {
        const [last, first] = groupBySession(all, all, NOW);
        expect(first).toMatchObject({ games: 2, verdict: "neutral" });
        expect(last).toMatchObject({ games: 2, verdict: "neutral" });
    });

    it("counts still-syncing matches across the whole session", () => {
        const rows = newestFirst([
            row(1, 0, { source: "provisional" }),
            row(2, 1900),
            row(3, 3800, { source: "provisional" }),
        ]);
        const visible = rows.filter((r) => r.matchId === 2);
        expect(groupBySession(visible, rows, NOW)[0].syncing).toBe(2);
        expect(groupBySession(all, all, NOW).map((g) => g.syncing)).toEqual([0, 0]);
    });

    describe("highlight", () => {
        const goodStart = lateStart + 10 * 86_400;
        const good = [
            row(10, goodStart, { rankDelta: 400 }),
            row(11, goodStart + 1900, { rankDelta: 400 }),
            row(12, goodStart + 3800, { rankDelta: 400 }),
        ];
        const rows = newestFirst([...all, ...good]);
        const marked = (groups: SessionGroup[]) =>
            groups.filter((g) => g.highlight !== null).map((g) => [g.highlight, g.rows.map((r) => r.matchId)]);

        it("marks a recent good session as the latest highlight, and only that one", () => {
            const groups = groupBySession(rows, rows, goodStart + 86_400);
            expect(marked(groups)).toEqual([["latest", [12, 11, 10]]]);
            expect(groups[0].verdict).toBe("excellent");
        });

        it("marks an older good session as the best one once the latest is not good", () => {
            const after = goodStart + 3800 + 1800 + SESSION_GAP_S + 1;
            const withLoss = newestFirst([...rows, row(20, after, { outcome: "loss" })]);
            expect(marked(groupBySession(withLoss, withLoss, after + 86_400))).toEqual([["best", [12, 11, 10]]]);
        });

        it("marks none when no session qualifies", () => {
            expect(marked(groupBySession(all, all, NOW))).toEqual([]);
        });

        it("marks none when the picked session has no visible rows", () => {
            expect(marked(groupBySession(all, rows, goodStart + 86_400))).toEqual([]);
        });
    });
});

const group = (id: number, size: number): SessionGroup => ({
    key: `s${id}`,
    startTime: id,
    durationS: 0,
    wins: 0,
    losses: 0,
    unscored: 0,
    games: 0,
    netDelta: null,
    verdict: "neutral",
    highlight: null,
    syncing: 0,
    rows: Array.from({ length: size }, (_, i) => row(id * 100 + i, id)),
});

describe("paginateSessions", () => {
    const sizes = (items: SessionGroup[]) => items.map((g) => g.rows.length);

    it("closes a page once it holds at least a page of matches, never splitting a session", () => {
        const groups = [group(1, 3), group(2, 3), group(3, 2), group(4, 4), group(5, 1)];
        expect(sizes(paginateSessions(groups, 1, 5).items)).toEqual([3, 3]);
        expect(sizes(paginateSessions(groups, 2, 5).items)).toEqual([2, 4]);
        expect(sizes(paginateSessions(groups, 3, 5).items)).toEqual([1]);
        expect(paginateSessions(groups, 1, 5)).toMatchObject({ page: 1, pageCount: 3, total: 13 });
    });

    it("gives a session bigger than a page a page to itself", () => {
        const groups = [group(1, 2), group(2, 9), group(3, 1)];
        expect(sizes(paginateSessions(groups, 1, 2).items)).toEqual([2]);
        expect(sizes(paginateSessions(groups, 2, 2).items)).toEqual([9]);
        expect(sizes(paginateSessions(groups, 3, 2).items)).toEqual([1]);
    });

    it("starts a new page for a session bigger than a page", () => {
        const groups = [group(1, 1), group(2, 9), group(3, 1)];
        expect(sizes(paginateSessions(groups, 1, 2).items)).toEqual([1]);
        expect(sizes(paginateSessions(groups, 2, 2).items)).toEqual([9]);
        expect(paginateSessions(groups, 1, 2).pageCount).toBe(3);
    });

    it("clamps the page into range", () => {
        const groups = [group(1, 3), group(2, 3)];
        expect(paginateSessions(groups, 9, 3).page).toBe(2);
        expect(paginateSessions(groups, 0, 3).page).toBe(1);
        expect(paginateSessions(groups, Number.NaN, 3).page).toBe(1);
    });

    it("has one empty page when there is nothing", () => {
        expect(paginateSessions([], 1, 5)).toEqual({ items: [], page: 1, pageCount: 1, total: 0 });
    });

    it("defaults to the list page size", () => {
        const groups = Array.from({ length: 30 }, (_, i) => group(i + 1, 1));
        expect(paginateSessions(groups, 1).items).toHaveLength(25);
    });
});
