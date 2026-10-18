import { describe, expect, it, vi } from "vitest";
import type { DetailCoverage } from "@deadlock-plus/ipc-types/DetailCoverage";
import { MatchCoverage, type CoverageDeps, type CoverageRow, type RunState } from "./coverage.svelte";

const NOW_S = 1_000_000_000;
const DAY_S = 86_400;

function row(matchId: number, ageDays: number): CoverageRow {
    return { matchId, startTime: NOW_S - ageDays * DAY_S };
}

function setup(initial: CoverageRow[], api: Partial<DetailCoverage> = {}) {
    let rows = initial;
    let run: RunState | null = null;
    let fail = false;
    const deps: CoverageDeps = {
        fetch: vi.fn(async (ids: number[]) => {
            if (fail) throw new Error("offline");
            const withDetails = api.withDetails ?? ids;
            return { withDetails: ids.filter((id) => withDetails.includes(id)), withReplay: api.withReplay ?? [] };
        }),
        rows: () => rows,
        recovery: () => run,
        nowS: () => NOW_S,
    };
    const settle = () => new Promise((r) => setTimeout(r, 0));
    return {
        coverage: new MatchCoverage(deps),
        deps,
        settle,
        setRows: (next: CoverageRow[]) => (rows = next),
        setRun: (next: RunState | null) => (run = next),
        setFail: (next: boolean) => (fail = next),
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

    it("asks again when a new match shows up", async () => {
        const { coverage, deps, settle, setRows } = setup([row(1, 1)]);
        coverage.sync();
        await settle();
        setRows([row(2, 0), row(1, 1)]);
        coverage.sync();
        await settle();

        expect(deps.fetch).toHaveBeenCalledTimes(2);
        expect(deps.fetch).toHaveBeenLastCalledWith([2, 1]);
    });

    it("asks again when a recovery run ends", async () => {
        const { coverage, deps, settle, setRun } = setup([row(1, 1), row(2, 2)]);
        coverage.sync();
        await settle();

        setRun(running([2]));
        coverage.sync();
        await settle();
        expect(deps.fetch).toHaveBeenCalledTimes(1);

        setRun({ ...running([]), running: false });
        coverage.sync();
        await settle();
        expect(deps.fetch).toHaveBeenCalledTimes(2);

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

    it("drops an older answer that lands after a newer one was asked", async () => {
        const { coverage, deps, settle, setRows } = setup([row(1, 1)]);
        let release: (c: DetailCoverage) => void = () => {};
        vi.mocked(deps.fetch).mockImplementationOnce(() => new Promise((r) => (release = r)));
        coverage.sync();
        setRows([row(2, 0), row(1, 1)]);
        coverage.sync();
        await settle();
        release({ withDetails: [], withReplay: [] });
        await settle();

        expect(coverage.summary).toMatchObject({ total: 2, full: 2 });
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
