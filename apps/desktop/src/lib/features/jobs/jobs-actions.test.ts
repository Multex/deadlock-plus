import { beforeEach, describe, expect, it, vi } from "vitest";

const { answers, toast } = vi.hoisted(() => ({
    answers: new Map<string, () => unknown>(),
    toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));
vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(async (name: string) => answers.get(name)?.()),
    fileSrc: (path: string) => path,
    listen: vi.fn(async () => () => {}),
}));
vi.mock("svelte-sonner", () => ({ toast }));

import { jobs } from "./jobs.svelte";

const SNAPSHOT = { jobs: [], gameRunning: false, catalog: [], allEnabled: true, disabled: [] };
const fail = () => Promise.reject(new Error("mutex poisoned"));

describe("background task settings that fail to save", () => {
    beforeEach(() => {
        answers.clear();
        answers.set("jobs_snapshot", () => SNAPSHOT);
        toast.error.mockReset();
    });

    for (const [name, run] of [
        ["set_all_jobs_enabled", () => jobs.setAllEnabled(false)],
        ["set_job_enabled", () => jobs.setEnabled("patch-notes-index", false)],
        ["set_job_policy", () => jobs.setPolicy("patch-notes-index", "always")],
        ["force_run_job", () => jobs.forceRun("patch-notes-index")],
    ] as const) {
        it(`${name} failing settles, re-reads the real state and says so`, async () => {
            answers.set(name, fail);
            await expect(run()).resolves.toBeUndefined();
            expect(jobs.snapshot).toEqual(SNAPSHOT);
            expect(toast.error).toHaveBeenCalledTimes(1);
            expect(toast.error.mock.calls[0][0]).not.toMatch(/mutex|log/i);
        });
    }
});
