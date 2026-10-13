import { describe, expect, it } from "vitest";
import { buildFindings, judge } from "./insights";
import { bucket, groupSessions } from "@deadlock-plus/stats/sessions";
import type { Match, Outcome } from "@deadlock-plus/stats/stats";

const MIN = 60;
const DAY = 86_400;
let id = 0;

const m = (startS: number, outcome: Outcome, hero = 1, over: Partial<Match> = {}): Match => ({
    matchId: ++id,
    heroId: hero,
    startTime: startS,
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

// One session per row, each far apart. A game is an outcome or [outcome, hero]; games follow each
// other 35 minutes apart unless `gapMin` says otherwise.
type Game = Outcome | [Outcome, number];
function sessionsOf(rows: Game[][], { gapMin = 5, firstAt = 0 }: { gapMin?: number; firstAt?: number } = {}) {
    const matches: Match[] = [];
    rows.forEach((row, r) => {
        let t = firstAt + r * 5 * DAY;
        for (const g of row) {
            const [outcome, hero] = Array.isArray(g) ? g : [g, 1];
            matches.push(m(t, outcome, hero));
            t += (30 + gapMin) * MIN;
        }
    });
    return groupSessions(matches);
}

const times = <T>(n: number, v: T): T[] => Array.from({ length: n }, () => v);
const find = (sessions: ReturnType<typeof groupSessions>, key: string, tz = 0) =>
    buildFindings(sessions, tz).findings.find((f) => f.id === key)!;

describe("judge", () => {
    it("is unknown below the sample floor", () => {
        expect(judge(bucket(9, 9), 0.5)).toBe("unknown");
    });

    it("calls a big gap better or worse and a small one the same", () => {
        expect(judge(bucket(30, 24), 0.5)).toBe("better");
        expect(judge(bucket(30, 6), 0.5)).toBe("worse");
        expect(judge(bucket(30, 16), 0.5)).toBe("same");
    });

    it("needs a bigger gap for a smaller sample", () => {
        expect(judge(bucket(10, 7), 0.5)).toBe("same");
        expect(judge(bucket(100, 57), 0.5)).toBe("same");
        expect(judge(bucket(100, 62), 0.5)).toBe("better");
    });

    it("is unknown without a baseline", () => {
        expect(judge(bucket(30, 20), null)).toBe("unknown");
    });
});

describe("after losses", () => {
    it("flags a drop after two losses in a row", () => {
        const s = sessionsOf([
            ...times(12, ["loss", "loss", "loss"] as Game[]),
            ...times(12, ["win", "win", "win"] as Game[]),
        ]);
        const f = find(s, "after-losses");
        expect(f.tone).toBe("worse");
        expect(f.headline).toMatch(/two losses/);
    });

    it("says so when there is no difference", () => {
        const s = sessionsOf(times(30, ["win", "loss", "loss", "win", "loss"] as Game[]));
        expect(find(s, "after-losses").tone).not.toBe("worse");
    });

    it("is unknown with too few games", () => {
        const s = sessionsOf([["loss", "loss", "loss"]]);
        expect(find(s, "after-losses").tone).toBe("unknown");
    });
});

describe("where to stop", () => {
    it("names the game after which results drop", () => {
        const s = sessionsOf(times(12, ["win", "win", "win", "loss", "loss", "loss"] as Game[]));
        const f = find(s, "session-length");
        expect(f.tone).toBe("worse");
        expect(f.headline).toMatch(/after game 3/);
    });

    it("finds no drop when results stay level", () => {
        const s = sessionsOf([
            ...times(6, ["win", "loss", "win", "loss", "win", "loss"] as Game[]),
            ...times(6, ["loss", "win", "loss", "win", "loss", "win"] as Game[]),
        ]);
        expect(find(s, "session-length").tone).toBe("same");
    });

    it("carries the average rank points per game number", () => {
        const matches = times(12, 0).flatMap((_, r) =>
            [0, 1].map((i) => m(r * 5 * DAY + i * 35 * MIN, "win", 1, { rankDelta: i === 0 ? 300 : 370 })),
        );
        const f = find(groupSessions(matches), "session-length");
        expect(f.bars[0].note).toBe("+300 pts");
        expect(f.bars[1].note).toBe("+370 pts");
    });
});

describe("switch or stay", () => {
    it("prefers switching when it wins more", () => {
        const s = sessionsOf([
            ...times(12, [
                ["loss", 1],
                ["win", 2],
            ] as Game[]),
            ...times(12, [
                ["loss", 1],
                ["loss", 1],
            ] as Game[]),
        ]);
        const f = find(s, "swap-hero");
        expect(f.tone).toBe("better");
        expect(f.headline).toMatch(/switching/i);
    });

    it("prefers staying when switching does worse", () => {
        const s = sessionsOf([
            ...times(12, [
                ["loss", 1],
                ["loss", 2],
            ] as Game[]),
            ...times(12, [
                ["loss", 1],
                ["win", 1],
            ] as Game[]),
        ]);
        const f = find(s, "swap-hero");
        expect(f.tone).toBe("worse");
        expect(f.headline).toMatch(/same hero/i);
    });
});

describe("requeue speed", () => {
    it("compares queueing within ten minutes with waiting longer", () => {
        const quick = sessionsOf(times(12, ["loss", "win"] as Game[]), { gapMin: 5 });
        const slow = sessionsOf(times(12, ["loss", "loss"] as Game[]), { gapMin: 30, firstAt: 100 * DAY });
        const merged = groupSessions([...quick, ...slow].flatMap((x) => x.matches));
        const f = find(merged, "requeue");
        expect(f.tone).toBe("better");
        expect(f.headline).toMatch(/straight back/i);
    });
});

describe("time of day", () => {
    const at = (hourUtc: number, outcome: Outcome, day: number) => m(day * DAY + hourUtc * 3600, outcome);

    it("names the best and worst part of the day", () => {
        const matches = [
            ...times(12, 0).map((_, d) => at(20, "win", d)),
            ...times(12, 0).map((_, d) => at(3, "loss", d)),
        ];
        const f = find(groupSessions(matches), "time-of-day");
        expect(f.headline).toMatch(/evening/i);
        expect(f.headline).toMatch(/late night/i);
    });

    it("uses the local time zone", () => {
        const matches = [
            ...times(12, 0).map((_, d) => at(20, "win", d)),
            ...times(12, 0).map((_, d) => at(3, "loss", d)),
        ];
        // +5h turns 20:00 into 01:00 (late night) and 03:00 into 08:00 (morning).
        const f = find(groupSessions(matches), "time-of-day", 300);
        expect(f.bars.find((b) => b.label === "Late night")?.winrate).toBe(1);
        expect(f.bars.find((b) => b.label === "Morning")?.winrate).toBe(0);
    });
});

describe("weekdays and weekends", () => {
    // 1970-01-01 is a Thursday: day 2 is Saturday, day 4 is Monday.
    it("compares weekends with weekdays", () => {
        const matches = [
            ...times(12, 0).map((_, w) => m((w * 7 + 2) * DAY + 3600, "win")),
            ...times(12, 0).map((_, w) => m((w * 7 + 4) * DAY + 3600, "loss")),
        ];
        const f = find(groupSessions(matches), "day-type");
        expect(f.tone).toBe("better");
        expect(f.headline).toMatch(/weekend/i);
    });
});

describe("baseline", () => {
    it("is the winrate over every scored game", () => {
        const s = sessionsOf([["win", "win", "loss", "unscored"]]);
        const { baseline } = buildFindings(s, 0);
        expect(baseline).toMatchObject({ games: 3, wins: 2 });
    });
});
