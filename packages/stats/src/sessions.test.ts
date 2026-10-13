import { describe, expect, it } from "vitest";
import {
    groupSessions,
    MIN_SAMPLE,
    summarizeSession,
    sessionVerdict,
    sessionHighlight,
    type SessionSummary,
    shouldSuggestBreak,
} from "./sessions";
import type { Match, Outcome } from "./stats";

const MIN = 60;
let id = 0;
const m = (startMin: number, outcome: Outcome = "win", over: Partial<Match> = {}): Match => ({
    matchId: ++id,
    heroId: 1,
    startTime: startMin * MIN,
    matchMode: 4,
    gameMode: 1,
    outcome,
    kills: 0,
    deaths: 0,
    assists: 0,
    netWorth: 0,
    durationS: 30 * MIN,
    rankBadge: 0,
    rankDelta: null,
    calibration: false,
    demotionProtected: false,
    ...over,
});

describe("groupSessions", () => {
    it("splits when the gap after a match ends exceeds the threshold", () => {
        // Match 1 ends at minute 30; match 2 starts at 100 (70 min gap); match 3 starts at 135 (5 min gap).
        const s = groupSessions([m(0), m(100), m(135)], 60 * MIN);
        expect(s.map((x) => x.matches.length)).toEqual([1, 2]);
    });

    it("keeps a gap equal to the threshold in the same session", () => {
        const s = groupSessions([m(0), m(90)], 60 * MIN);
        expect(s).toHaveLength(1);
    });

    it("sorts unordered input and returns nothing for none", () => {
        expect(groupSessions([], 60 * MIN)).toEqual([]);
        const s = groupSessions([m(40), m(0)], 60 * MIN);
        expect(s[0].matches.map((x) => x.startTime)).toEqual([0, 40 * MIN]);
    });
});

describe("summarizeSession", () => {
    it("counts scored games, W/L, net delta and span", () => {
        const [s] = groupSessions(
            [m(0, "win", { rankDelta: 10 }), m(35, "loss", { rankDelta: -4 }), m(70, "unscored")],
            60 * MIN,
        );
        const sum = summarizeSession(s);
        expect(sum).toMatchObject({ games: 2, wins: 1, losses: 1, unscored: 1, netDelta: 6 });
        expect(sum.durationS).toBe(100 * MIN);
        expect(sum.startTime).toBe(0);
    });

    it("has a null net delta when no match carries one", () => {
        const [s] = groupSessions([m(0)], 60 * MIN);
        expect(summarizeSession(s).netDelta).toBeNull();
    });
});

describe("shouldSuggestBreak", () => {
    it("fires after a loss streak inside the current session", () => {
        const sessions = groupSessions([m(0, "win"), m(35, "loss"), m(70, "loss"), m(105, "loss")], 60 * MIN);
        expect(shouldSuggestBreak(sessions, 3, 105 * MIN + 40 * MIN, 60 * MIN)).toBe(true);
    });

    it("stays quiet when the session is over", () => {
        const sessions = groupSessions([m(0, "loss"), m(35, "loss"), m(70, "loss")], 60 * MIN);
        expect(shouldSuggestBreak(sessions, 3, 70 * MIN + 30 * MIN + 61 * MIN, 60 * MIN)).toBe(false);
    });

    it("stays quiet when the streak is shorter than the limit", () => {
        const sessions = groupSessions([m(0, "loss"), m(35, "loss")], 60 * MIN);
        expect(shouldSuggestBreak(sessions, 3, 80 * MIN, 60 * MIN)).toBe(false);
    });
});

describe("MIN_SAMPLE", () => {
    it("is a positive sample floor", () => {
        expect(MIN_SAMPLE).toBeGreaterThan(0);
    });
});

describe("sessionVerdict", () => {
    const sum = (over: Partial<SessionSummary>): SessionSummary => ({
        startTime: 0,
        durationS: 3600,
        games: 4,
        wins: 2,
        losses: 2,
        unscored: 0,
        netDelta: null,
        ...over,
    });

    it("is neutral for a single game", () => {
        expect(sessionVerdict(sum({ games: 1, wins: 1, losses: 0 }))).toBe("neutral");
    });

    it("uses winrate when there is no rank change", () => {
        expect(sessionVerdict(sum({ games: 5, wins: 3, losses: 2 }))).toBe("good");
        expect(sessionVerdict(sum({ games: 5, wins: 1, losses: 4 }))).toBe("bad");
        expect(sessionVerdict(sum({ games: 4, wins: 2, losses: 2 }))).toBe("neutral");
    });

    it("uses rank change when there is one", () => {
        expect(sessionVerdict(sum({ wins: 3, losses: 2, games: 5, netDelta: 500 }))).toBe("good");
        expect(sessionVerdict(sum({ wins: 2, losses: 3, games: 5, netDelta: -500 }))).toBe("bad");
    });

    it("stays neutral when the rank change is small or disagrees with the winrate", () => {
        expect(sessionVerdict(sum({ netDelta: 100 }))).toBe("neutral");
        expect(sessionVerdict(sum({ wins: 1, losses: 3, games: 4, netDelta: 400 }))).toBe("neutral");
    });
});

describe("sessionVerdict excellent", () => {
    const sum = (over: Partial<SessionSummary>): SessionSummary => ({
        startTime: 0,
        durationS: 3600,
        games: 5,
        wins: 4,
        losses: 1,
        unscored: 0,
        netDelta: null,
        ...over,
    });

    it("needs a big rank gain and a high winrate when ranked", () => {
        expect(sessionVerdict(sum({ netDelta: 1000 }))).toBe("excellent");
        expect(sessionVerdict(sum({ netDelta: 600 }))).toBe("good");
        expect(sessionVerdict(sum({ games: 2, wins: 2, losses: 0, netDelta: 900 }))).toBe("good");
    });

    it("needs a very high winrate over enough games when unranked", () => {
        expect(sessionVerdict(sum({ games: 5, wins: 4, losses: 1 }))).toBe("excellent");
        expect(sessionVerdict(sum({ games: 3, wins: 3, losses: 0 }))).toBe("good");
    });
});

describe("sessionHighlight", () => {
    const DAY = 86_400;
    const sessionAt = (startMin: number, outcomes: Outcome[], delta = 0) =>
        groupSessions(
            outcomes.map((o, i) =>
                m(startMin + i * 35, o, { rankDelta: o === "win" ? delta : o === "loss" ? -delta : null }),
            ),
            60 * MIN,
        )[0];
    const now = (sessions: ReturnType<typeof groupSessions>) =>
        Math.max(...sessions.flatMap((x) => x.matches.map((y) => y.startTime + y.durationS))) + 60;

    it("congratulates when the latest session was good", () => {
        const ss = [sessionAt(0, ["loss", "loss", "loss"], 300), sessionAt(2000, ["win", "win", "win", "loss"], 300)];
        const h = sessionHighlight(ss, now(ss));
        expect(h?.kind).toBe("latest");
        expect(h?.session).toBe(ss[1]);
    });

    it("falls back to the best recent good session when the latest was not good", () => {
        const ss = [
            sessionAt(0, ["win", "win", "win", "win", "loss"], 300),
            sessionAt(2000, ["loss", "loss", "win"], 300),
        ];
        const h = sessionHighlight(ss, now(ss));
        expect(h?.kind).toBe("best");
        expect(h?.session).toBe(ss[0]);
    });

    it("prefers an excellent session over a good one when picking the best", () => {
        const good = sessionAt(0, ["win", "win", "win", "loss", "loss"], 300);
        const great = sessionAt(3000, ["win", "win", "win", "win", "win"], 300);
        const bad = sessionAt(6000, ["loss", "loss", "loss"], 300);
        const ss = [good, great, bad];
        expect(sessionHighlight(ss, now(ss))?.session).toBe(great);
    });

    it("does not call an old latest session recent: it becomes the best one instead", () => {
        const ss = [sessionAt(0, ["win", "win", "win", "win"], 300)];
        const h = sessionHighlight(ss, now(ss) + 5 * DAY);
        expect(h?.kind).toBe("best");
    });

    it("returns nothing when no session was good", () => {
        const ss = [sessionAt(0, ["loss", "loss", "win"], 300)];
        expect(sessionHighlight(ss, now(ss))).toBeNull();
        expect(sessionHighlight([], 0)).toBeNull();
    });
});
