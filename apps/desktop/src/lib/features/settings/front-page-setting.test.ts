import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => ({ values: new Map<string, unknown>(), set: vi.fn() }));

vi.mock("$lib/core/kv", () => ({
    kvGet: vi.fn(async (_store: string, key: string) => kv.values.get(key) ?? null),
    kvSet: kv.set,
}));
vi.mock("$lib/core/tauri", () => ({
    command: vi.fn(async () => null),
    listen: vi.fn(async () => () => {}),
    fileSrc: (p: string) => p,
}));
vi.mock("$lib/core/deadlock-api", () => ({ deadlockApi: {} }));

import { settings } from "./settings.svelte";

describe("front page after each match setting", () => {
    beforeEach(() => {
        kv.values.clear();
        kv.set.mockClear();
    });

    it("is on when nothing is stored", async () => {
        await settings.init();
        expect(settings.frontPageAfterMatch).toBe(true);
    });

    it("reads a stored choice", async () => {
        kv.values.set("frontPageAfterMatch", false);
        await settings.init();
        expect(settings.frontPageAfterMatch).toBe(false);
    });

    it("keeps the default for a value that is not a yes or no", async () => {
        kv.values.set("frontPageAfterMatch", "nope");
        await settings.init();
        expect(settings.frontPageAfterMatch).toBe(true);
    });

    it("saves a change to the app settings", async () => {
        await settings.setFrontPageAfterMatch(false);
        expect(settings.frontPageAfterMatch).toBe(false);
        expect(kv.set).toHaveBeenCalledWith("app-settings", "frontPageAfterMatch", false);
    });
});
