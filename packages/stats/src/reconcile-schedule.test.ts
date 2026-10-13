import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReconcileSchedule } from "./reconcile-schedule";

const DELAYS = [10, 20, 40];

function setup(initialPending = true) {
    const state = { pending: initialPending, runs: 0 };
    const run = vi.fn(async () => {
        state.runs++;
    });
    const schedule = createReconcileSchedule({ run, pending: () => state.pending, delaysMs: DELAYS });
    return { state, run, schedule };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createReconcileSchedule", () => {
    it("runs once after the first delay when a match arrives", async () => {
        const { run, schedule } = setup();
        schedule.arrived();
        expect(run).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(10);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it("retries with growing gaps while rows remain, then gives up", async () => {
        const { run, schedule } = setup();
        schedule.arrived();
        await vi.advanceTimersByTimeAsync(10);
        expect(run).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(19);
        expect(run).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(run).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(40);
        expect(run).toHaveBeenCalledTimes(3);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(run).toHaveBeenCalledTimes(3);
    });

    it("stops once no provisional rows remain", async () => {
        const state = { pending: true };
        const run = vi.fn(async () => {
            state.pending = false;
        });
        const schedule = createReconcileSchedule({ run, pending: () => state.pending, delaysMs: DELAYS });
        schedule.arrived();
        await vi.advanceTimersByTimeAsync(10);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it("restarts the gaps when another match arrives", async () => {
        const { run, schedule } = setup();
        schedule.arrived();
        await vi.advanceTimersByTimeAsync(10);
        await vi.advanceTimersByTimeAsync(20);
        expect(run).toHaveBeenCalledTimes(2);
        schedule.arrived();
        await vi.advanceTimersByTimeAsync(10);
        expect(run).toHaveBeenCalledTimes(3);
    });

    it("runs immediately on focus while rows remain", async () => {
        const { run, schedule } = setup();
        schedule.focused();
        await vi.advanceTimersByTimeAsync(0);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it("ignores focus when no rows remain", async () => {
        const { run, schedule } = setup(false);
        schedule.focused();
        await vi.advanceTimersByTimeAsync(0);
        expect(run).not.toHaveBeenCalled();
    });

    it("does not overlap runs", async () => {
        let release: () => void = () => {};
        const run = vi.fn(() => new Promise<void>((r) => (release = r)));
        const schedule = createReconcileSchedule({ run, pending: () => true, delaysMs: DELAYS });
        schedule.focused();
        schedule.focused();
        expect(run).toHaveBeenCalledTimes(1);
        release();
        await vi.advanceTimersByTimeAsync(0);
    });

    it("keeps scheduling after a failed run", async () => {
        const run = vi.fn().mockRejectedValue(new Error("offline"));
        const schedule = createReconcileSchedule({ run, pending: () => true, delaysMs: DELAYS });
        schedule.arrived();
        await vi.advanceTimersByTimeAsync(30);
        expect(run).toHaveBeenCalledTimes(2);
    });

    it("cancels pending timers on stop", async () => {
        const { run, schedule } = setup();
        schedule.arrived();
        schedule.stop();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(run).not.toHaveBeenCalled();
    });
});
