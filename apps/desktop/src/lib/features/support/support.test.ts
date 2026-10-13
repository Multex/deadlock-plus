import { beforeEach, describe, expect, it, vi } from "vitest";

const { openUrl, toastError, trackDiscordInvite } = vi.hoisted(() => ({
    openUrl: vi.fn(),
    toastError: vi.fn(),
    trackDiscordInvite: vi.fn(async () => {}),
}));
vi.mock("$lib/features/telemetry/api", () => ({ trackDiscordInvite }));
vi.mock("svelte-sonner", () => ({ toast: { error: toastError } }));
vi.mock("$lib/core/opener", () => ({ openUrl }));

import { t } from "$lib/core/i18n.svelte";
import { DISCORD_APP_URL, DISCORD_URL, SUPPORT_URL, openDiscord, openSupport } from "./support";

describe("links", () => {
    it("point at the invite and support page that shipped builds open", () => {
        expect(DISCORD_URL).toBe("https://discord.gg/VM9utA3enT");
        expect(DISCORD_APP_URL).toBe("discord://-/invite/VM9utA3enT");
        expect(SUPPORT_URL).toBe("https://ko-fi.com/flintsnow");
    });
});

describe("openDiscord", () => {
    beforeEach(() => {
        openUrl.mockReset();
        toastError.mockReset();
        trackDiscordInvite.mockClear();
    });

    it("opens the invite in the Discord app and records the click", async () => {
        openUrl.mockResolvedValue(undefined);
        openDiscord();
        await vi.waitFor(() => expect(trackDiscordInvite).toHaveBeenCalledTimes(1));
        expect(openUrl.mock.calls).toEqual([[DISCORD_APP_URL]]);
        expect(DISCORD_APP_URL).toBe(`discord://-/invite/${DISCORD_URL.split("/").pop()}`);
    });

    it("falls back to the web invite when the Discord app link cannot open", async () => {
        openUrl.mockRejectedValueOnce(new Error("no handler")).mockResolvedValue(undefined);
        openDiscord();
        await vi.waitFor(() => expect(trackDiscordInvite).toHaveBeenCalledTimes(1));
        expect(openUrl.mock.calls).toEqual([[DISCORD_APP_URL], [DISCORD_URL]]);
        expect(toastError).not.toHaveBeenCalled();
    });

    it("shows an error and records nothing when neither link opens", async () => {
        openUrl.mockRejectedValue(new Error("no browser"));
        openDiscord();
        await vi.waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
        expect(toastError).toHaveBeenCalledWith(t("common.open_link_failed", { error: "no browser" }));
        expect(trackDiscordInvite).not.toHaveBeenCalled();
    });
});

describe("openSupport", () => {
    beforeEach(() => {
        openUrl.mockReset();
        toastError.mockReset();
    });

    it("opens the one support URL and stays quiet when it works", async () => {
        openUrl.mockResolvedValue(undefined);
        openSupport();
        await vi.waitFor(() => expect(openUrl).toHaveBeenCalledTimes(1));
        expect(openUrl).toHaveBeenCalledWith(SUPPORT_URL);
        expect(toastError).not.toHaveBeenCalled();
    });

    it("reports a failed open as an error toast carrying the error text", async () => {
        openUrl.mockRejectedValue(new Error("no browser"));
        openSupport();
        await vi.waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
        expect(toastError).toHaveBeenCalledWith(t("common.open_link_failed", { error: "no browser" }));
        expect(toastError.mock.calls[0][0]).toContain("no browser");
    });

    it("ignores an event passed by a click handler", async () => {
        openUrl.mockResolvedValue(undefined);
        (openSupport as (event?: unknown) => void)({ type: "click" });
        await vi.waitFor(() => expect(openUrl).toHaveBeenCalledWith(SUPPORT_URL));
    });
});
