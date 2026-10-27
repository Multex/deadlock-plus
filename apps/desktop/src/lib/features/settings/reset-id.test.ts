import { beforeEach, describe, expect, it, vi } from "vitest";

const ipc = vi.hoisted(() => ({ command: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));

vi.mock("$lib/core/kv", () => ({
    kvGet: vi.fn(async () => null),
    kvSet: vi.fn(async () => {}),
}));
vi.mock("$lib/core/tauri", () => ({
    command: ipc.command,
    listen: vi.fn(async () => () => {}),
    fileSrc: (p: string) => p,
}));
vi.mock("$lib/core/deadlock-api", () => ({ deadlockApi: {} }));
vi.mock("svelte-sonner", () => ({ toast }));

import { settings } from "./settings.svelte";

describe("resetting the usage data ID", () => {
    beforeEach(async () => {
        ipc.command.mockReset();
        ipc.command.mockResolvedValue(null);
        toast.error.mockReset();
        toast.success.mockReset();
        await settings.init();
    });

    it("confirms when it works", async () => {
        await settings.resetTelemetryId();
        expect(toast.success).toHaveBeenCalledWith("Usage data ID reset.");
        expect(toast.error).not.toHaveBeenCalled();
    });

    it("says it failed instead of staying silent", async () => {
        ipc.command.mockImplementation(async (name: string) => {
            if (name === "reset_telemetry_id") throw { code: "common.internal" };
            return null;
        });
        await expect(settings.resetTelemetryId()).resolves.toBeUndefined();
        expect(toast.success).not.toHaveBeenCalled();
        expect(toast.error).toHaveBeenCalledTimes(1);
        expect(toast.error.mock.calls[0][0]).toBe("Couldn't reset the usage data ID. Try again.");
    });
});
