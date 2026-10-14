import { beforeEach, describe, expect, it, vi } from "vitest";

const { check } = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("$lib/core/updater", () => ({ check }));

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
            downloadAndInstall: vi.fn(async () => {
                throw "signature mismatch";
            }),
        });
        await updater.check();
        await updater.install();
        expect(updater.phase).toBe("error");
        expect(updater.error).toBe("download");
        expect(String(vi.mocked(console.warn).mock.calls)).toContain("signature mismatch");
    });
});
