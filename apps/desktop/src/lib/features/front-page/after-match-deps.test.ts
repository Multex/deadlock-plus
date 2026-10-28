import { describe, expect, it, vi } from "vitest";
import type { RowMode } from "@deadlock-plus/match/list";
import { afterMatchDeps, type AfterMatchEnv } from "./after-match";

const ALL_MODES: Record<RowMode, boolean> = {
    ranked: true,
    unranked: true,
    streetBrawl: true,
    bot: true,
    custom: true,
    other: true,
};

function setup(overrides: Partial<AfterMatchEnv["settings"]> = {}) {
    const env = {
        mainWindow: true,
        settings: {
            frontPageAfterMatch: true,
            frontPageModes: { ...ALL_MODES },
            frontPageOverlayAlert: true,
            ...overrides,
        },
        hasFocus: vi.fn(() => true),
        isHidden: vi.fn(() => false),
        dialogOpen: vi.fn(() => false),
        notifyWaiting: vi.fn(() => Promise.resolve()),
    } satisfies AfterMatchEnv;
    const deps = afterMatchDeps(env, { show: vi.fn(), update: vi.fn() });
    return { env, deps };
}

describe("afterMatchDeps", () => {
    it("tells the overlay a paper is waiting while the alert is on", () => {
        const { env, deps } = setup();
        deps.waiting(7);
        expect(env.notifyWaiting).toHaveBeenCalledTimes(1);
    });

    it("keeps the overlay quiet while the alert is off", () => {
        const { env, deps } = setup({ frontPageOverlayAlert: false });
        deps.waiting(7);
        expect(env.notifyWaiting).not.toHaveBeenCalled();
    });

    it("reads the alert switch at the moment the paper starts waiting", () => {
        const { env, deps } = setup();
        env.settings.frontPageOverlayAlert = false;
        deps.waiting(7);
        expect(env.notifyWaiting).not.toHaveBeenCalled();
    });

    it("swallows an overlay alert that fails", async () => {
        const { env, deps } = setup();
        env.notifyWaiting.mockImplementation(() => Promise.reject(new Error("no overlay")));
        expect(() => deps.waiting(7)).not.toThrow();
        await Promise.resolve();
    });

    it("counts the window as attended only while it has the focus and is shown", () => {
        const { env, deps } = setup();
        expect(deps.attended()).toBe(true);
        env.hasFocus.mockReturnValue(false);
        expect(deps.attended()).toBe(false);
        env.hasFocus.mockReturnValue(true);
        env.isHidden.mockReturnValue(true);
        expect(deps.attended()).toBe(false);
    });

    it("is covered while a dialog is open", () => {
        const { env, deps } = setup();
        expect(deps.covered()).toBe(false);
        env.dialogOpen.mockReturnValue(true);
        expect(deps.covered()).toBe(true);
    });

    it("runs only for modes switched on, with the paper itself on", () => {
        const { env, deps } = setup();
        env.settings.frontPageModes.bot = false;
        expect(deps.enabled("ranked")).toBe(true);
        expect(deps.enabled("bot")).toBe(false);
        env.settings.frontPageAfterMatch = false;
        expect(deps.enabled("ranked")).toBe(false);
    });
});
