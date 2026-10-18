import { describe, expect, it } from "vitest";
import { detailState, etaParts, replayState, type DetailInputs, type RecoveryRun } from "./detail-state";

const ID = 42;
const NOW_S = 1_000_000_000;
const DAY_S = 86_400;

function inputs(over: Partial<DetailInputs> = {}): DetailInputs {
    return {
        matchId: ID,
        run: null,
        gameRunning: false,
        gcRecovery: true,
        matchIngest: true,
        headSinceMs: null,
        nowMs: 0,
        ...over,
    };
}

function run(over: Partial<RecoveryRun> = {}): RecoveryRun {
    return { running: true, paused: false, queued: [7, 8, ID], waiting: null, done: 1, total: 4, ...over };
}

describe("detailState", () => {
    it("offers recovery while the game is closed and the toggle is on", () => {
        expect(detailState(inputs())).toEqual({ kind: "recover", consent: false });
    });

    it("asks for consent with the recover button when the toggle is off", () => {
        expect(detailState(inputs({ gcRecovery: false }))).toEqual({ kind: "recover", consent: true });
    });

    it("treats an unknown game state as closed", () => {
        expect(detailState(inputs({ gameRunning: null }))).toEqual({ kind: "recover", consent: false });
    });

    it("points at the game's Match History while the game is open and sharing is on", () => {
        expect(detailState(inputs({ gameRunning: true, gcRecovery: false }))).toEqual({ kind: "open_in_game" });
    });

    it("asks to turn on sharing while the game is open and sharing is off", () => {
        expect(detailState(inputs({ gameRunning: true, matchIngest: false }))).toEqual({ kind: "turn_on_sharing" });
    });

    it("shows a queued match as recovering with time left from its place in line", () => {
        expect(detailState(inputs({ run: run() }))).toEqual({
            kind: "recovering",
            progress: { kind: "eta", secs: 60 },
            fraction: 0,
        });
    });

    it("counts the head match down as time passes", () => {
        const head = run({ queued: [ID] });
        const at = (elapsedMs: number) =>
            detailState(inputs({ run: head, headSinceMs: 5_000, nowMs: 5_000 + elapsedMs }));
        expect(at(0)).toMatchObject({ progress: { kind: "eta", secs: 20 }, fraction: 0 });
        expect(at(8_000)).toMatchObject({ progress: { kind: "eta", secs: 12 }, fraction: 0.4 });
        expect(at(12_500)).toMatchObject({ progress: { kind: "eta", secs: 8 } });
    });

    it("fills the bar for the head match and clamps at full", () => {
        const head = run({ queued: [ID] });
        const state = detailState(inputs({ run: head, headSinceMs: 0, nowMs: 90_000 }));
        expect(state).toMatchObject({ fraction: 1 });
    });

    it("never shows less than a few seconds left", () => {
        const head = run({ queued: [ID] });
        const state = detailState(inputs({ run: head, headSinceMs: 0, nowMs: 90_000 }));
        expect(state).toMatchObject({ progress: { kind: "eta", secs: 3 } });
    });

    it("treats a head match with no recorded start as just started", () => {
        const state = detailState(inputs({ run: run({ queued: [ID] }), headSinceMs: null, nowMs: 9_000 }));
        expect(state).toMatchObject({ progress: { kind: "eta", secs: 20 }, fraction: 0 });
    });

    it("keeps a match behind others at zero with the queue estimate", () => {
        const state = detailState(inputs({ run: run(), headSinceMs: 0, nowMs: 50_000 }));
        expect(state).toEqual({ kind: "recovering", progress: { kind: "eta", secs: 60 }, fraction: 0 });
    });

    it("keeps a queued match recovering while the game is open", () => {
        const state = detailState(inputs({ gameRunning: true, run: run({ waiting: { reason: "game_open" } }) }));
        expect(state).toEqual({ kind: "recovering", progress: { kind: "after_game" }, fraction: 0 });
    });

    it("says when a run held by the daily limit continues", () => {
        const state = detailState(inputs({ run: run({ waiting: { reason: "daily_limit", until: NOW_S } }) }));
        expect(state).toEqual({ kind: "recovering", progress: { kind: "limit", until: NOW_S }, fraction: 0 });
    });

    it("shows a paused run's queued match as paused", () => {
        const state = detailState(inputs({ run: run({ running: false, paused: true }) }));
        expect(state).toEqual({ kind: "recovering", progress: { kind: "paused" }, fraction: 0 });
    });

    it("keeps a stopped head match's bar empty while paused or waiting", () => {
        for (const over of [
            { running: false, paused: true },
            { waiting: { reason: "game_open" as const } },
            { waiting: { reason: "daily_limit" as const, until: NOW_S } },
        ]) {
            const state = detailState(inputs({ run: run({ queued: [ID], ...over }), headSinceMs: 0, nowMs: 10_000 }));
            expect(state).toMatchObject({ kind: "recovering", fraction: 0 });
        }
    });

    it("ignores a run that does not hold the match", () => {
        expect(detailState(inputs({ run: run({ queued: [7, 8] }) }))).toEqual({ kind: "recover", consent: false });
    });

    it("ignores the leftover queue of a finished run", () => {
        expect(detailState(inputs({ run: run({ running: false }) }))).toEqual({ kind: "recover", consent: false });
    });
});

describe("replayState", () => {
    const started = (days: number) => NOW_S - days * DAY_S;

    it("is unknown until coverage loads", () => {
        expect(replayState(ID, started(2), null, NOW_S)).toBeNull();
    });

    it("is available with the days left when the API has it", () => {
        expect(replayState(ID, started(2), [ID], NOW_S)).toEqual({ kind: "available", daysLeft: 28 });
    });

    it("is not available yet for a recent match without one", () => {
        expect(replayState(ID, started(2), [], NOW_S)).toEqual({ kind: "not_yet" });
    });

    it("has expired after 30 days, even when the API has it", () => {
        expect(replayState(ID, started(30), [ID], NOW_S)).toEqual({ kind: "expired" });
    });

    it("has no days left when the match's age is unknown", () => {
        expect(replayState(ID, null, [ID], NOW_S)).toEqual({ kind: "available", daysLeft: null });
        expect(replayState(ID, null, [], NOW_S)).toEqual({ kind: "none" });
    });
});

describe("etaParts", () => {
    it("counts seconds under a minute and whole minutes after", () => {
        expect(etaParts(40)).toEqual({ unit: "seconds", count: 40 });
        expect(etaParts(60)).toEqual({ unit: "minutes", count: 1 });
        expect(etaParts(100)).toEqual({ unit: "minutes", count: 2 });
    });
});
