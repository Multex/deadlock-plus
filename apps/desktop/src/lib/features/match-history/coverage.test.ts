import { describe, expect, it, vi } from "vitest";
import type { DetailCoverage } from "@deadlock-plus/ipc-types/DetailCoverage";
import type { RowMode } from "@deadlock-plus/match/list";
import { MatchCoverage, coverageApplies, type CoverageDeps, type CoverageRow, type RunState } from "./coverage.svelte";

const NOW_S = 1_000_000_000;
const DAY_S = 86_400;

function row(matchId: number, ageDays: number, mode: RowMode = "ranked"): CoverageRow {
    return { matchId, startTime: NOW_S - ageDays * DAY_S, mode };
}

function setup(initial: CoverageRow[], api: Partial<DetailCoverage> = {}) {
    let rows = initial;
    let run: RunState | null = null;
    let fail: unknown = null;
    const timers: { ms: number; run: () => void }[] = [];
    const deps: CoverageDeps = {
        fetch: vi.fn(async (ids: number[]) => {
            if (fail) throw fail;
            const withDetails = api.withDetails ?? ids;
            return { withDetails: ids.filter((id) => withDetails.includes(id)), withReplay: api.withReplay ?? [] };
        }),
        rows: () => rows,
        recovery: () => run,
        nowS: () => NOW_S,
        later: (ms, run) => void timers.push({ ms, run }),
    };
    const settle = () => new Promise((r) => setTimeout(r, 0));
    return {
        coverage: new MatchCoverage(deps),
        deps,
        settle,
        setRows: (next: CoverageRow[]) => (rows = next),
        setRun: (next: RunState | null) => (run = next),
        setFail: (next: boolean | object) => (fail = next === true ? new Error("offline") : next || null),
        timers,
    };
}

const running = (queued: number[], done = 0, total = queued.length): RunState => ({
    running: true,
    paused: false,
    done,
    total,
    queued,
});

describe("MatchCoverage", () => {
    it("shows nothing until coverage loads", () => {
        const { coverage } = setup([row(1, 1)]);
        expect(coverage.summary).toBeNull();
    });

    it("counts every match the player has, not a filtered list", async () => {
        const rows = [row(1, 1), row(2, 2), row(3, 40), row(4, 50)];
        const { coverage, deps, settle } = setup(rows, { withDetails: [1, 3], withReplay: [1] });
        coverage.sync();
        await settle();

        expect(deps.fetch).toHaveBeenCalledWith([1, 2, 3, 4]);
        expect(coverage.summary).toMatchObject({ total: 4, full: 2, missing: 2, recent: 2, replays: 1 });
        expect(coverage.summary?.missingIds).toEqual([2, 4]);
    });

    it("asks the API once per session for the same matches", async () => {
        const { coverage, deps, settle } = setup([row(1, 1), row(2, 2)]);
        coverage.sync();
        await settle();
        coverage.sync();
        coverage.sync();
        await settle();

        expect(deps.fetch).toHaveBeenCalledTimes(1);
    });

    it("asks only about a new match and keeps what it already knows", async () => {
        const { coverage, deps, settle, setRows } = setup([row(1, 1)], { withDetails: [1, 2] });
        coverage.sync();
        await settle();
        setRows([row(2, 0), row(1, 1)]);
        coverage.sync();
        await settle();

        expect(deps.fetch).toHaveBeenCalledTimes(2);
        expect(deps.fetch).toHaveBeenLastCalledWith([2]);
        expect(coverage.summary).toMatchObject({ total: 2, full: 2 });
    });

    it("asks only about the run's matches when a recovery run ends", async () => {
        const { coverage, deps, settle, setRun } = setup([row(1, 1), row(2, 2), row(3, 3), row(4, 4)]);
        coverage.sync();
        await settle();

        setRun(running([2, 3], 0, 2));
        coverage.sync();
        setRun(running([3], 1, 2));
        coverage.sync();
        await settle();
        expect(deps.fetch).toHaveBeenCalledTimes(1);

        setRun({ ...running([], 2, 2), running: false });
        coverage.sync();
        await settle();
        expect(deps.fetch).toHaveBeenCalledTimes(2);
        expect(deps.fetch).toHaveBeenLastCalledWith([2, 3]);

        coverage.sync();
        await settle();
        expect(deps.fetch).toHaveBeenCalledTimes(2);
    });

    it("waits for matches before asking", () => {
        const { coverage, deps } = setup([]);
        coverage.sync();
        expect(deps.fetch).not.toHaveBeenCalled();
        expect(coverage.summary).toBeNull();
    });

    it("hides on error and does not retry the same matches", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const { coverage, deps, settle, setFail } = setup([row(1, 1)]);
        setFail(true);
        coverage.sync();
        await settle();
        coverage.sync();
        await settle();

        expect(coverage.summary).toBeNull();
        expect(deps.fetch).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it("drops an older answer for a match that lands after a newer one was asked", async () => {
        const { coverage, deps, settle, setRun } = setup([row(1, 1)]);
        let release: (c: DetailCoverage) => void = () => {};
        vi.mocked(deps.fetch).mockImplementationOnce(() => new Promise((r) => (release = r)));
        coverage.sync();
        setRun(running([1]));
        coverage.sync();
        setRun({ ...running([]), running: false });
        coverage.sync();
        await settle();
        release({ withDetails: [], withReplay: [] });
        await settle();

        expect(coverage.summary).toMatchObject({ total: 1, full: 1 });
    });

    it("asks again for matches whose call failed, together with the next new match", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const { coverage, deps, settle, setFail, setRows } = setup([row(1, 1)]);
        setFail(true);
        coverage.sync();
        await settle();
        setFail(false);
        setRows([row(2, 0), row(1, 1)]);
        coverage.sync();
        await settle();

        expect(deps.fetch).toHaveBeenLastCalledWith([2, 1]);
        expect(coverage.summary).toMatchObject({ total: 2, full: 2 });
        warn.mockRestore();
    });

    it("asks about the matches a run could have changed when it missed part of the run", async () => {
        const rows = [row(1, 1), row(2, 2), row(3, 40)];
        const { coverage, deps, settle, setRun } = setup(rows, { withDetails: [1, 3], withReplay: [3] });
        coverage.sync();
        await settle();

        setRun(running([], 5, 6));
        coverage.sync();
        setRun({ ...running([], 6, 6), running: false });
        coverage.sync();
        await settle();

        // 1 is recent with details and no replay; 2 lacks details; 3 is past the replay window.
        expect(deps.fetch).toHaveBeenLastCalledWith([1, 2]);
    });

    it("exposes the queued matches and progress while a run is going", () => {
        const { coverage, setRun } = setup([row(1, 1)]);
        expect(coverage.queued.size).toBe(0);
        expect(coverage.run).toBeNull();

        setRun(running([5, 6], 12, 28));
        expect([...coverage.queued]).toEqual([5, 6]);
        expect(coverage.run).toEqual({ done: 12, total: 28, paused: false });

        setRun({ ...running([5], 13, 28), running: false, paused: true });
        expect(coverage.run).toEqual({ done: 13, total: 28, paused: true });
        expect([...coverage.queued]).toEqual([5]);

        setRun({ ...running([5], 13, 28), running: false });
        expect(coverage.run).toBeNull();
        expect(coverage.queued.size).toBe(0);
    });
});

describe("MatchCoverage for one match", () => {
    it("reads the strip's answer without asking again", async () => {
        const { coverage, deps, settle } = setup([row(1, 1), row(2, 2)], { withDetails: [1], withReplay: [1] });
        coverage.sync();
        await settle();
        coverage.load(1);
        coverage.load(2);
        await settle();

        expect(deps.fetch).toHaveBeenCalledTimes(1);
        expect(coverage.forMatch(1)).toEqual({ withDetails: [1], withReplay: [1] });
        expect(coverage.forMatch(2)).toEqual({ withDetails: [], withReplay: [] });
    });

    it("asks once for a match both detail views want", async () => {
        const { coverage, deps, settle } = setup([], { withDetails: [9], withReplay: [9] });
        expect(coverage.forMatch(9)).toBeNull();
        coverage.load(9);
        coverage.load(9, { hasDetails: true });
        await settle();
        coverage.load(9);
        await settle();

        expect(deps.fetch).toHaveBeenCalledTimes(1);
        expect(deps.fetch).toHaveBeenCalledWith([9]);
        expect(coverage.forMatch(9)).toEqual({ withDetails: [9], withReplay: [9] });
    });

    it("leaves a match a detail view is asking about out of the strip's call", async () => {
        const { coverage, deps, settle } = setup([row(1, 1), row(2, 2)]);
        coverage.load(1);
        coverage.sync();
        await settle();

        expect(deps.fetch).toHaveBeenCalledTimes(2);
        expect(deps.fetch).toHaveBeenLastCalledWith([2]);
        expect(coverage.summary).toMatchObject({ total: 2, full: 2 });
    });

    it("asks again when the match now has details the stored answer lacks", async () => {
        const { coverage, deps, settle } = setup([], { withDetails: [] });
        coverage.load(9);
        await settle();
        coverage.load(9, { hasDetails: true });
        await settle();
        coverage.load(9, { hasDetails: true });
        await settle();

        expect(deps.fetch).toHaveBeenCalledTimes(2);
    });

    it("refreshes the match after a run that recovered it ends, without the strip", async () => {
        const { coverage, deps, settle, setRun } = setup([], { withDetails: [9], withReplay: [] });
        coverage.load(9);
        await settle();
        setRun(running([9]));
        coverage.trackRun();
        setRun({ ...running([]), running: false });
        coverage.trackRun();
        await settle();

        expect(deps.fetch).toHaveBeenCalledTimes(2);
        expect(deps.fetch).toHaveBeenLastCalledWith([9]);
    });

    it("stays empty when the call is refused and asks again next time", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const { coverage, deps, settle, setFail } = setup([]);
        setFail(true);
        coverage.load(9);
        await settle();
        expect(coverage.forMatch(9)).toBeNull();

        setFail(false);
        coverage.load(9);
        await settle();
        expect(deps.fetch).toHaveBeenCalledTimes(2);
        expect(coverage.forMatch(9)).not.toBeNull();
        warn.mockRestore();
    });
});

describe("MatchCoverage outside matchmaking", () => {
    it("covers ranked, unranked and Street Brawl only", () => {
        expect((["ranked", "unranked", "streetBrawl"] as const).every(coverageApplies)).toBe(true);
        expect((["custom", "bot", "other"] as const).some(coverageApplies)).toBe(false);
    });

    it("never asks about them and leaves them out of the counts", async () => {
        const rows = [row(1, 1), row(2, 1, "custom"), row(3, 1, "bot"), row(4, 1, "other"), row(5, 1, "streetBrawl")];
        const { coverage, deps, settle } = setup(rows, { withDetails: [1] });
        coverage.sync();
        await settle();

        expect(deps.fetch).toHaveBeenCalledWith([1, 5]);
        expect(coverage.summary).toMatchObject({ total: 2, full: 1, missing: 1, missingIds: [5] });
    });

    it("leaves them out of the end-of-run question", async () => {
        const rows = [row(1, 1), row(2, 1, "bot")];
        const { coverage, deps, settle, setRun } = setup(rows, { withDetails: [] });
        coverage.sync();
        await settle();
        setRun(running([], 0, 3));
        coverage.sync();
        setRun({ ...running([], 3, 3), running: false });
        coverage.sync();
        await settle();

        expect(deps.fetch).toHaveBeenLastCalledWith([1]);
    });

    it("does not ask about one for a detail view", async () => {
        const { coverage, deps, settle } = setup([row(2, 1, "custom")]);
        expect(coverage.applies(2)).toBe(false);
        expect(coverage.applies(7)).toBe(true);
        coverage.load(2);
        await settle();

        expect(deps.fetch).not.toHaveBeenCalled();
    });
});

describe("MatchCoverage when the API budget is low", () => {
    const busy = { code: "common.network", params: { retry_in_s: "4" } };

    it("asks again for the strip's matches once the budget allows", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const { coverage, deps, settle, setFail, timers } = setup([row(1, 1), row(2, 2)]);
        setFail(busy);
        coverage.sync();
        await settle();
        expect(coverage.summary).toBeNull();
        expect(timers.map((t) => t.ms)).toEqual([4000]);

        setFail(false);
        timers[0].run();
        await settle();
        expect(deps.fetch).toHaveBeenCalledTimes(2);
        expect(deps.fetch).toHaveBeenLastCalledWith([1, 2]);
        expect(coverage.summary).toMatchObject({ total: 2, full: 2 });
        warn.mockRestore();
    });

    it("asks again for a detail view's match once the budget allows", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const { coverage, deps, settle, setFail, timers } = setup([]);
        setFail(busy);
        coverage.load(9);
        await settle();
        setFail(false);
        timers[0].run();
        await settle();

        expect(deps.fetch).toHaveBeenCalledTimes(2);
        expect(coverage.forMatch(9)).not.toBeNull();
        warn.mockRestore();
    });

    it("waits for the next match or run after any other failure", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const { coverage, settle, setFail, timers } = setup([row(1, 1)]);
        setFail(true);
        coverage.sync();
        await settle();

        expect(timers).toEqual([]);
        warn.mockRestore();
    });
});
