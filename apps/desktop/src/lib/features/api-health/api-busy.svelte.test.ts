import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeadlockApiError } from "@deadlock-plus/deadlock-api";
import { ApiBusy } from "./api-busy.svelte";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("ApiBusy", () => {
    it("turns busy on a 429 and retries after the API's wait", async () => {
        const run = vi.fn();
        const busy = new ApiBusy(run);
        expect(busy.handle(new DeadlockApiError(429, 12))).toBe(true);
        expect(busy.active).toBe(true);
        expect(busy.remainingS).toBe(12);
        await vi.advanceTimersByTimeAsync(12_000);
        expect(run).toHaveBeenCalledTimes(1);
        expect(busy.active).toBe(true);
    });

    it("leaves a dropped connection or another error to the caller", () => {
        const busy = new ApiBusy(vi.fn());
        expect(busy.handle(new TypeError("Failed to fetch"))).toBe(false);
        expect(busy.handle(new DeadlockApiError(500))).toBe(false);
        expect(busy.active).toBe(false);
    });

    it("stops retrying once a load succeeds", async () => {
        const run = vi.fn();
        const busy = new ApiBusy(run);
        busy.handle(new DeadlockApiError(503));
        busy.clear();
        expect(busy.active).toBe(false);
        await vi.advanceTimersByTimeAsync(600_000);
        expect(run).not.toHaveBeenCalled();
    });

    it("stops retrying when the next failure is not a busy one", async () => {
        const run = vi.fn();
        const busy = new ApiBusy(run);
        busy.handle(new DeadlockApiError(429, 5));
        busy.handle(new TypeError("Failed to fetch"));
        expect(busy.active).toBe(false);
        await vi.advanceTimersByTimeAsync(600_000);
        expect(run).not.toHaveBeenCalled();
    });
});
