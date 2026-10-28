import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRetryTimer } from "./retry-timer";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(run: () => Promise<void> = async () => {}) {
    const changes = vi.fn();
    const runSpy = vi.fn(run);
    const timer = createRetryTimer({ run: runSpy, onChange: changes });
    return { timer, run: runSpy, changes };
}

describe("createRetryTimer", () => {
    it("runs once after the wait and counts down meanwhile", async () => {
        const { timer, run } = setup();
        expect(timer.schedule(12)).toBe(12);
        expect(timer.remainingS).toBe(12);
        await vi.advanceTimersByTimeAsync(4000);
        expect(timer.remainingS).toBe(8);
        expect(run).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(8000);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it("backs off on each schedule until reset", () => {
        const { timer } = setup();
        expect(timer.schedule(12)).toBe(12);
        expect(timer.schedule(12)).toBe(20);
        expect(timer.schedule(12)).toBe(40);
        timer.reset();
        expect(timer.schedule(12)).toBe(12);
    });

    it("keeps one attempt pending: a new schedule replaces the old one", async () => {
        const { timer, run } = setup();
        timer.schedule(5);
        timer.schedule(5);
        await vi.advanceTimersByTimeAsync(60_000);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it("runs at once on tryNow and drops the pending wait", async () => {
        const { timer, run } = setup();
        timer.schedule(30);
        timer.tryNow();
        expect(run).toHaveBeenCalledTimes(1);
        expect(timer.remainingS).toBeNull();
        await vi.advanceTimersByTimeAsync(60_000);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it("ignores tryNow while an attempt is still running", async () => {
        let finish!: () => void;
        const { timer, run } = setup(() => new Promise<void>((r) => (finish = r)));
        timer.schedule(1);
        timer.tryNow();
        timer.tryNow();
        expect(run).toHaveBeenCalledTimes(1);
        expect(timer.running).toBe(true);
        finish();
        await vi.advanceTimersByTimeAsync(0);
        expect(timer.running).toBe(false);
        timer.tryNow();
        expect(run).toHaveBeenCalledTimes(2);
    });

    it("runs nothing after stop", async () => {
        const { timer, run } = setup();
        timer.schedule(3);
        timer.stop();
        await vi.advanceTimersByTimeAsync(60_000);
        expect(run).not.toHaveBeenCalled();
        expect(timer.remainingS).toBeNull();
    });

    it("tells its owner each second while it counts down", async () => {
        const { timer, changes } = setup();
        timer.schedule(3);
        changes.mockClear();
        await vi.advanceTimersByTimeAsync(2000);
        expect(changes.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
});
