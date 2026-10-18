import { describe, expect, it } from "vitest";
import { formatDate } from "$lib/core/i18n.svelte";
import { durationText, recoveryBarItem } from "./recovery-bar";

import type { OwnRecovery } from "@deadlock-plus/ipc-types/OwnRecovery";

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

describe("recoveryBarItem", () => {
    it("is hidden with no run", () => {
        expect(recoveryBarItem(null)).toBeNull();
    });

    it("is hidden once a run has ended", () => {
        expect(recoveryBarItem(own({ outcome: "done", total: 28, done: 28, delivered: 28 }))).toBeNull();
    });

    it("counts progress with time left in the tooltip", () => {
        expect(recoveryBarItem(own({ running: true, done: 12, total: 28, etaSecs: 320 }))).toEqual({
            key: "shell.statusbar.recovery.running",
            params: { done: "12", total: "28" },
            title: "About 5 min left",
            percent: (12 / 28) * 100,
            dim: false,
        });
    });

    it("shows no bar while the history is still being read", () => {
        expect(recoveryBarItem(own({ running: true }))).toEqual({
            key: "shell.statusbar.recovery.reading",
            params: {},
            title: "Reading your match history.",
            percent: null,
            dim: false,
        });
    });

    it("says paused and dims the bar", () => {
        expect(recoveryBarItem(own({ running: true, paused: true, done: 12, total: 28 }))).toEqual({
            key: "shell.statusbar.recovery.paused",
            params: {},
            title: "Paused: 16 left",
            percent: (12 / 28) * 100,
            dim: true,
        });
    });

    it("waits for Deadlock to close", () => {
        const item = recoveryBarItem(own({ running: true, waiting: { reason: "game_open" }, done: 12, total: 28 }));
        expect(item?.key).toBe("shell.statusbar.recovery.waiting_game");
        expect(item?.title).toBe("16 left. Continues when Deadlock closes.");
        expect(item?.dim).toBe(true);
    });

    it("waits for Steam's daily limit with the time it continues", () => {
        const now = new Date(2026, 9, 18, 9, 0).getTime() / 1000;
        const until = new Date(2026, 9, 18, 14, 30).getTime() / 1000;
        const item = recoveryBarItem(
            own({ running: true, waiting: { reason: "daily_limit", until }, done: 12, total: 28 }),
            now,
        );
        const time = formatDate(until * 1000, { hour: "numeric", minute: "2-digit" });
        expect(item?.key).toBe("shell.statusbar.recovery.waiting_limit");
        expect(item?.title).toBe(`Steam's daily limit reached. Continues at ${time}.`);
        expect(item?.dim).toBe(true);
    });
});

describe("durationText", () => {
    it("uses minutes under an hour", () => {
        expect(durationText(320)).toBe("5 min");
    });

    it("uses hours and minutes past an hour", () => {
        expect(durationText(3600)).toBe("1 h");
        expect(durationText(5400)).toBe("1 h 30 min");
    });
});
