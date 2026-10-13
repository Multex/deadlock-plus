import { describe, expect, it } from "vitest";
import { breakEvenWinrate, climbForecast, expectedPointsPerGame } from "./climb";
import type { RankPoint } from "./rank";

const DAY = 86_400;
const NOW = 100 * DAY;

const point = (daysAgo: number, delta: number, id = Math.random()): RankPoint => ({
    matchId: id,
    heroId: 1,
    startTime: NOW - daysAgo * DAY,
    badge: 102,
    delta,
    outcome: delta >= 0 ? "win" : "loss",
    demotionProtected: false,
});

describe("expectedPointsPerGame", () => {
    it("is the flat loss at 0% and the top streak gain at 100%", () => {
        expect(expectedPointsPerGame(0)).toBeCloseTo(-300, 6);
        expect(expectedPointsPerGame(1)).toBeCloseTo(430, 6);
    });

    it("grows with winrate", () => {
        expect(expectedPointsPerGame(0.6)).toBeGreaterThan(expectedPointsPerGame(0.5));
    });

    it("is positive at 50% because streaks pay more than losses cost", () => {
        expect(expectedPointsPerGame(0.5)).toBeGreaterThan(0);
    });
});

describe("breakEvenWinrate", () => {
    it("sits below 50% and gains nothing there", () => {
        const w = breakEvenWinrate();
        expect(w).toBeGreaterThan(0.4);
        expect(w).toBeLessThan(0.5);
        expect(expectedPointsPerGame(w)).toBeCloseTo(0, 3);
    });
});

describe("climbForecast", () => {
    const steady = (perDay: number) => Array.from({ length: 30 }, (_, i) => point(i + 0.5, perDay, i + 1));

    it("is null without enough recent games", () => {
        expect(climbForecast([point(1, 300)], 64200, NOW)).toBeNull();
    });

    it("estimates days to the next subrank from the recent pace", () => {
        // 30 games over 30 days at +100 each: +100 a day. 64200 is 200 into a 1000-point subrank.
        const f = climbForecast(steady(100), 64200, NOW)!;
        expect(f.perDay).toBeCloseTo(100, 6);
        expect(f.subrank.points).toBe(800);
        expect(f.subrank.daysLow).toBe(8);
        expect(f.subrank.daysHigh).toBe(8);
    });

    it("measures the sixth subrank against its 2000 span and offers no separate tier target", () => {
        const f = climbForecast(steady(100), 61200, NOW)!;
        expect(f.subrank.points).toBe(1800);
        expect(f.tier).toBeNull();
    });

    it("targets the next tier when it is further away than the next subrank", () => {
        // Tier 10 starts at 63000, so the next tier starts at 70000.
        const f = climbForecast(steady(100), 64200, NOW)!;
        expect(f.tier?.points).toBe(5800);
    });

    it("gives a range when the two windows disagree", () => {
        // Last 14 days +200/day (28 games of +100... built below), older days slower.
        const recent = Array.from({ length: 16 }, (_, i) => point(i * 0.8 + 0.1, 175, 1000 + i));
        const older = Array.from({ length: 16 }, (_, i) => point(14 + i, 25, 2000 + i));
        const f = climbForecast([...older, ...recent], 64000, NOW)!;
        expect(f.subrank.daysLow).toBeLessThan(f.subrank.daysHigh!);
    });

    it("reports no climb when the pace is not positive", () => {
        const f = climbForecast(steady(-50), 64200, NOW)!;
        expect(f.subrank.daysLow).toBeNull();
        expect(f.tier?.daysLow ?? null).toBeNull();
    });

    it("leaves the high end open when one window is not climbing", () => {
        const recent = Array.from({ length: 16 }, (_, i) => point(i * 0.8 + 0.1, 200, 1000 + i));
        const older = Array.from({ length: 16 }, (_, i) => point(14 + i, -300, 2000 + i));
        const f = climbForecast([...older, ...recent], 64000, NOW)!;
        expect(f.subrank.daysLow).not.toBeNull();
        expect(f.subrank.daysHigh).toBeNull();
    });
});
