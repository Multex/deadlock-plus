import { beforeEach, describe, expect, it, vi } from "vitest";

const { check, command } = vi.hoisted(() => ({ check: vi.fn(), command: vi.fn() }));
vi.mock("$lib/core/updater", () => ({ check }));
vi.mock("$lib/core/tauri", () => ({ command, listen: vi.fn() }));

import { onBeforeExit } from "$lib/core/exit";
import { updater } from "./updater.svelte";

describe("updater", () => {
    beforeEach(() => {
        check.mockReset();
        command.mockReset();
        command.mockResolvedValue(undefined);
        updater.phase = "idle";
        updater.error = null;
        vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    it("records a failed check by step and keeps the raw error for the log", async () => {
        check.mockRejectedValue(new Error("error sending request for url"));
        expect(await updater.check()).toBe(false);
        expect(updater.phase).toBe("error");
        expect(updater.error).toBe("check");
        expect(String(vi.mocked(console.warn).mock.calls)).toContain("error sending request for url");
    });

    it("records a failed download by step", async () => {
        check.mockResolvedValue({
            version: "9.9.9",
            download: vi.fn(async () => {
                throw "signature mismatch";
            }),
            install: vi.fn(),
        });
        await updater.check();
        await updater.install();
        expect(updater.phase).toBe("error");
        expect(updater.error).toBe("download");
        expect(String(vi.mocked(console.warn).mock.calls)).toContain("signature mismatch");
    });

    it("runs the before-exit tasks after the download and before the installer takes over", async () => {
        const steps: string[] = [];
        check.mockResolvedValue({
            version: "9.9.9",
            download: vi.fn(async () => void steps.push("download")),
            install: vi.fn(async () => void steps.push("install")),
        });
        const remove = onBeforeExit(() => steps.push("save"));
        await updater.check();
        await updater.install();
        remove();
        expect(steps).toEqual(["download", "save", "install"]);
    });

    it("does not install or run the before-exit tasks when the download fails", async () => {
        const install = vi.fn();
        const save = vi.fn();
        check.mockResolvedValue({
            version: "9.9.9",
            download: vi.fn(async () => {
                throw "network down";
            }),
            install,
        });
        const remove = onBeforeExit(save);
        await updater.check();
        await updater.install();
        remove();
        expect(install).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
    });

    it("sends the queued telemetry before the installer closes the app", async () => {
        const steps: string[] = [];
        let answer = () => {};
        command.mockImplementation(async (name: string) => {
            if (name !== "flush_telemetry") return;
            steps.push("flush");
            await new Promise<void>((resolve) => (answer = resolve));
            steps.push("flushed");
        });
        check.mockResolvedValue({
            version: "9.9.9",
            download: vi.fn(async () => void steps.push("download")),
            install: vi.fn(async () => void steps.push("install")),
        });
        await updater.check();
        const installing = updater.install();
        await vi.waitFor(() => expect(steps).toContain("flush"));
        expect(steps).not.toContain("install");
        answer();
        await installing;
        expect(steps).toEqual(["download", "flush", "flushed", "install"]);
    });

    it("still installs when the telemetry flush fails", async () => {
        const install = vi.fn();
        command.mockImplementation(async (name: string) => {
            if (name === "flush_telemetry") throw "telemetry is unavailable";
        });
        check.mockResolvedValue({ version: "9.9.9", download: vi.fn(async () => {}), install });
        await updater.check();
        await updater.install();
        expect(install).toHaveBeenCalledOnce();
        expect(updater.phase).toBe("downloading");
        expect(updater.error).toBeNull();
    });

    it("stops waiting on a telemetry flush that never answers", async () => {
        vi.useFakeTimers();
        try {
            const install = vi.fn();
            command.mockImplementation((name: string) =>
                name === "flush_telemetry" ? new Promise(() => {}) : Promise.resolve(),
            );
            check.mockResolvedValue({ version: "9.9.9", download: vi.fn(async () => {}), install });
            await updater.check();
            const installing = updater.install();
            await vi.advanceTimersByTimeAsync(1900);
            expect(install).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(100);
            await installing;
            expect(install).toHaveBeenCalledOnce();
        } finally {
            vi.useRealTimers();
        }
    });
});
