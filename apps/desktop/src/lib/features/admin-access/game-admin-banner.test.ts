import { describe, expect, it } from "vitest";
import type { AdminAccessStatus } from "@deadlock-plus/ipc-types/AdminAccessStatus";
import { showGameAdminBanner } from "./game-admin-banner";

const status = (gameRunsAsAdmin: boolean): AdminAccessStatus => ({
    elevated: false,
    route: "needsPermission",
    canPrompt: true,
    gameRunsAsAdmin,
});

describe("showGameAdminBanner", () => {
    it("shows while the game runs as administrator", () => {
        expect(showGameAdminBanner(status(true), "/")).toBe(true);
        expect(showGameAdminBanner(status(true), "/match-history")).toBe(true);
    });

    it("hides when the game does not run as administrator or the status is unknown", () => {
        expect(showGameAdminBanner(status(false), "/")).toBe(false);
        expect(showGameAdminBanner(null, "/")).toBe(false);
    });

    it("hides on the Live page, where its own card covers it", () => {
        expect(showGameAdminBanner(status(true), "/live")).toBe(false);
        expect(showGameAdminBanner(status(true), "/live/")).toBe(false);
    });

    it("does not mistake other routes starting with live", () => {
        expect(showGameAdminBanner(status(true), "/livestock")).toBe(true);
    });
});
