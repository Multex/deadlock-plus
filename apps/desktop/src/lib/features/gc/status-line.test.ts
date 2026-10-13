import { describe, expect, it } from "vitest";
import { gcStatusLine } from "./status-line";

import type { GcStatus } from "@deadlock-plus/ipc-types/GcStatus";

const status = (over: Partial<GcStatus> = {}): GcStatus => ({
    running: true,
    accounts: 1,
    delivered: 0,
    lastError: null,
    ...over,
});

describe("gcStatusLine", () => {
    it("says off when disabled, whatever the backend reports", () => {
        expect(gcStatusLine(false, status({ delivered: 5 }))).toBe("Off");
    });

    it("stays empty until the first status arrives", () => {
        expect(gcStatusLine(true, null)).toBe("");
    });

    it("explains a missing Steam login", () => {
        expect(gcStatusLine(true, status({ accounts: 0, lastError: { code: "gc.no_login", params: {} } }))).toBe(
            "No saved Steam login could be used.",
        );
    });

    it("waits for the first pass before an account count exists", () => {
        expect(gcStatusLine(true, status({ accounts: 0 }))).toBe("Looking for a saved Steam login.");
    });

    it("reports a failed pass", () => {
        expect(gcStatusLine(true, status({ lastError: { code: "common.network", params: {} } }))).toBe(
            "Last pass failed: A network request failed. Check your connection and try again.",
        );
    });

    it("counts submissions and accounts", () => {
        expect(gcStatusLine(true, status({ accounts: 1, delivered: 3 }))).toBe(
            "Using 1 Steam account. 3 submitted this session.",
        );
        expect(gcStatusLine(true, status({ accounts: 2, delivered: 0 }))).toBe(
            "Using 2 Steam accounts. 0 submitted this session.",
        );
    });
});
