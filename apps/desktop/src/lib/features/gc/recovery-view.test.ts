import { describe, expect, it } from "vitest";
import { agoParts, durationParts, lastRunEnding, recoveryView } from "./recovery-view";

import type { LastRun } from "@deadlock-plus/ipc-types/LastRun";
import type { OwnRecovery } from "@deadlock-plus/ipc-types/OwnRecovery";

const own = (over: Partial<OwnRecovery> = {}): OwnRecovery => ({
    running: true,
    paused: false,
    waiting: null,
    done: 12,
    total: 31,
    delivered: 11,
    failed: 1,
    queued: [],
    etaSecs: 380,
    accounts: [],
    outcome: null,
    error: null,
    ...over,
});

describe("recoveryView", () => {
    it("offers Start for the missing matches before any run", () => {
        const view = recoveryView(null, 31);
        expect(view.phase).toBe("idle");
        expect(view.actions).toEqual(["start"]);
        expect(view.done).toBe(0);
        expect(view.total).toBe(31);
        expect(view.etaSecs).toBe(31 * 20);
    });

    it("has nothing to start when nothing is missing", () => {
        expect(recoveryView(null, 0).actions).toEqual([]);
    });

    it("counts a running run and lets it be paused or cancelled", () => {
        const view = recoveryView(own(), 31);
        expect(view.phase).toBe("running");
        expect(view.actions).toEqual(["pause", "cancel"]);
        expect([view.done, view.total, view.etaSecs]).toEqual([12, 31, 380]);
    });

    it("takes the run's growing total over the strip's count", () => {
        expect(recoveryView(own({ total: 240 }), 31).total).toBe(240);
    });

    it("resumes a paused run, even across a restart that left it not running", () => {
        for (const running of [true, false]) {
            const view = recoveryView(own({ running, paused: true }), 31);
            expect(view.phase).toBe("paused");
            expect(view.actions).toEqual(["resume", "cancel"]);
        }
    });

    it("waits while Deadlock is open", () => {
        const view = recoveryView(own({ waiting: { reason: "game_open" } }), 31);
        expect(view.phase).toBe("waiting_game");
        expect(view.actions).toEqual(["pause", "cancel"]);
    });

    it("waits for the daily limit", () => {
        const view = recoveryView(own({ waiting: { reason: "daily_limit", until: 1_700_000_000 } }), 31);
        expect(view.phase).toBe("waiting_limit");
        expect(view.actions).toEqual(["pause", "cancel"]);
    });

    it("shows a finished run and offers another when matches are still missing", () => {
        const ended = own({ running: false, done: 31, outcome: "done" });
        const view = recoveryView(ended, 4);
        expect(view.phase).toBe("done");
        expect(view.outcome).toBe("done");
        expect([view.done, view.total]).toEqual([31, 31]);
        expect(view.actions).toEqual(["start"]);
        expect(recoveryView(ended, 0).actions).toEqual([]);
    });

    it("treats a run that never reported an outcome as idle once it stops", () => {
        expect(recoveryView(own({ running: false }), 5).phase).toBe("idle");
    });

    it("shows each account's use of the daily limit", () => {
        const view = recoveryView(
            own({
                accounts: [
                    { accountId: 1, delivered: 7, usedToday: 8, rateLimited: false },
                    { accountId: 2, delivered: 40, usedToday: 40, rateLimited: true },
                ],
            }),
            31,
        );
        expect(view.accounts).toEqual([
            { accountId: 1, usedToday: 8, limit: 40, rateLimited: false },
            { accountId: 2, usedToday: 40, limit: 40, rateLimited: true },
        ]);
    });

    it("shows every account's use today before any run", () => {
        const idle = own({
            running: false,
            done: 0,
            total: 0,
            accounts: [
                { accountId: 1, delivered: 0, usedToday: 0, rateLimited: false },
                { accountId: 2, delivered: 0, usedToday: 12, rateLimited: false },
            ],
        });
        const view = recoveryView(idle, 31);
        expect(view.phase).toBe("idle");
        expect([view.done, view.total]).toEqual([0, 31]);
        expect(view.accounts).toEqual([
            { accountId: 1, usedToday: 0, limit: 40, rateLimited: false },
            { accountId: 2, usedToday: 12, limit: 40, rateLimited: false },
        ]);
    });

    it("has no account cards without any recovery state", () => {
        expect(recoveryView(null, 31).accounts).toEqual([]);
    });
});

describe("durationParts", () => {
    it("rounds to whole minutes, never below one", () => {
        expect(durationParts(0)).toEqual({ hours: 0, minutes: 1 });
        expect(durationParts(20)).toEqual({ hours: 0, minutes: 1 });
        expect(durationParts(380)).toEqual({ hours: 0, minutes: 6 });
    });

    it("splits hours from minutes", () => {
        expect(durationParts(3600)).toEqual({ hours: 1, minutes: 0 });
        expect(durationParts(100 * 20)).toEqual({ hours: 0, minutes: 33 });
        expect(durationParts(5 * 3600 + 25 * 60)).toEqual({ hours: 5, minutes: 25 });
    });
});

describe("agoParts", () => {
    const now = 1_700_000_000;

    it("says just now for under a minute", () => {
        expect(agoParts(now - 30, now)).toEqual({ unit: "now" });
        expect(agoParts(now + 5, now)).toEqual({ unit: "now" });
    });

    it("counts minutes, hours, then days", () => {
        expect(agoParts(now - 5 * 60, now)).toEqual({ unit: "minutes", count: 5 });
        expect(agoParts(now - 2 * 3600, now)).toEqual({ unit: "hours", count: 2 });
        expect(agoParts(now - 30 * 3600, now)).toEqual({ unit: "yesterday" });
        expect(agoParts(now - 3 * 86_400, now)).toEqual({ unit: "days", count: 3 });
    });
});

describe("lastRunEnding", () => {
    const last = (over: Partial<LastRun>): LastRun => ({
        endedAt: 0,
        delivered: 10,
        left: 0,
        outcome: "done",
        ...over,
    });

    it("names the daily limit when that ended the run", () => {
        expect(lastRunEnding(last({ outcome: "rate_limited", left: 60 }))).toBe("limit");
    });

    it("says nothing is left after a complete run", () => {
        expect(lastRunEnding(last({ outcome: "done" }))).toBe("nothing_left");
    });

    it("counts what is left after a stop", () => {
        expect(lastRunEnding(last({ outcome: "stopped", left: 9 }))).toBe("left");
        expect(lastRunEnding(last({ outcome: "incomplete", left: 2 }))).toBe("left");
    });

    it("reports a failed run", () => {
        expect(lastRunEnding(last({ outcome: "failed", left: 31 }))).toBe("failed");
    });
});
