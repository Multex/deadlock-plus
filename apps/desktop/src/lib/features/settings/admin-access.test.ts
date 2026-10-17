import { describe, expect, it } from "vitest";
import type { AdminAccessStatus } from "@deadlock-plus/ipc-types/AdminAccessStatus";
import { adminAccessRow } from "./admin-access";

const status = (over: Partial<AdminAccessStatus>): AdminAccessStatus => ({
    elevated: false,
    route: "needsPermission",
    canPrompt: true,
    gameRunsAsAdmin: false,
    ...over,
});

describe("adminAccessRow", () => {
    it("is hidden until the status is known", () => {
        expect(adminAccessRow(null)).toBeNull();
    });

    it("is hidden while the app runs elevated and where no helper exists", () => {
        expect(adminAccessRow(status({ elevated: true, route: "inProcess" }))).toBeNull();
        expect(adminAccessRow(status({ route: "inProcess" }))).toBeNull();
    });

    it("selects Always allow when the service serves the app", () => {
        expect(adminAccessRow(status({ route: "service" }))).toEqual({ choice: "always", afterMatch: false });
    });

    it("selects Ask each time otherwise, including access allowed for this session only", () => {
        expect(adminAccessRow(status({ route: "needsPermission" }))?.choice).toBe("ask");
        expect(adminAccessRow(status({ route: "helper" }))?.choice).toBe("ask");
    });

    it("waits for the match to end before either choice can change", () => {
        expect(adminAccessRow(status({ canPrompt: false }))).toEqual({ choice: "ask", afterMatch: true });
        expect(adminAccessRow(status({ route: "service", canPrompt: false }))).toEqual({
            choice: "always",
            afterMatch: true,
        });
    });
});
