import { beforeEach, describe, expect, it, vi } from "vitest";

const { openUrl, toastError } = vi.hoisted(() => ({ openUrl: vi.fn(), toastError: vi.fn() }));
vi.mock("svelte-sonner", () => ({ toast: { error: toastError } }));
vi.mock("./opener", () => ({ openUrl }));

import { t } from "./i18n.svelte";
import { openWithDeeplink } from "./deeplink";
import { openLink } from "./open-link";

describe("openLink", () => {
    beforeEach(() => {
        openUrl.mockReset();
        toastError.mockReset();
        vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    it("opens the link and shows nothing", async () => {
        openUrl.mockResolvedValue(undefined);
        await openLink("https://example.test");
        expect(openUrl).toHaveBeenCalledWith("https://example.test");
        expect(toastError).not.toHaveBeenCalled();
    });

    it("shows a plain message and logs the raw error when the link cannot open", async () => {
        openUrl.mockRejectedValue("Not allowed to open url https://example.test");
        await openLink("https://example.test");
        expect(toastError).toHaveBeenCalledWith(t("common.link_open_failed"));
        expect(String(toastError.mock.calls)).not.toContain("Not allowed");
        expect(String(vi.mocked(console.warn).mock.calls)).toContain("Not allowed to open url");
    });

    it("keeps an unsupported Steam link out of the message", async () => {
        await openLink("steam://nav/games", openWithDeeplink);
        expect(toastError).toHaveBeenCalledWith(t("common.link_open_failed"));
        expect(String(toastError.mock.calls)).not.toContain("unsupported");
    });
});
