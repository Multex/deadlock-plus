import { describe, expect, it } from "vitest";
import {
    BASE_BARS,
    burstAt,
    BURST_LIFE_MS,
    climbTiming,
    collectorsPlan,
    countUp,
    drawnMatches,
    outBack,
    punch,
    slideIn,
    segmentAt,
    stamp,
    type SegmentId,
} from "./plan";

const ids = (plan: { id: SegmentId }[]) => plan.map((s) => s.id);
const ALL = { chart: true, heroes: true };

describe("Collector's Copy video plan", () => {
    it("tells the story in order and fills the 17 bars of the postgame track exactly", () => {
        const plan = collectorsPlan(17, ALL);
        expect(ids(plan)).toEqual([
            "sealed",
            "tear",
            "cover",
            "peak",
            "climb",
            "record",
            "heroes",
            "certificate",
            "end",
        ]);
        expect(plan.reduce((n, s) => n + s.bars, 0)).toBe(17);
        expect(BASE_BARS).toBe(17);
    });

    it("starts every segment on a whole bar, right after the one before", () => {
        for (const bars of [14, 17, 18, 20]) {
            const plan = collectorsPlan(bars, ALL);
            let at = 0;
            for (const s of plan) {
                expect(Number.isInteger(s.start)).toBe(true);
                expect(s.start).toBe(at);
                expect(s.bars).toBeGreaterThanOrEqual(1);
                at += s.bars;
            }
            expect(at).toBe(bars);
        }
    });

    it("gives a longer track's extra bars to the climb first, then the end card, then the heroes", () => {
        const base = Object.fromEntries(collectorsPlan(17, ALL).map((s) => [s.id, s.bars]));
        const long = Object.fromEntries(collectorsPlan(20, ALL).map((s) => [s.id, s.bars]));
        expect(long.climb).toBe(base.climb + 1);
        expect(long.end).toBe(base.end + 1);
        expect(long.heroes).toBe(base.heroes + 1);
        expect(long.sealed).toBe(base.sealed);
    });

    it("drops the climb without a chart and the heroes without any, giving their bars away", () => {
        const plan = collectorsPlan(17, { chart: false, heroes: false });
        expect(ids(plan)).not.toContain("climb");
        expect(ids(plan)).not.toContain("heroes");
        expect(plan.reduce((n, s) => n + s.bars, 0)).toBe(17);
    });

    it("shrinks the quiet segments first when a track is short", () => {
        const plan = Object.fromEntries(collectorsPlan(14, ALL).map((s) => [s.id, s.bars]));
        expect(plan.sealed).toBe(1);
        expect(plan.climb).toBeGreaterThanOrEqual(3);
    });

    it("finds the segment and the time into it for a bar position", () => {
        const plan = collectorsPlan(17, ALL);
        expect(segmentAt(plan, 0)).toMatchObject({ segment: { id: "sealed" }, local: 0 });
        expect(segmentAt(plan, 2.5)).toMatchObject({ segment: { id: "tear" }, local: 0.5 });
        expect(segmentAt(plan, 16.99).segment.id).toBe("end");
        expect(segmentAt(plan, 99).segment.id).toBe("end");
        expect(segmentAt(plan, -1).segment.id).toBe("sealed");
    });
});

describe("Collector's Copy climb timing", () => {
    it("lands the star on a bar line inside the draw", () => {
        for (const [index, total] of [
            [104, 114],
            [0, 114],
            [113, 114],
            [5, 6],
            [40, 80],
        ]) {
            const c = climbTiming(4, index, total);
            expect(Number.isInteger(c.peak)).toBe(true);
            expect(c.peak).toBeGreaterThan(c.from);
            expect(c.peak).toBeLessThanOrEqual(c.to);
        }
    });

    it("places the bar line where the peak falls in the season, as near as whole bars allow", () => {
        expect(climbTiming(4, 104, 114).peak).toBe(3);
        expect(climbTiming(4, 20, 114).peak).toBe(1);
        expect(climbTiming(5, 50, 114).peak).toBe(2);
    });

    it("has drawn exactly the matches up to the peak on that bar line, and all of them at the end", () => {
        const c = climbTiming(4, 104, 114);
        const at = (bar: number) => drawnMatches(bar, c, 104, 114);
        expect(at(c.from - 0.1)).toBe(0);
        expect(at(c.from)).toBe(0);
        expect(at(c.peak)).toBe(105);
        expect(at(c.to)).toBe(114);
        expect(at(c.to + 1)).toBe(114);
        expect(at((c.from + c.peak) / 2)).toBeGreaterThan(0);
        expect(at((c.from + c.peak) / 2)).toBeLessThan(105);
    });

    it("never draws backwards", () => {
        const c = climbTiming(4, 30, 114);
        let last = -1;
        for (let bar = 0; bar <= 4; bar += 0.01) {
            const n = drawnMatches(bar, c, 30, 114);
            expect(n).toBeGreaterThanOrEqual(last);
            last = n;
        }
    });
});

describe("Collector's Copy count-ups and stamps", () => {
    it("counts from zero to the value, whole numbers, landing on it exactly", () => {
        expect(countUp(66, 0)).toBe(0);
        expect(countUp(66, 1)).toBe(66);
        expect(countUp(66, 2)).toBe(66);
        expect(countUp(66, -1)).toBe(0);
        const mid = countUp(66, 0.5);
        expect(Number.isInteger(mid)).toBe(true);
        expect(mid).toBeGreaterThan(33);
        expect(mid).toBeLessThan(66);
    });

    it("overshoots on the way in and rests at one", () => {
        expect(outBack(0)).toBe(0);
        expect(outBack(1)).toBeCloseTo(1, 10);
        expect(Math.max(...Array.from({ length: 99 }, (_, i) => outBack((i + 1) / 100)))).toBeGreaterThan(1);
    });

    it("stamps down from big to its own size, landing on the hit", () => {
        expect(stamp(-0.5)).toEqual({ scale: 0, alpha: 0 });
        const hit = stamp(0);
        expect(hit.alpha).toBe(1);
        expect(hit.scale).toBe(1);
        expect(stamp(-0.1).scale).toBeGreaterThan(1.5);
        expect(stamp(-0.1).alpha).toBeGreaterThan(0);
        expect(stamp(2).scale).toBe(1);
    });

    it("punches in big on the hit itself and settles to its own size within the beat", () => {
        expect(punch(-0.01)).toEqual({ scale: 0, alpha: 0 });
        expect(punch(0).alpha).toBe(1);
        expect(punch(0).scale).toBeGreaterThan(1.2);
        expect(punch(0.2).scale).toBeLessThan(punch(0).scale);
        expect(punch(1)).toEqual({ scale: 1, alpha: 1 });
    });

    it("lands a slide on its beat: off to the side before, home on the beat", () => {
        expect(slideIn(-1)).toBe(1);
        expect(slideIn(-0.5)).toBe(1);
        expect(slideIn(-0.25)).toBeGreaterThan(0);
        expect(slideIn(-0.25)).toBeLessThan(1);
        expect(slideIn(0)).toBe(0);
        expect(slideIn(3)).toBe(0);
    });
});

describe("Collector's Copy tear burst", () => {
    it("throws the same flecks every time", () => {
        expect(burstAt(400)).toEqual(burstAt(400));
    });

    it("throws each fleck as the rip passes it, and none before the rip starts", () => {
        expect(burstAt(-1).filter((f) => f.alpha > 0)).toHaveLength(0);
        const early = burstAt(60).filter((f) => f.alpha > 0);
        expect(early.length).toBeGreaterThan(0);
        expect(Math.max(...early.map((f) => f.x0))).toBeLessThan(260);
        expect(burstAt(700).filter((f) => f.alpha > 0).length).toBeGreaterThan(early.length);
    });

    it("flies up off the tear line and is gone once its life is over", () => {
        const mid = burstAt(300).filter((f) => f.alpha > 0);
        expect(mid.length).toBeGreaterThan(0);
        expect(mid.every((f) => f.y < 72)).toBe(true);
        expect(burstAt(700 + BURST_LIFE_MS).filter((f) => f.alpha > 0)).toHaveLength(0);
    });
});
