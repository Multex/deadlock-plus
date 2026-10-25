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

describe("Dispatch alerts setting", () => {
    beforeEach(() => {
        kv.values.clear();
        kv.set.mockClear();
    });

    it("is on when nothing is stored", async () => {
        await settings.init();
        expect(settings.dispatchAlerts).toBe(true);
    });

    it("reads a stored choice", async () => {
        kv.values.set("dispatchAlerts", false);
        await settings.init();
        expect(settings.dispatchAlerts).toBe(false);
    });

    it("ignores a stored value that is not a boolean", async () => {
        kv.values.set("dispatchAlerts", "nope");
        await settings.init();
        expect(settings.dispatchAlerts).toBe(true);
    });

    it("saves a change", async () => {
        await settings.setDispatchAlerts(false);
        expect(settings.dispatchAlerts).toBe(false);
        expect(kv.set).toHaveBeenCalledWith("app-settings", "dispatchAlerts", false);
    });
});
