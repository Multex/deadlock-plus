import { describe, expect, it } from "vitest";
import { gcStatusLine, ownRecoveryLine } from "./status-line";

import type { GcStatus } from "@deadlock-plus/ipc-types/GcStatus";
import type { OwnRecovery } from "@deadlock-plus/ipc-types/OwnRecovery";

const status = (over: Partial<GcStatus> = {}): GcStatus => ({
    running: true,
    accounts: 1,
    delivered: 0,
    lastError: null,
    ownRecovery: null,
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

const own = (over: Partial<OwnRecovery> = {}): OwnRecovery => ({
    running: false,
    missing: 0,
    delivered: 0,
    failed: 0,
    outcome: null,
    error: null,
    ...over,
});

describe("ownRecoveryLine", () => {
    it("is empty before the first run", () => {
        expect(ownRecoveryLine(null)).toBe("");
    });

    it("reads the history before anything is missing", () => {
        expect(ownRecoveryLine(own({ running: true }))).toBe("Reading your match history.");
    });

    it("shows progress while running", () => {
        expect(ownRecoveryLine(own({ running: true, missing: 12, delivered: 3 }))).toBe(
            "3 of 12 missing matches submitted. About 20 seconds each.",
        );
    });

    it("says when nothing was missing", () => {
        expect(ownRecoveryLine(own({ outcome: "done" }))).toBe(
            "Done. The community database already has all your matches.",
        );
    });

    it("reports each ending", () => {
        expect(ownRecoveryLine(own({ outcome: "done", missing: 2, delivered: 2 }))).toBe("Done. 2 matches submitted.");
        expect(ownRecoveryLine(own({ outcome: "incomplete", missing: 3, delivered: 2, failed: 1 }))).toBe(
            "2 matches submitted, 1 couldn't be recovered. Run it again to retry.",
        );
        expect(ownRecoveryLine(own({ outcome: "rate_limited", missing: 90, delivered: 40 }))).toBe(
            "40 matches submitted. Steam's limit was reached, run it again tomorrow for the rest.",
        );
        expect(ownRecoveryLine(own({ outcome: "stopped", missing: 9, delivered: 1 }))).toBe(
            "Stopped after 1 match. Run it again to continue.",
        );
    });

    it("explains a failed start", () => {
        expect(ownRecoveryLine(own({ outcome: "failed", error: { code: "gc.no_login", params: {} } }))).toBe(
            "No saved Steam login could be used.",
        );
    });
});
