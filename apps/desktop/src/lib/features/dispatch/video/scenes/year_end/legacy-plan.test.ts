import { describe, expect, it } from "vitest";

import { MUSIC_TRACKS } from "../../music";
import { videoTimeline } from "../../timeline";
import {
    COUNT_BEATS,
    digitLocks,
    entrances,
    introBars,
    rollingDigit,
    sectionAt,
    yearEndPlan,
    type SectionId,
} from "./legacy-plan";

const ALL: SectionId[] = ["numbers", "heroes", "highlights", "people"];

describe("yearEndPlan", () => {
    it("drops on the menu track's own drop: bar 11 of 29, 15.3 s in", () => {
        const menu = videoTimeline(MUSIC_TRACKS.find((t) => t.id === "menu")!);
        expect(menu.bars).toBe(29);
        const plan = yearEndPlan(menu.bars, ALL);
        expect(plan.drop).toBe(11);
        expect(plan.drop * menu.barSeconds).toBeCloseTo(15.35, 2);
    });

    it("builds through the menu track's 11 quiet bars: masthead, year, title, name, riser", () => {
        const plan = yearEndPlan(29, ALL);
        expect(plan.intro).toEqual({
            mast: { bar: 0, bars: 2 },
            digits: { bar: 2, bars: 4 },
            title: { bar: 6, bars: 2 },
            name: { bar: 8, bars: 2 },
            riser: { bar: 10, bars: 1 },
        });
    });

    it("gives every section three or four bars after the drop and the last two to the end card", () => {
        const plan = yearEndPlan(29, ALL);
        expect(plan.sections).toEqual([
            { id: "numbers", bar: 12, bars: 4 },
            { id: "heroes", bar: 16, bars: 4 },
            { id: "highlights", bar: 20, bars: 4 },
            { id: "people", bar: 24, bars: 3 },
        ]);
        expect(plan.end).toEqual({ bar: 27, bars: 2 });
    });

    it("holds every section for at least 4 s on every track", () => {
        for (const track of MUSIC_TRACKS) {
            const { bars, barSeconds } = videoTimeline(track);
            for (const s of yearEndPlan(bars, ALL).sections) {
                expect(s.bars * barSeconds, `${track.id} ${s.id}`).toBeGreaterThanOrEqual(4);
            }
        }
    });

    it("hands a missing section's bars to the others, up to six bars each, then to the end card", () => {
        const plan = yearEndPlan(29, ["numbers", "heroes"]);
        expect(plan.sections).toEqual([
            { id: "numbers", bar: 12, bars: 6 },
            { id: "heroes", bar: 18, bars: 6 },
        ]);
        expect(plan.end).toEqual({ bar: 24, bars: 5 });
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

describe("entrances", () => {
    it("lands the first on the section's downbeat and the rest evenly, at most two beats apart", () => {
        expect(entrances(5, 10, 16, 0.25)).toEqual([10, 10.5, 11, 11.5, 12]);
        expect(entrances(1, 10, 16, 0.25)).toEqual([10]);
    });

    it("lands every entrance and its count-up inside the first part of the section, leaving the rest to read", () => {
        for (const n of [2, 5, 8, 9]) {
            const beat = 0.35;
            const span = 16 * beat;
            const cues = entrances(n, 0, span, beat);
            expect(cues[cues.length - 1] + COUNT_BEATS * beat).toBeLessThanOrEqual(span * 0.75 + 1e-9);
            for (let i = 1; i < n; i++) expect(cues[i] - cues[i - 1]).toBeGreaterThan(0);
        }
    });

    it("counts up over two beats", () => {
        expect(COUNT_BEATS).toBe(2);
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
        const plan = yearEndPlan(29, ALL);
        const bar = 1.5;
        expect(sectionAt(plan, 16.5 * bar, bar)).toEqual({ id: "heroes", local: 0.5 });
        expect(sectionAt(plan, 20 * bar, bar)).toEqual({ id: "highlights", local: 0 });
        expect(sectionAt(plan, 11.5 * bar, bar)).toBeNull();
    });
});

describe("digitLocks", () => {
    it("locks one digit per bar over the four-bar year", () => {
        const plan = yearEndPlan(29, ALL);
        expect(digitLocks(plan, 4, 2)).toEqual([4, 6, 8, 10]);
    });

    it("locks two a bar when the year has two bars", () => {
        const plan = yearEndPlan(26, ALL);
        expect(plan.intro.digits.bars).toBe(2);
        expect(digitLocks(plan, 4, 1)).toEqual([1, 1.5, 2, 2.5]);
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
