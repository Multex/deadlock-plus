import { beforeEach, describe, expect, it, vi } from "vitest";

const { check, command, settings, host } = vi.hoisted(() => {
    const settings = {
        updateChannel: "release" as "release" | "beta" | "nightly",
        setUpdateChannel: vi.fn(async (channel: "release" | "beta" | "nightly") => {
            settings.updateChannel = channel;
        }),
    };
    return { check: vi.fn(), command: vi.fn(), settings, host: { platform: "windows" as "windows" | "linux" } };
});
vi.mock("./api", () => ({ checkUpdate: check }));
vi.mock("$lib/core/tauri", () => ({ command, listen: vi.fn() }));
vi.mock("$lib/features/settings/settings.svelte", () => ({ settings }));
vi.mock("$lib/core/platform", () => ({
    get platform() {
        return host.platform;
    },
}));

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
        updater.notes = null;
        updater.checkError = null;
        host.platform = "windows";
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

    describe("a stalled download", () => {
        type OnEvent = (event: { event: string; data?: Record<string, number> }) => void;

        function stalling() {
            const calls: OnEvent[] = [];
            const update = {
                version: "9.9.9",
                download: vi.fn((onEvent: OnEvent) => {
                    calls.push(onEvent);
                    return new Promise<void>(() => {});
                }),
                install: vi.fn(),
            };
            check.mockResolvedValue(update);
            return { update, calls };
        }

        async function run(body: () => Promise<void>) {
            vi.useFakeTimers({ now: 0 });
            try {
                await body();
            } finally {
                vi.useRealTimers();
            }
        }

        it("fails as a download when no first byte arrives in 30 s", () =>
            run(async () => {
                stalling();
                await updater.check();
                const downloading = updater.download();
                await vi.advanceTimersByTimeAsync(29_900);
                expect(updater.phase).toBe("downloading");
                await vi.advanceTimersByTimeAsync(100);
                expect(await downloading).toBe(false);
                expect(updater.phase).toBe("error");
                expect(updater.error).toBe("download");
            }));

        it("fails once bytes stop for 45 s, however long it ran before", () =>
            run(async () => {
                const { calls } = stalling();
                await updater.check();
                const downloading = updater.download();
                calls[0]!({ event: "Started", data: { contentLength: 1000 } });
                for (let i = 0; i < 4; i++) {
                    await vi.advanceTimersByTimeAsync(40_000);
                    calls[0]!({ event: "Progress", data: { chunkLength: 10 } });
                }
                expect(updater.phase).toBe("downloading");
                await vi.advanceTimersByTimeAsync(44_900);
                expect(updater.phase).toBe("downloading");
                await vi.advanceTimersByTimeAsync(100);
                expect(await downloading).toBe(false);
                expect(updater.error).toBe("download");
            }));

        it("starts over on retry and ignores the stalled attempt", () =>
            run(async () => {
                const { update, calls } = stalling();
                await updater.check();
                const first = updater.download();
                await vi.advanceTimersByTimeAsync(30_000);
                await first;
                const second = updater.download();
                expect(update.download).toHaveBeenCalledTimes(2);
                expect(updater.phase).toBe("downloading");
                expect(updater.received).toBe(0);
                calls[0]!({ event: "Progress", data: { chunkLength: 500 } });
                expect(updater.received).toBe(0);
                calls[1]!({ event: "Progress", data: { chunkLength: 10 } });
                expect(updater.received).toBe(10);
                await vi.advanceTimersByTimeAsync(45_000);
                expect(await second).toBe(false);
            }));
    });

    describe("release notes", () => {
        it("keeps the found update's notes", async () => {
            check.mockResolvedValue({ version: "9.9.9", body: "### Fixed\n\n- Things", download: vi.fn() });
            await updater.check();
            expect(updater.notes).toBe("### Fixed\n\n- Things");
        });

        it("has none for an update with an empty body, or no update", async () => {
            check.mockResolvedValue({ version: "9.9.9", body: "  ", download: vi.fn() });
            await updater.check();
            expect(updater.notes).toBeNull();
            check.mockResolvedValue({ version: "9.9.9", body: "notes", download: vi.fn() });
            await updater.check();
            check.mockResolvedValue(null);
            await updater.check();
            expect(updater.notes).toBeNull();
        });
    });

    describe("download progress", () => {
        type Event = { event: string; data?: Record<string, number> };

        it("counts bytes and works out the speed over the last few seconds", async () => {
            vi.useFakeTimers({ now: 0 });
            const seen: { received: number; total: number | null; speed: number | null }[] = [];
            const record = () => seen.push({ received: updater.received, total: updater.total, speed: updater.speed });
            try {
                check.mockResolvedValue({
                    version: "9.9.9",
                    download: vi.fn(async (onEvent: (e: Event) => void) => {
                        onEvent({ event: "Started", data: { contentLength: 10_000 } });
                        onEvent({ event: "Progress", data: { chunkLength: 250 } });
                        record();
                        vi.setSystemTime(500);
                        onEvent({ event: "Progress", data: { chunkLength: 250 } });
                        record();
                        vi.setSystemTime(4500);
                        onEvent({ event: "Progress", data: { chunkLength: 500 } });
                        record();
                    }),
                });
                await updater.check();
                await updater.download();
            } finally {
                vi.useRealTimers();
            }
            expect(seen).toEqual([
                { received: 250, total: 10_000, speed: null },
                { received: 500, total: 10_000, speed: 1000 },
                { received: 1000, total: 10_000, speed: 125 },
            ]);
            expect(updater.progress).toBe(0.1);
        });

        it("has no total when the server sends no length", async () => {
            check.mockResolvedValue({
                version: "9.9.9",
                download: vi.fn(async (onEvent: (e: Event) => void) => {
                    onEvent({ event: "Started", data: {} });
                    onEvent({ event: "Progress", data: { chunkLength: 10 } });
                }),
            });
            await updater.check();
            await updater.download();
            expect(updater.total).toBeNull();
            expect(updater.received).toBe(10);
            expect(updater.progress).toBeNull();
        });
    });

    describe("download, then restart", () => {
        function staged() {
            const steps: string[] = [];
            command.mockImplementation(async (name: string) => void steps.push(name));
            const update = {
                version: "9.9.9",
                download: vi.fn(async () => void steps.push("download")),
                install: vi.fn(async () => void steps.push("install")),
            };
            check.mockResolvedValue(update);
            const remove = onBeforeExit(() => steps.push("save"));
            return { steps, update, remove };
        }

        it("downloads into ready and runs nothing yet", async () => {
            const { steps, remove } = staged();
            await updater.check();
            expect(await updater.download()).toBe(true);
            remove();
            expect(updater.phase).toBe("ready");
            expect(steps).toEqual(["download"]);
        });

        it("keeps a ready update through a recheck and a channel switch", async () => {
            const { remove } = staged();
            await updater.check();
            await updater.download();
            check.mockClear();
            expect(await updater.check()).toBe(true);
            await updater.setChannel("beta");
            remove();
            expect(check).not.toHaveBeenCalled();
            expect(updater.phase).toBe("ready");
            expect(updater.version).toBe("9.9.9");
        });

        it("on Windows saves and flushes, then hands over to the installer", async () => {
            const { steps, remove } = staged();
            await updater.check();
            await updater.download();
            await updater.restart();
            remove();
            expect(steps).toEqual(["download", "save", "flush_telemetry", "install"]);
        });

        it("on Linux installs, then saves and relaunches", async () => {
            host.platform = "linux";
            const { steps, remove } = staged();
            await updater.check();
            await updater.download();
            await updater.restart();
            remove();
            expect(steps).toEqual(["download", "flush_telemetry", "install", "save", "restart_app"]);
        });

        it("relaunches on Linux after the one-step install too", async () => {
            host.platform = "linux";
            const { steps, remove } = staged();
            await updater.check();
            await updater.install();
            remove();
            expect(steps).toEqual(["download", "flush_telemetry", "install", "save", "restart_app"]);
        });

        it("on Windows still hands over to the installer when a before-exit task never settles", async () => {
            vi.useFakeTimers();
            try {
                const { update, remove } = staged();
                const removeStuck = onBeforeExit(() => new Promise(() => {}));
                await updater.check();
                await updater.download();
                const restarting = updater.restart();
                await vi.advanceTimersByTimeAsync(2900);
                expect(update.install).not.toHaveBeenCalled();
                await vi.advanceTimersByTimeAsync(100);
                await restarting;
                removeStuck();
                remove();
                expect(update.install).toHaveBeenCalledOnce();
            } finally {
                vi.useRealTimers();
            }
        });

        it("starts the installer once when Restart is pressed again while it starts", async () => {
            const { update, remove } = staged();
            await updater.check();
            await updater.download();
            await Promise.all([updater.restart(), updater.restart()]);
            remove();
            expect(update.install).toHaveBeenCalledOnce();
        });

        it("keeps a download that started while a recheck was out", async () => {
            let finishDownload = () => {};
            const found = {
                version: "9.9.9",
                download: vi.fn(() => new Promise<void>((resolve) => (finishDownload = resolve))),
                install: vi.fn(),
            };
            check.mockResolvedValueOnce(found);
            await updater.check();
            let answer: (update: unknown) => void = () => {};
            check.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
            const rechecking = updater.check();
            const downloading = updater.download();
            answer({ ...found, download: vi.fn(), install: vi.fn() });
            await rechecking;
            expect(updater.phase).toBe("downloading");
            finishDownload();
            expect(await downloading).toBe(true);
            expect(updater.phase).toBe("ready");
            expect(found.download).toHaveBeenCalledOnce();
        });

        it("does nothing before a download finished", async () => {
            const { update, remove } = staged();
            await updater.check();
            await updater.restart();
            remove();
            expect(update.install).not.toHaveBeenCalled();
        });

        it("records a failed install by step", async () => {
            const { update, remove } = staged();
            update.install.mockRejectedValue("installer refused");
            await updater.check();
            await updater.download();
            await updater.restart();
            remove();
            expect(updater.phase).toBe("error");
            expect(updater.error).toBe("install");
            expect(command).not.toHaveBeenCalledWith("restart_app");
        });
    });

    describe("check errors", () => {
        it("keeps an update already found when a later check fails", async () => {
            check.mockResolvedValue({ version: "9.9.9", body: "notes", download: vi.fn() });
            await updater.check();
            check.mockRejectedValue(new Error("offline"));
            expect(await updater.check()).toBe(true);
            expect(updater.phase).toBe("available");
            expect(updater.version).toBe("9.9.9");
            expect(updater.notes).toBe("notes");
            expect(updater.error).toBeNull();
            expect(updater.checkError?.message).toBe(
                "Couldn't check for updates. Check your connection and try again.",
            );
        });

        it("stays available while rechecking, so the banner never blinks", async () => {
            check.mockResolvedValue({ version: "9.9.9", download: vi.fn() });
            await updater.check();
            let answer: (update: unknown) => void = () => {};
            check.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
            const rechecking = updater.check();
            expect(updater.phase).toBe("available");
            answer({ version: "9.9.10", download: vi.fn() });
            await rechecking;
            expect(updater.version).toBe("9.9.10");
        });

        it("still shows a failed check as an error when nothing was found", async () => {
            check.mockResolvedValue(null);
            await updater.check();
            check.mockRejectedValue(new Error("offline"));
            expect(await updater.check()).toBe(false);
            expect(updater.phase).toBe("error");
            expect(updater.error).toBe("check");
        });

        it("keeps a failed check's text and time without showing anything", async () => {
            vi.useFakeTimers({ now: 1234 });
            try {
                check.mockRejectedValue(new Error("error sending request for url"));
                await updater.check();
            } finally {
                vi.useRealTimers();
            }
            expect(updater.checkError).toEqual({
                message: "Couldn't check for updates. Check your connection and try again.",
                at: 1234,
            });
        });

        it("clears it once a check succeeds", async () => {
            check.mockRejectedValue(new Error("offline"));
            await updater.check();
            check.mockResolvedValue(null);
            await updater.check();
            expect(updater.checkError).toBeNull();
        });
    });
});
