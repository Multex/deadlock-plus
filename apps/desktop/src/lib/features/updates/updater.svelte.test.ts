import { beforeEach, describe, expect, it, vi } from "vitest";

const { check } = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("$lib/core/updater", () => ({ check }));

import { onBeforeExit } from "$lib/core/exit";
import { updater } from "./updater.svelte";

describe("updater", () => {
    beforeEach(() => {
        check.mockReset();
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
});
