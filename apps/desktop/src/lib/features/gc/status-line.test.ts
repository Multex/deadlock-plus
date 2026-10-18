import { describe, expect, it } from "vitest";
import { formatDate } from "$lib/core/i18n.svelte";
import { continuesText, gcStatusLine, lastRunLine, ownRecoveryLine } from "./status-line";

import type { GcStatus } from "@deadlock-plus/ipc-types/GcStatus";
import type { LastRun } from "@deadlock-plus/ipc-types/LastRun";
import type { OwnRecovery } from "@deadlock-plus/ipc-types/OwnRecovery";

const status = (over: Partial<GcStatus> = {}): GcStatus => ({
    running: true,
    accounts: 1,
    delivered: 0,
    lastError: null,
    ownRecovery: null,
    lastRun: null,
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
            "Couldn't use your saved Steam login. Sign in to Steam on this PC with Remember me ticked, then try again.",
        );
    });

    it("waits for the first pass before an account count exists", () => {
        expect(gcStatusLine(true, status({ accounts: 0 }))).toBe("Looking for a saved Steam login.");
    });

    it("reports a failed pass", () => {
        expect(gcStatusLine(true, status({ lastError: { code: "common.network", params: {} } }))).toBe(
            "Last check failed: A network request failed. Check your connection and try again.",
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
    paused: false,
    waiting: null,
    done: 0,
    total: 0,
    delivered: 0,
    failed: 0,
    queued: [],
    etaSecs: 0,
    accounts: [],
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
        expect(ownRecoveryLine(own({ running: true, total: 12, done: 4, delivered: 3 }))).toBe(
            "3 of 12 missing matches submitted. About 20 seconds each.",
        );
    });

    it("says when nothing was missing", () => {
        expect(ownRecoveryLine(own({ outcome: "done" }))).toBe(
            "Done. The community database already has all your matches.",
        );
    });

    it("reports each ending", () => {
        expect(ownRecoveryLine(own({ outcome: "done", total: 2, done: 2, delivered: 2 }))).toBe(
            "Done. 2 matches submitted.",
        );
        expect(ownRecoveryLine(own({ outcome: "incomplete", total: 3, done: 3, delivered: 2, failed: 1 }))).toBe(
            "2 matches submitted, 1 couldn't be recovered. Run it again to retry.",
        );
        expect(ownRecoveryLine(own({ outcome: "rate_limited", total: 90, done: 40, delivered: 40 }))).toBe(
            "40 matches submitted. Steam's daily limit was reached. Run it again tomorrow for the rest.",
        );
        expect(ownRecoveryLine(own({ outcome: "stopped", total: 9, done: 1, delivered: 1 }))).toBe(
            "Stopped after 1 match. Run it again to continue.",
        );
    });

    it("explains a failed start", () => {
        expect(ownRecoveryLine(own({ outcome: "failed", error: { code: "gc.no_login", params: {} } }))).toBe(
            "Couldn't use your saved Steam login. Sign in to Steam on this PC with Remember me ticked, then try again.",
        );
    });
});

const local = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime() / 1000;
const clock = (s: number) => formatDate(s * 1000, { hour: "numeric", minute: "2-digit" });

describe("ownRecoveryLine while waiting", () => {
    const now = local(2026, 10, 18, 9);

    it("counts what is left while paused", () => {
        expect(ownRecoveryLine(own({ running: true, paused: true, total: 100, done: 40 }), now)).toBe(
            "Paused: 60 left",
        );
    });

    it("waits for Deadlock to close", () => {
        expect(
            ownRecoveryLine(own({ running: true, waiting: { reason: "game_open" }, total: 31, done: 12 }), now),
        ).toBe("19 left. Continues when Deadlock closes.");
    });

    it("says when the daily limit lets it continue", () => {
        const until = local(2026, 10, 18, 14, 30);
        expect(ownRecoveryLine(own({ running: true, waiting: { reason: "daily_limit", until }, total: 31 }), now)).toBe(
            `Steam's daily limit reached. Continues at ${clock(until)}.`,
        );
    });
});

describe("continuesText", () => {
    const now = local(2026, 10, 18, 22);

    it("gives the time on the same day", () => {
        const until = local(2026, 10, 18, 23, 15);
        expect(continuesText(until, now)).toBe(`Continues at ${clock(until)}`);
    });

    it("says tomorrow once the day changes", () => {
        const until = local(2026, 10, 19, 8, 5);
        expect(continuesText(until, now)).toBe(`Continues tomorrow at ${clock(until)}`);
    });
});

describe("lastRunLine", () => {
    const now = 1_700_000_000;
    const last = (over: Partial<LastRun> = {}): LastRun => ({
        endedAt: now - 3 * 86_400,
        delivered: 140,
        left: 0,
        outcome: "done",
        ...over,
    });

    it("is empty before any run ended", () => {
        expect(lastRunLine(null, now)).toBe("");
    });

    it("says nothing is left after a complete run", () => {
        expect(lastRunLine(last(), now)).toBe("Last run 3 days ago: 140 submitted, nothing left");
    });

    it("names Steam's daily limit", () => {
        expect(lastRunLine(last({ endedAt: now - 2 * 3600, outcome: "rate_limited", left: 60 }), now)).toBe(
            "Last run 2 hours ago: 140 submitted, 60 left (Steam's daily limit)",
        );
    });

    it("counts what a stopped run left", () => {
        expect(lastRunLine(last({ endedAt: now - 30 * 3600, outcome: "stopped", left: 9, delivered: 22 }), now)).toBe(
            "Last run yesterday: 22 submitted, 9 left",
        );
    });

    it("reports a failed run", () => {
        expect(lastRunLine(last({ endedAt: now - 10, outcome: "failed", left: 31, delivered: 0 }), now)).toBe(
            "Last run just now failed",
        );
    });

    it("counts minutes in the singular", () => {
        expect(lastRunLine(last({ endedAt: now - 60 }), now)).toBe(
            "Last run 1 minute ago: 140 submitted, nothing left",
        );
    });
});
