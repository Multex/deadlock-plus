import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock("$lib/core/kv", () => ({ kvGet: kv.get, kvSet: kv.set }));
vi.mock("svelte-sonner", () => ({ toast }));

import type { FrameStats } from "./api";
import { savedRuns } from "./runs.svelte";

const STATS = { frameCount: 10, durationMs: 1000 } as FrameStats;

describe("saved runs when the write fails", () => {
    beforeEach(async () => {
        kv.get.mockReset();
        kv.get.mockResolvedValue(null);
        kv.set.mockReset();
        kv.set.mockResolvedValue(undefined);
        toast.error.mockReset();
        savedRuns.loaded = false;
        await savedRuns.load();
    });

    it("keeps the list as it was and says the run was not saved", async () => {
        await savedRuns.save("first", [], STATS);
        kv.set.mockRejectedValue({ code: "common.io" });
        const before = savedRuns.runs.map((r) => r.id);
        expect(await savedRuns.save("second", [], STATS)).toBe(false);
        expect(savedRuns.runs.map((r) => r.id)).toEqual(before);
        expect(toast.error).toHaveBeenCalledTimes(1);
        expect(toast.error.mock.calls[0][0]).toBe("Couldn't save that run. Try again.");
    });

    it("keeps the run and says it was not deleted", async () => {
        await savedRuns.save("first", [], STATS);
        const [kept] = savedRuns.runs;
        kv.set.mockRejectedValue(new Error("disk full"));
        expect(await savedRuns.remove(kept.id)).toBe(false);
        expect(savedRuns.runs.map((r) => r.id)).toEqual([kept.id]);
        expect(toast.error.mock.calls[0][0]).toBe("Couldn't delete that run. Try again.");
    });

    it("stays quiet when the write works", async () => {
        expect(await savedRuns.save("first", [], STATS)).toBe(true);
        expect(toast.error).not.toHaveBeenCalled();
    });
});
