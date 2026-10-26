import { describe, expect, it } from "vitest";

import { MUSIC_TRACKS } from "../../music";
import { videoTimeline } from "../../timeline";
import {
    countUp,
    digitLocks,
    flashAt,
    growth,
    introBars,
    rollingDigit,
    sceneFrame,
    sectionAt,
    yearEndPlan,
    type SectionId,
} from "./plan";

const ALL: SectionId[] = ["numbers", "heroes", "months", "highlights", "people"];

describe("yearEndPlan", () => {
    it("drops on the menu track's own drop: bar 11 of 20, 15.3 s in", () => {
        const menu = videoTimeline(MUSIC_TRACKS.find((t) => t.id === "menu")!);
        const plan = yearEndPlan(menu.bars, ALL);
        expect(plan.drop).toBe(11);
        expect(plan.drop * menu.barSeconds).toBeCloseTo(15.35, 2);
    });

    it("builds through the menu track's 11 quiet bars: masthead, year, title, name, riser", () => {
        const plan = yearEndPlan(20, ALL);
        expect(plan.intro).toEqual({
            mast: { bar: 0, bars: 2 },
            digits: { bar: 2, bars: 4 },
            title: { bar: 6, bars: 2 },
            name: { bar: 8, bars: 2 },
            riser: { bar: 10, bars: 1 },
        });
    });

    it("gives every section its bars after the drop and the last bar to the end card", () => {
        const plan = yearEndPlan(20, ALL);
        expect(plan.sections).toEqual([
            { id: "numbers", bar: 12, bars: 2 },
            { id: "heroes", bar: 14, bars: 2 },
            { id: "months", bar: 16, bars: 1 },
            { id: "highlights", bar: 17, bars: 1 },
            { id: "people", bar: 18, bars: 1 },
        ]);
        expect(plan.end).toEqual({ bar: 19, bars: 1 });
    });

    it("hands a missing section's bars to the others, one extra each, then to the end card", () => {
        const plan = yearEndPlan(20, ["numbers", "heroes"]);
        expect(plan.sections).toEqual([
            { id: "numbers", bar: 12, bars: 3 },
            { id: "heroes", bar: 15, bars: 3 },
        ]);
        expect(plan.end).toEqual({ bar: 18, bars: 2 });
    });

    it("fills every track exactly, with no gap or overlap from bar 0 to the last", () => {
        for (const track of MUSIC_TRACKS) {
            const { bars } = videoTimeline(track);
            for (const present of [ALL, ["numbers", "heroes"] as SectionId[]]) {
                const plan = yearEndPlan(bars, present);
                const spans = [
                    ...Object.values(plan.intro),
                    { bar: plan.drop, bars: 1 },
                    ...plan.sections,
                    plan.end,
                ].filter((s) => s.bars > 0);
                let next = 0;
                for (const span of spans) {
                    expect(span.bar).toBe(next);
                    next += span.bars;
                }
                expect(next).toBe(bars);
            }
        }
    });
});

describe("introBars", () => {
    it("shortens the intro for tracks without a build, keeping at least a bar for the name", () => {
        expect(introBars(8)).toEqual({ mast: 1, digits: 2, title: 2, name: 2, riser: 1 });
        expect(introBars(4)).toEqual({ mast: 2, digits: 1, title: 0, name: 1, riser: 0 });
        for (let n = 4; n <= 14; n++) {
            const b = introBars(n);
            expect(b.mast + b.digits + b.title + b.name + b.riser).toBe(n);
            expect(b.name).toBeGreaterThanOrEqual(1);
        }
    });
});

describe("sectionAt", () => {
    it("names the section a moment falls in, with its local bar", () => {
        const plan = yearEndPlan(20, ALL);
        const bar = 1.5;
        expect(sectionAt(plan, 14.5 * bar, bar)).toEqual({ id: "heroes", local: 0.5 });
        expect(sectionAt(plan, 16 * bar, bar)).toEqual({ id: "months", local: 0 });
        expect(sectionAt(plan, 11.5 * bar, bar)).toBeNull();
    });
});

describe("digitLocks", () => {
    it("locks one digit per bar over the four-bar year", () => {
        const plan = yearEndPlan(20, ALL);
        expect(digitLocks(plan, 4, 2)).toEqual([4, 6, 8, 10]);
    });

    it("locks two a bar when the year has two bars", () => {
        const plan = yearEndPlan(17, ALL);
        expect(plan.intro.digits.bars).toBe(2);
        expect(digitLocks(plan, 4, 1)).toEqual([1, 1.5, 2, 2.5]);
    });
});

describe("countUp", () => {
    it("starts at zero, lands exactly on the value at the end and never runs back", () => {
        expect(countUp(456, 1, 1, 2)).toBe(0);
        expect(countUp(456, 2, 1, 2)).toBe(456);
        expect(countUp(456, 9, 1, 2)).toBe(456);
        let last = -1;
        for (let t = 0; t <= 2.5; t += 0.01) {
            const v = countUp(456, t, 1, 2);
            expect(Number.isInteger(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(last);
            last = v;
        }
    });

    it("counts a share in whole percent steps", () => {
        expect(countUp(0.58, 1.5, 1, 2, 100)).toBeGreaterThan(0.3);
        expect((countUp(0.58, 1.5, 1, 2, 100) * 100) % 1).toBeCloseTo(0, 6);
        expect(countUp(0.58, 2, 1, 2, 100)).toBe(0.58);
    });
});

describe("rollingDigit", () => {
    it("rolls through the digits in order and wraps from 9 to 0", () => {
        const a = rollingDigit(0, 0.25, 4);
        expect(a).toEqual({ digit: 1, next: 2, frac: 0 });
        expect(rollingDigit(0, 2.25, 4)).toEqual({ digit: 9, next: 0, frac: 0 });
        expect(rollingDigit(3, 0, 4).digit).toBe(3);
    });
});

describe("growth", () => {
    it("rises a step per beat from zero and settles at full height", () => {
        expect(growth(0.9, 1, 0.5)).toBe(0);
        expect(growth(1 + 0.5 * 0.99, 1, 0.5)).toBeCloseTo(1 / 3, 1);
        expect(growth(1 + 0.5 * 1.99, 1, 0.5)).toBeCloseTo(2 / 3, 1);
        expect(growth(3, 1, 0.5)).toBe(1);
    });
});

describe("flashAt", () => {
    it("whites out on the hit and is gone within half a second", () => {
        expect(flashAt(4.9, 5)).toBe(0);
        expect(flashAt(5, 5)).toBe(1);
        expect(flashAt(5.2, 5)).toBeLessThan(0.35);
        expect(flashAt(5.6, 5)).toBe(0);
    });
});

describe("sceneFrame", () => {
    it("keeps the 9:16 content square in the band clear of the app UI", () => {
        const f = sceneFrame(1080, 1920);
        expect(f.u).toBe(1);
        expect(f.box.x).toBe(0);
        expect(f.box.w).toBe(1080);
        expect(f.box.y).toBeGreaterThanOrEqual(240);
        expect(f.box.y + f.box.h).toBeLessThanOrEqual(1360);
    });

    it("gives 9:16 the band key text may use, and the whole height elsewhere", () => {
        expect(sceneFrame(1080, 1920).safe).toEqual({ top: 240, bottom: 1360 });
        expect(sceneFrame(1440, 1440).safe).toEqual({ top: 0, bottom: 1440 });
        expect(sceneFrame(1920, 1080).safe).toEqual({ top: 0, bottom: 1080 });
    });

    it("fills the square and centres the 16:9 box", () => {
        expect(sceneFrame(1440, 1440).box).toEqual({ x: 0, y: 0, w: 1440, h: 1440 });
        expect(sceneFrame(1920, 1080).box).toEqual({ x: 420, y: 0, w: 1080, h: 1080 });
    });
});
