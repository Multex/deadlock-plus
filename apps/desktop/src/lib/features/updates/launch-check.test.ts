import { beforeEach, describe, expect, it, vi } from "vitest";

const { toast, openSupport, goto } = vi.hoisted(() => ({ toast: vi.fn(), openSupport: vi.fn(), goto: vi.fn() }));
vi.mock("svelte-sonner", () => ({ toast }));
vi.mock("$app/navigation", () => ({ goto }));
vi.mock("$lib/features/support/support", () => ({ openSupport }));
vi.mock("$lib/features/settings/about", () => ({ getAppInfo: async () => ({ debugBuild: false }) }));
vi.mock("$lib/features/settings/settings.svelte", () => ({
    settings: { ready: Promise.resolve(), autoUpdateCheck: true },
}));
vi.mock("$lib/features/connectivity/online.svelte", () => ({ connectivity: { online: true } }));
vi.mock("./updater.svelte", () => ({ updater: { version: "9.9.9", check: async () => true } }));

import { t } from "$lib/core/i18n.svelte";
import { checkOnLaunch } from "./launch-check";

describe("update toast", () => {
    beforeEach(() => {
        toast.mockClear();
        openSupport.mockClear();
        goto.mockClear();
    });

    it("offers the support link as its secondary button, next to Details", async () => {
        await checkOnLaunch();
        expect(toast).toHaveBeenCalledTimes(1);
        const options = toast.mock.calls[0][1];
        expect(options.action.label).toBe(t("updates.toast_details"));
        expect(options.cancel.label).toBe(t("support.action"));
        options.cancel.onClick();
        expect(openSupport).toHaveBeenCalledTimes(1);
        expect(goto).not.toHaveBeenCalled();
    });
});
