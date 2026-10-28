import { beforeEach, describe, expect, it, vi } from "vitest";

const { check, command, settings } = vi.hoisted(() => {
    const settings = {
        updateChannel: "release" as "release" | "beta" | "nightly",
        setUpdateChannel: vi.fn(async (channel: "release" | "beta" | "nightly") => {
            settings.updateChannel = channel;
        }),
    };
    return { check: vi.fn(), command: vi.fn(), settings };
});
vi.mock("./api", () => ({ checkUpdate: check }));
vi.mock("$lib/core/tauri", () => ({ command, listen: vi.fn() }));
vi.mock("$lib/features/settings/settings.svelte", () => ({ settings }));

import { onBeforeExit } from "$lib/core/exit";
import { updater } from "./updater.svelte";

describe("updater", () => {
    beforeEach(() => {
        check.mockReset();
        command.mockReset();
        command.mockResolvedValue(undefined);
        updater.phase = "idle";
        updater.error = null;
        updater.version = null;
        settings.updateChannel = "release";
        settings.setUpdateChannel.mockClear();
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

    it("checks the channel the setting names", async () => {
        check.mockResolvedValue(null);
        await updater.check();
        expect(check).toHaveBeenLastCalledWith("release");
        settings.updateChannel = "nightly";
        await updater.check();
        expect(check).toHaveBeenLastCalledWith("nightly");
        expect(updater.channel).toBe("nightly");
    });

    it("saves a new channel and checks it at once", async () => {
        check.mockResolvedValue({ version: "1.0.0-beta.1", download: vi.fn(), install: vi.fn() });
        expect(await updater.setChannel("beta")).toBe(true);
        expect(settings.setUpdateChannel).toHaveBeenCalledWith("beta");
        expect(check).toHaveBeenLastCalledWith("beta");
        expect(updater.channel).toBe("beta");
        expect(updater.phase).toBe("available");
        expect(updater.version).toBe("1.0.0-beta.1");
    });

    it("forgets an update the old channel offered once the new one has none", async () => {
        settings.updateChannel = "beta";
        check.mockResolvedValue({ version: "1.0.0-beta.1", download: vi.fn(), install: vi.fn() });
        await updater.check();
        check.mockResolvedValue(null);
        expect(await updater.setChannel("release")).toBe(false);
        expect(updater.phase).toBe("upToDate");
        expect(updater.version).toBeNull();
    });

    it("drops an answer for the old channel that arrives after the switch", async () => {
        let answerRelease: (update: unknown) => void = () => {};
        check.mockImplementation((channel: string) =>
            channel === "release"
                ? new Promise((resolve) => (answerRelease = resolve))
                : Promise.resolve({ version: "1.0.0-nightly.20261028", download: vi.fn(), install: vi.fn() }),
        );
        const first = updater.check();
        const switched = updater.setChannel("nightly");
        answerRelease({ version: "0.9.9", download: vi.fn(), install: vi.fn() });
        await Promise.all([first, switched]);
        expect(check).toHaveBeenLastCalledWith("nightly");
        expect(updater.version).toBe("1.0.0-nightly.20261028");
        expect(updater.phase).toBe("available");
    });

    it("keeps the channel and checks nothing when saving it fails", async () => {
        settings.setUpdateChannel.mockImplementationOnce(async () => {});
        check.mockResolvedValue(null);
        expect(await updater.setChannel("beta")).toBe(false);
        expect(updater.channel).toBe("release");
        expect(check).not.toHaveBeenCalled();
    });

    it("does not switch the update out from under a download in progress", async () => {
        check.mockResolvedValue({ version: "9.9.9", download: vi.fn(() => new Promise(() => {})), install: vi.fn() });
        await updater.check();
        void updater.install();
        check.mockClear();
        await updater.setChannel("beta");
        expect(settings.updateChannel).toBe("beta");
        expect(check).not.toHaveBeenCalled();
        expect(updater.phase).toBe("downloading");
        expect(updater.version).toBe("9.9.9");
    });
});
