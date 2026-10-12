import { beforeEach, describe, expect, it, vi } from "vitest";

const { openUrl, toastError } = vi.hoisted(() => ({ openUrl: vi.fn(), toastError: vi.fn() }));
vi.mock("svelte-sonner", () => ({ toast: { error: toastError } }));
vi.mock("$lib/core/opener", () => ({ openUrl }));

import { t } from "$lib/core/i18n.svelte";
import { SUPPORT_URL, openSupport } from "./support";

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
