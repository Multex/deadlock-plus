import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
    pendingCrash: vi.fn(),
    revealCrashBundle: vi.fn(),
    openCrashIssue: vi.fn(),
    dismissCrash: vi.fn(),
}));
const toast = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock("./crash", () => api);
vi.mock("svelte-sonner", () => ({ toast }));

import { crashPrompt } from "./crash-prompt.svelte";

describe("crash prompt actions that fail", () => {
    beforeEach(async () => {
        for (const fn of Object.values(api)) fn.mockReset();
        toast.error.mockReset();
        api.pendingCrash.mockResolvedValue({ id: "7", kind: "panic" });
        await crashPrompt.init();
    });

    it("says the report folder did not open", async () => {
        api.revealCrashBundle.mockRejectedValue({ code: "common.internal" });
        expect(await crashPrompt.reveal()).toBeUndefined();
        expect(toast.error).toHaveBeenCalledTimes(1);
        expect(toast.error.mock.calls[0][0]).toBe("Couldn't open the report folder.");
        expect(crashPrompt.busy).toBe(false);
    });

    it("says the issue page did not open", async () => {
        api.openCrashIssue.mockRejectedValue(new Error("no default browser"));
        await crashPrompt.openIssue();
        expect(toast.error).toHaveBeenCalledTimes(1);
        expect(toast.error.mock.calls[0][0]).toBe("Couldn't open the GitHub issue page.");
    });

    it("stays quiet when the action works", async () => {
        api.revealCrashBundle.mockResolvedValue("C:/reports/7");
        await crashPrompt.reveal();
        expect(toast.error).not.toHaveBeenCalled();
        expect(crashPrompt.reportPath).toBe("C:/reports/7");
    });
});
