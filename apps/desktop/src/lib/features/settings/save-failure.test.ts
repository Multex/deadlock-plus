import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => ({ values: new Map<string, unknown>(), set: vi.fn() }));
const ipc = vi.hoisted(() => ({ command: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));

vi.mock("$lib/core/kv", () => ({
    kvGet: vi.fn(async (_store: string, key: string) => kv.values.get(key) ?? null),
    kvSet: kv.set,
}));
vi.mock("$lib/core/tauri", () => ({
    command: ipc.command,
    listen: vi.fn(async () => () => {}),
    fileSrc: (p: string) => p,
}));
vi.mock("$lib/core/deadlock-api", () => ({ deadlockApi: {} }));
vi.mock("svelte-sonner", () => ({ toast }));

import { settings } from "./settings.svelte";
import { DEFAULT_THEME } from "./themes";

const SAVE_FAILED = "Couldn't save that setting. It was changed back.";

describe("a setting that fails to save", () => {
    beforeEach(async () => {
        kv.values.clear();
        kv.set.mockReset();
        kv.set.mockResolvedValue(undefined);
        ipc.command.mockReset();
        ipc.command.mockResolvedValue(null);
        toast.error.mockReset();
        await settings.init();
    });

    it("goes back to the stored value and says so once", async () => {
        kv.set.mockRejectedValue({ code: "common.io" });
        await expect(settings.setTheme(DEFAULT_THEME === "midnight" ? "void" : "midnight")).resolves.toBeUndefined();
        expect(settings.theme).toBe(DEFAULT_THEME);
        expect(toast.error).toHaveBeenCalledTimes(1);
        expect(toast.error.mock.calls[0][0]).toBe(SAVE_FAILED);
    });

    it("shows one toast for a whole slider drag and lands on the stored value", async () => {
        const start = settings.uiScale;
        kv.set.mockRejectedValue(new Error("disk full"));
        await Promise.all([110, 120, 130].map((v) => settings.setUiScale(v)));
        expect(settings.uiScale).toBe(start);
        const ids = new Set(toast.error.mock.calls.map((c) => c[1]?.id));
        expect(ids.size).toBe(1);
        expect([...ids][0]).toBeTruthy();
    });

    it("goes back when the backend refuses the change", async () => {
        ipc.command.mockImplementation(async (name: string) => {
            if (name === "set_overlay_settings") throw { code: "common.internal" };
            return null;
        });
        const before = settings.overlay.enabled;
        await settings.setOverlay({ enabled: !before });
        expect(settings.overlay.enabled).toBe(before);
        expect(kv.set).not.toHaveBeenCalled();
        expect(toast.error.mock.calls[0][0]).toBe(SAVE_FAILED);
    });

    it("goes back to the last value that did save", async () => {
        await settings.setMotion("reduce");
        kv.set.mockRejectedValue({ code: "common.io" });
        await settings.setMotion("full");
        expect(settings.motion).toBe("reduce");
    });

    it("stays quiet when a save works", async () => {
        await settings.setBreakHint(true);
        expect(settings.breakHint).toBe(true);
        expect(toast.error).not.toHaveBeenCalled();
    });
});
