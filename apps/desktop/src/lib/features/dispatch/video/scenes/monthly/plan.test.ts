import { describe, expect, it } from "vitest";

import { MUSIC_TRACKS } from "../../music";
import { videoTimeline } from "../../timeline";
import { COUNT_BEATS, TURN_BEATS, monthlyPlan, pageAt, staggers, type SectionId } from "./plan";

const ALL: SectionId[] = ["numbers", "calendar", "heroes", "best", "people", "rank"];
const title = videoTimeline(MUSIC_TRACKS.find((t) => t.id === "title")!);

describe("monthlyPlan", () => {
    it("fills the title track's 26 bars: the cover, six spreads of three or four bars, then the back cover", () => {
        expect(title.bars).toBe(26);
        const plan = monthlyPlan(26, ALL);
        expect(plan.cover).toEqual({ bar: 0, bars: 4 });
        expect(plan.sections).toEqual([
            { id: "numbers", bar: 4, bars: 4 },
            { id: "calendar", bar: 8, bars: 3 },
            { id: "heroes", bar: 11, bars: 4 },
            { id: "best", bar: 15, bars: 3 },
            { id: "people", bar: 18, bars: 3 },
            { id: "rank", bar: 21, bars: 3 },
        ]);
        expect(plan.end).toEqual({ bar: 24, bars: 2 });
    });

    it("holds every spread between 4 and 6.5 s on every track", () => {
        for (const track of MUSIC_TRACKS) {
            const { bars, barSeconds } = videoTimeline(track);
            for (const s of monthlyPlan(bars, ALL).sections) {
                expect(s.bars * barSeconds, `${track.id} ${s.id}`).toBeGreaterThanOrEqual(4);
                expect(s.bars * barSeconds, `${track.id} ${s.id}`).toBeLessThanOrEqual(6.5);
            }
        }
    });

    it("keeps the magazine's page order whatever is missing", () => {
        const plan = monthlyPlan(26, ["rank", "numbers", "heroes"]);
        expect(plan.sections.map((s) => s.id)).toEqual(["numbers", "heroes", "rank"]);
    });

    it("gives a missing spread's bars to the others, up to six bars each, then to the back cover", () => {
        const plan = monthlyPlan(26, ["numbers", "calendar", "heroes"]);
        expect(plan.cover).toEqual({ bar: 0, bars: 4 });
        expect(plan.sections).toEqual([
            { id: "numbers", bar: 4, bars: 6 },
            { id: "calendar", bar: 10, bars: 6 },
            { id: "heroes", bar: 16, bars: 6 },
        ]);
        expect(plan.end).toEqual({ bar: 22, bars: 4 });
    });

    it("fills every track exactly, with no gap or overlap from bar 0 to the last", () => {
        for (const track of MUSIC_TRACKS) {
            const { bars } = videoTimeline(track);
            for (const present of [ALL, ["numbers", "heroes"] as SectionId[], ["numbers"] as SectionId[]]) {
                const plan = monthlyPlan(bars, present);
                let next = 0;
                for (const span of [plan.cover, ...plan.sections, plan.end]) {
                    expect(span.bar).toBe(next);
                    next += span.bars;
                }
                expect(next).toBe(bars);
            }
        }
    });
});

describe("pageAt", () => {
    const plan = monthlyPlan(26, ALL);
    const bar = 1.5;
    const beat = bar / 4;

    it("names the page a moment falls on, with its local time", () => {
        expect(pageAt(plan, 0, bar)).toEqual({ page: "cover", start: 0, span: 6, turn: null });
        expect(pageAt(plan, 12 * bar, bar)).toMatchObject({ page: "heroes", start: 11 * bar, span: 4 * bar });
        expect(pageAt(plan, 25 * bar, bar)).toMatchObject({ page: "end", start: 24 * bar });
    });

    it("turns the page over the last beats before a bar line and lands the next page on it", () => {
        const before = pageAt(plan, 4 * bar - TURN_BEATS * beat - 0.01, bar);
        expect(before.turn).toBeNull();
        const mid = pageAt(plan, 4 * bar - (TURN_BEATS / 2) * beat, bar);
        expect(mid.page).toBe("cover");
        expect(mid.turn).toEqual({ to: "numbers", k: 0.5 });
        expect(pageAt(plan, 4 * bar, bar)).toEqual({ page: "numbers", start: 4 * bar, span: 4 * bar, turn: null });
    });

    it("turns into the back cover and never past it", () => {
        expect(pageAt(plan, 24 * bar - 0.01, bar).turn?.to).toBe("end");
        expect(pageAt(plan, 26 * bar - 0.01, bar).turn).toBeNull();
    });
});

describe("staggers", () => {
    it("lands the first on the downbeat and the rest evenly, at most two beats apart", () => {
        expect(staggers(4, 10, 16, 0.25)).toEqual([10, 10.5, 11, 11.5]);
        expect(staggers(1, 10, 16, 0.25)).toEqual([10]);
    });

    it("finishes every entrance and its slow count-up by 70% of the page, leaving the rest to read", () => {
        for (const n of [2, 5, 6, 9]) {
            const beat = 0.39;
            for (const bars of [3, 4]) {
                const span = bars * 4 * beat;
                const cues = staggers(n, 0, span, beat);
                expect(cues[cues.length - 1] + COUNT_BEATS * beat).toBeLessThanOrEqual(span * 0.7 + 1e-9);
                for (let i = 1; i < n; i++) expect(cues[i] - cues[i - 1]).toBeGreaterThan(0);
            }
        }
    });

    it("counts up over a whole bar, twice as slow as the Year-End's", () => {
        expect(COUNT_BEATS).toBe(4);
    });
});
