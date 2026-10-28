import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("svelte-sonner", () => ({ toast }));

import { runRecovery, type RecoveryKind } from "./recovery-action";

const EXPECTED: Record<RecoveryKind, string> = {
    start: "Couldn't start recovery. Try again.",
    pause: "Couldn't pause recovery.",
    resume: "Couldn't resume recovery.",
    cancel: "Couldn't stop recovery.",
    match: "Couldn't recover that match. Try again.",
    replay: "Couldn't recover that replay. Try again.",
};

describe("a recovery action that fails", () => {
    beforeEach(() => toast.error.mockReset());

    it.each(Object.entries(EXPECTED))("says what %s could not do", async (kind, text) => {
        await expect(
            runRecovery(kind as RecoveryKind, async () => {
                throw { code: "common.internal" };
            }),
        ).resolves.toBe(false);
        expect(toast.error).toHaveBeenCalledTimes(1);
        expect(toast.error.mock.calls[0][0]).toBe(text);
    });

    it("never shows developer text", async () => {
        await runRecovery("match", async () => {
            throw new Error("steam gc timeout at gc.rs");
        });
        expect(toast.error.mock.calls[0][0]).not.toMatch(/gc\.rs|timeout/);
    });

    it("stays quiet when the action works", async () => {
        await expect(runRecovery("start", async () => {})).resolves.toBe(true);
        expect(toast.error).not.toHaveBeenCalled();
    });
});
