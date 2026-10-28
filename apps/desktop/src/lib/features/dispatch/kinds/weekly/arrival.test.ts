import { describe, expect, it } from "vitest";
import { TOSS_KINDS, tossMotion } from "$lib/features/front-page/toss";
import { arrivalPhase, STAMP_ANGLE, STAMP_GAP, weeklyArrival, weeklyLanding } from "./arrival";

const SHEET = 1000;

describe("weeklyLanding", () => {
    it("lands the same way every time for one edition", () => {
        expect(weeklyLanding("weekly-2026-10-05")).toEqual(weeklyLanding("weekly-2026-10-05"));
    });

    it("reaches every toss across editions", () => {
        const seen = new Set<string>();
        for (let d = 1; d <= 60; d++) seen.add(weeklyLanding(`weekly-2026-${String(d).padStart(3, "0")}`).kind);
        expect([...seen].sort()).toEqual([...TOSS_KINDS].sort());
    });

    it("comes to rest flat in place, so the fitted sheet does not move", () => {
        const l = weeklyLanding("weekly-2026-10-12");
        expect([l.angle, l.dx, l.dy]).toEqual([0, 0, 0]);
    });
});

describe("weeklyArrival", () => {
    it("plays nothing under reduced motion", () => {
        expect(weeklyArrival("weekly-2026-10-05", { hot: true, sheetHeight: SHEET, reduced: true })).toBeNull();
    });

    it("plays only the toss on an ordinary week", () => {
        const a = weeklyArrival("weekly-2026-10-05", { hot: false, sheetHeight: SHEET, reduced: false })!;
        expect(a.toss).toEqual(tossMotion(a.landing, SHEET));
        expect(a.stamp).toBeNull();
        expect(a.total).toBe(a.toss.duration);
    });

    it("stamps a hot week once the paper has settled", () => {
        const a = weeklyArrival("weekly-2026-10-05", { hot: true, sheetHeight: SHEET, reduced: false })!;
        expect(a.stamp!.delay).toBe(a.toss.duration + STAMP_GAP);
        expect(a.total).toBe(a.stamp!.delay + a.stamp!.duration);
        expect(a.stamp!.keyframes.at(-1)).toMatchObject({
            opacity: 1,
            transform: `rotate(${STAMP_ANGLE}deg) scale(1)`,
        });
        expect(a.stamp!.keyframes[0].opacity).toBe(0);
    });

    it("thuds the table when the stamp hits, and when a hard toss does", () => {
        for (let d = 1; d <= 30; d++) {
            const id = `weekly-2026-${d}`;
            const a = weeklyArrival(id, { hot: true, sheetHeight: SHEET, reduced: false })!;
            const tossHit = a.toss.impactAt === undefined ? [] : [a.toss.impactAt];
            expect(a.jolts).toEqual([...tossHit, a.stamp!.impactAt]);
            expect(a.stamp!.impactAt).toBeGreaterThan(a.stamp!.delay);
            expect(a.stamp!.impactAt).toBeLessThan(a.total);
        }
    });

    it("lets the contact shadow go once the paper lies flat, so the rest matches an unrevealed paper", () => {
        const a = weeklyArrival("weekly-2026-10-05", { hot: false, sheetHeight: SHEET, reduced: false })!;
        expect(a.shadow.at(-1)!.opacity).toBe(0);
        expect(a.shadow.slice(0, -1)).toEqual(a.toss.shadow.slice(0, -1));
    });
});

describe("arrivalPhase", () => {
    const hot = weeklyArrival("weekly-2026-10-05", { hot: true, sheetHeight: SHEET, reduced: false })!;
    const plain = weeklyArrival("weekly-2026-10-05", { hot: false, sheetHeight: SHEET, reduced: false })!;

    it("tosses, then stamps, then rests", () => {
        expect(arrivalPhase(hot, 0)).toBe("toss");
        expect(arrivalPhase(hot, hot.toss.duration - 1)).toBe("toss");
        expect(arrivalPhase(hot, hot.toss.duration)).toBe("stamp");
        expect(arrivalPhase(hot, hot.total - 1)).toBe("stamp");
        expect(arrivalPhase(hot, hot.total)).toBe("rest");
    });

    it("goes straight to rest after the toss on an ordinary week", () => {
        expect(arrivalPhase(plain, plain.toss.duration - 1)).toBe("toss");
        expect(arrivalPhase(plain, plain.toss.duration)).toBe("rest");
    });
});
