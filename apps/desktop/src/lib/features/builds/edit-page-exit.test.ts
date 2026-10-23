import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/core/tauri", () => ({ command: vi.fn(), listen: vi.fn() }));
vi.mock("$lib/core/i18n.svelte", () => ({
    i18n: { locale: "en", onLocaleChange: () => () => {} },
    t: (key: string) => key,
}));

const { runBeforeExit } = await import("$lib/core/exit");
const { EXIT_FLUSH_MS, flushOnExit } = await import("./edit-page");

describe("flushOnExit", () => {
    let stop: () => void = () => {};

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        stop();
        vi.useRealTimers();
    });

    it("stores the open editor's draft before the app quits and waits for it", async () => {
        let finish!: () => void;
        const flushDraft = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
        stop = flushOnExit(() => ({ flushDraft }));
        let done = false;
        const exiting = runBeforeExit().then(() => (done = true));
        await vi.advanceTimersByTimeAsync(0);
        expect(flushDraft).toHaveBeenCalledOnce();
        expect(done).toBe(false);
        finish();
        await exiting;
        expect(done).toBe(true);
    });

    it("lets the quit go on when the draft save hangs", async () => {
        stop = flushOnExit(() => ({ flushDraft: () => new Promise<void>(() => {}) }));
        let done = false;
        void runBeforeExit().then(() => (done = true));
        await vi.advanceTimersByTimeAsync(EXIT_FLUSH_MS - 1);
        expect(done).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(done).toBe(true);
    });

    it("does nothing with no editor open or once stopped", async () => {
        const flushDraft = vi.fn(async () => {});
        stop = flushOnExit(() => null);
        await runBeforeExit();
        stop();
        stop = flushOnExit(() => ({ flushDraft }));
        stop();
        await runBeforeExit();
        expect(flushDraft).not.toHaveBeenCalled();
    });
});
