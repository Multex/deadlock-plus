import { beforeEach, describe, expect, it, vi } from "vitest";

const { answers } = vi.hoisted(() => ({ answers: new Map<string, () => unknown>() }));
vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(async (name: string) => answers.get(name)?.()),
    fileSrc: (path: string) => path,
    listen: vi.fn(async () => () => {}),
}));
vi.mock("$lib/features/settings/settings.svelte", () => ({ settings: { ready: Promise.resolve() } }));

import { loadNextMaintenance } from "./maintenance";

describe("loadNextMaintenance", () => {
    beforeEach(() => answers.clear());

    it("answers the next start time", async () => {
        answers.set("next_maintenance", () => 1_700_000_000);
        await expect(loadNextMaintenance()).resolves.toBe(1_700_000_000);
    });

    it("answers null, so Home hides the line, when the command answers garbage", async () => {
        answers.set("next_maintenance", () => ({ garbage: true }));
        await expect(loadNextMaintenance()).resolves.toBeNull();
    });

    it("answers null when the command fails", async () => {
        answers.set("next_maintenance", () => {
            throw { code: "common.internal" };
        });
        await expect(loadNextMaintenance()).resolves.toBeNull();
    });
});
