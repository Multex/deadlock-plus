import { beforeEach, describe, expect, it, vi } from "vitest";

const { toast, openSupport, goto, check } = vi.hoisted(() => ({
    toast: vi.fn(),
    openSupport: vi.fn(),
    goto: vi.fn(),
    check: vi.fn(async () => true),
}));
vi.mock("svelte-sonner", () => ({ toast }));
vi.mock("$app/navigation", () => ({ goto }));
vi.mock("$lib/features/support/support", () => ({ openSupport }));
vi.mock("$lib/features/settings/about", () => ({ getAppInfo: async () => ({ debugBuild: false }) }));
vi.mock("$lib/features/settings/settings.svelte", () => ({
    settings: { ready: Promise.resolve(), autoUpdateCheck: true },
}));
vi.mock("$lib/features/connectivity/online.svelte", () => ({ connectivity: { online: true } }));
vi.mock("./updater.svelte", () => ({ updater: { version: "9.9.9", check } }));
vi.mock("./banner.svelte", () => ({
    updateBanner: { visible: false, refresh: vi.fn(), reveal: vi.fn() },
    reportUpdateShown: vi.fn(),
    installUpdate: vi.fn(),
}));

import { t } from "$lib/core/i18n.svelte";
import type { PollerEnv } from "$lib/core/poller";
import { RECHECK_ON_SHOW_MIN_MS } from "./nudge";
import { createUpdateChecks, type UpdateCheckDeps } from "./launch-check";

function fakeEnv() {
    let hidden = false;
    const listeners = new Set<() => void>();
    const env: PollerEnv = {
        isHidden: () => hidden,
        onVisibilityChange: (cb) => {
            listeners.add(cb);
            return () => listeners.delete(cb);
        },
    };
    const flip = (to: boolean) => {
        hidden = to;
        listeners.forEach((cb) => cb());
    };
    return { env, hide: () => flip(true), show: () => flip(false), listeners };
}

function setup(overrides: Partial<UpdateCheckDeps> = {}) {
    const clock = { now: 0 };
    const visibility = fakeEnv();
    const banner = { visible: false, refresh: vi.fn(), reveal: vi.fn() };
    const deps: UpdateCheckDeps = {
        now: () => clock.now,
        env: visibility.env,
        banner,
        reportShown: vi.fn(),
        install: vi.fn(),
        ...overrides,
    };
    return { checks: createUpdateChecks(deps), clock, visibility, banner, deps };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("update toast", () => {
    beforeEach(() => {
        toast.mockClear();
        openSupport.mockClear();
        goto.mockClear();
        check.mockClear();
    });

    it("offers Install as its main button and support as the secondary one", async () => {
        const { checks, deps } = setup();
        await checks.checkOnLaunch();
        expect(toast).toHaveBeenCalledTimes(1);
        const options = toast.mock.calls[0][1];
        expect(options.action.label).toBe(t("settings.about_page.install", { version: "9.9.9" }));
        expect(options.cancel.label).toBe(t("support.action"));
        options.action.onClick();
        expect(deps.install).toHaveBeenCalledWith("toast");
        options.cancel.onClick();
        expect(openSupport).toHaveBeenCalledTimes(1);
    });

    it("reports the update as shown when it toasts", async () => {
        const { checks, deps } = setup();
        await checks.checkOnLaunch();
        expect(deps.reportShown).toHaveBeenCalledWith("9.9.9");
    });

    it("leaves it to the banner when the banner is already up", async () => {
        const { checks, banner } = setup();
        banner.visible = true;
        await checks.checkOnLaunch();
        expect(banner.refresh).toHaveBeenCalled();
        expect(toast).not.toHaveBeenCalled();
    });
});

describe("re-check on window show", () => {
    beforeEach(() => check.mockClear());

    it("checks again on show only once the last check is old enough", async () => {
        const { checks, clock, visibility } = setup();
        await checks.checkOnLaunch();
        const stop = checks.start();
        expect(check).toHaveBeenCalledTimes(1);

        visibility.hide();
        clock.now = RECHECK_ON_SHOW_MIN_MS - 1;
        visibility.show();
        await settle();
        expect(check).toHaveBeenCalledTimes(1);

        visibility.hide();
        clock.now = RECHECK_ON_SHOW_MIN_MS + 5;
        visibility.show();
        await settle();
        expect(check).toHaveBeenCalledTimes(2);
        stop();
    });

    it("brings a dismissed banner back on every show", () => {
        const { checks, visibility, banner } = setup();
        const stop = checks.start();
        visibility.hide();
        expect(banner.reveal).not.toHaveBeenCalled();
        visibility.show();
        expect(banner.reveal).toHaveBeenCalledTimes(1);
        stop();
    });

    it("stops listening once stopped", () => {
        const { checks, visibility } = setup();
        const stop = checks.start();
        stop();
        expect(visibility.listeners.size).toBe(0);
    });
});
