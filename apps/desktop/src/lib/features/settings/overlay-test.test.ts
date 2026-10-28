import { beforeEach, describe, expect, it, vi } from "vitest";

const ipc = vi.hoisted(() => ({ command: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock("$lib/core/tauri", () => ({
    command: ipc.command,
    listen: vi.fn(async () => () => {}),
    fileSrc: (p: string) => p,
}));
vi.mock("svelte-sonner", () => ({ toast }));

import { runOverlayTest } from "./overlay-test";

describe("the overlay test", () => {
    beforeEach(() => {
        ipc.command.mockReset();
        toast.error.mockReset();
    });

    it("stays quiet when the notification shows", async () => {
        ipc.command.mockResolvedValue(null);
        await runOverlayTest();
        expect(ipc.command).toHaveBeenCalledWith("show_overlay_test");
        expect(toast.error).not.toHaveBeenCalled();
    });

    it("says the test notification did not show", async () => {
        ipc.command.mockRejectedValue({ code: "common.internal" });
        await expect(runOverlayTest()).resolves.toBeUndefined();
        expect(toast.error).toHaveBeenCalledTimes(1);
        expect(toast.error.mock.calls[0][0]).toBe("Couldn't show the test notification. Try again.");
    });

    it("never shows developer text", async () => {
        ipc.command.mockRejectedValue(new Error("pipe closed at overlay.rs"));
        await runOverlayTest();
        expect(toast.error.mock.calls[0][0]).not.toMatch(/pipe|overlay\.rs/);
    });
});
