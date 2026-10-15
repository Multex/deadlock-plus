import { describe, expect, it, vi } from "vitest";
import type { Match, Outcome } from "@deadlock-plus/stats/stats";
import { createBreakReminder, LOSS_STREAK } from "./break-reminder";

const START_S = 1_000_000;
const GAME_S = 1_800;

function match(id: number, startTime: number, outcome: Outcome, over: Partial<Match> = {}): Match {
    return {
        matchId: id,
        heroId: 1,
        startTime,
        matchMode: 4,
        gameMode: 1,
        outcome,
        kills: 0,
        deaths: 0,
        assists: 0,
        netWorth: 0,
        durationS: GAME_S,
        rankBadge: 0,
        rankDelta: null,
        calibration: false,
        demotionProtected: false,
        ...over,
    };
}

function setup(enabled = true) {
    let nowS = START_S;
    let on = enabled;
    const notify = vi.fn();
    const observe = createBreakReminder({ now: () => nowS * 1000, enabled: () => on, notify });
    const matches: Match[] = [];
    let nextStart = START_S + 60;
    const play = (outcome: Outcome, over: Partial<Match> = {}) => {
        const m = match(matches.length + 1, nextStart, outcome, over);
        matches.push(m);
        nextStart += GAME_S + 120;
        nowS = m.startTime + m.durationS + 30;
        observe([...matches]);
    };
    const pause = (s: number) => {
        nextStart += s;
    };
    return { notify, observe, matches, play, pause, setEnabled: (v: boolean) => (on = v) };
}

describe("break reminder", () => {
    it("fires once when the third loss in a row finishes", () => {
        expect(LOSS_STREAK).toBe(3);
        const { notify, play } = setup();
        play("loss");
        play("loss");
        expect(notify).not.toHaveBeenCalled();
        play("loss");
        expect(notify).toHaveBeenCalledOnce();
        expect(notify).toHaveBeenCalledWith(3);
    });

    it("does not fire again while the same streak goes on", () => {
        const { notify, play } = setup();
        for (let i = 0; i < 5; i++) play("loss");
        expect(notify).toHaveBeenCalledOnce();
    });

    it("fires again for a fresh streak after a win", () => {
        const { notify, play } = setup();
        for (let i = 0; i < 3; i++) play("loss");
        play("win");
        play("loss");
        play("loss");
        expect(notify).toHaveBeenCalledOnce();
        play("loss");
        expect(notify).toHaveBeenCalledTimes(2);
    });

    it("fires again for a streak in a new session", () => {
        const { notify, play, pause } = setup();
        for (let i = 0; i < 3; i++) play("loss");
        pause(3 * 3600);
        play("loss");
        play("loss");
        expect(notify).toHaveBeenCalledOnce();
        play("loss");
        expect(notify).toHaveBeenCalledTimes(2);
    });

    it("never fires for a streak that was already there when the app started", () => {
        const notify = vi.fn();
        let nowS = START_S;
        const observe = createBreakReminder({ now: () => nowS * 1000, enabled: () => true, notify });
        const old = [0, 1, 2].map((i) => match(i + 1, START_S - 3 * 2000 + i * 2000 - GAME_S, "loss"));
        observe(old);
        nowS = START_S + 2400;
        observe([...old, match(4, START_S + 300, "loss")]);
        expect(notify).not.toHaveBeenCalled();
    });

    it("fires when a streak begun before the start reaches the limit while the app runs", () => {
        const notify = vi.fn();
        let nowS = START_S;
        const observe = createBreakReminder({ now: () => nowS * 1000, enabled: () => true, notify });
        const old = [0, 1].map((i) => match(i + 1, START_S - 2 * 2000 + i * 2000 - GAME_S, "loss"));
        observe(old);
        nowS = START_S + 2400;
        observe([...old, match(3, START_S + 300, "loss")]);
        expect(notify).toHaveBeenCalledWith(3);
    });

    it("stays quiet with the setting off, and turning it on later does not replay that streak", () => {
        const { notify, play, setEnabled } = setup(false);
        for (let i = 0; i < 3; i++) play("loss");
        setEnabled(true);
        play("loss");
        expect(notify).not.toHaveBeenCalled();
    });

    it("ignores bot games, like the Match History note", () => {
        const { notify, play } = setup();
        play("loss");
        play("loss");
        play("loss", { matchMode: 3 });
        expect(notify).not.toHaveBeenCalled();
    });

    it("does not fire twice when a missed earlier loss shows up later", () => {
        const { notify, matches, observe, play } = setup();
        play("win");
        for (let i = 0; i < 3; i++) play("loss");
        expect(notify).toHaveBeenCalledOnce();
        const win = matches[0];
        observe(matches.map((m) => (m === win ? { ...m, outcome: "loss" as const } : m)));
        expect(notify).toHaveBeenCalledOnce();
    });
});
