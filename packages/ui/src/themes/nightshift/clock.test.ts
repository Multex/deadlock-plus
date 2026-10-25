import { describe, expect, it } from "vitest";

import { TURN_STEP_MS, hands, onShift, turnAt } from "./clock";

describe("onShift", () => {
    it("is on during the Wednesday show in winter, 21:00 CET", () => {
        expect(onShift(new Date("2026-01-14T20:30:00Z"))).toBe(true);
    });

    it("is off the minute before the show starts", () => {
        expect(onShift(new Date("2026-01-14T19:59:00Z"))).toBe(false);
    });

    it("follows Paris into summer time, 21:00 CEST", () => {
        expect(onShift(new Date("2026-07-15T19:30:00Z"))).toBe(true);
        expect(onShift(new Date("2026-07-15T18:59:00Z"))).toBe(false);
    });

    it("is off on other days", () => {
        expect(onShift(new Date("2026-01-13T20:30:00Z"))).toBe(false);
        expect(onShift(new Date("2026-01-15T20:30:00Z"))).toBe(false);
    });

    it("runs three hours, to midnight in Paris", () => {
        expect(onShift(new Date("2026-01-14T22:59:00Z"))).toBe(true);
        expect(onShift(new Date("2026-01-14T23:00:00Z"))).toBe(false);
    });
});

describe("hands", () => {
    const at = (hour: number, minute: number) => new Date(2026, 9, 25, hour, minute);

    it("points both hands up at noon and midnight", () => {
        expect(hands(at(12, 0))).toEqual({ hour: 0, minute: 0 });
        expect(hands(at(0, 0))).toEqual({ hour: 0, minute: 0 });
    });

    it("reads the viewer's local time, the hour hand creeping with the minutes", () => {
        expect(hands(at(15, 0))).toEqual({ hour: 90, minute: 0 });
        expect(hands(at(21, 30))).toEqual({ hour: 285, minute: 180 });
    });
});

describe("turnAt", () => {
    it("turns by the wall clock, so a rebuilt panel carries on where it was", () => {
        expect(turnAt(1_000_000)).toBe(turnAt(1_000_000));
        expect(turnAt(1_000_000 + 60_000)).not.toBe(turnAt(1_000_000));
    });

    it("moves only in whole steps, so the ticker can sleep between them", () => {
        const start = 1_000 * TURN_STEP_MS;
        expect(turnAt(start + TURN_STEP_MS - 1)).toBe(turnAt(start));
        expect(turnAt(start + TURN_STEP_MS)).toBeGreaterThan(turnAt(start));
    });

    it("turns slowly: under a degree a step", () => {
        const start = 2_000 * TURN_STEP_MS;
        expect(turnAt(start + TURN_STEP_MS) - turnAt(start)).toBeLessThan(1);
    });

    it("stays within one turn", () => {
        for (let t = 0; t < 1e9; t += 7_777_777) {
            expect(turnAt(t)).toBeGreaterThanOrEqual(0);
            expect(turnAt(t)).toBeLessThan(360);
        }
    });
});
