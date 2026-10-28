import { describe, expect, it } from "vitest";
import { entranceCues, flashAt, sinceTick } from "./beat";

describe("flashAt", () => {
    it("whites out on the hit and is gone within half a second", () => {
        expect(flashAt(4.9, 5)).toBe(0);
        expect(flashAt(5, 5)).toBe(1);
        expect(flashAt(5.2, 5)).toBeLessThan(0.35);
        expect(flashAt(5.6, 5)).toBe(0);
    });
});

describe("sinceTick", () => {
    it("is Infinity before the first tick and the time since the last one after", () => {
        expect(sinceTick(0.5, 1, 2)).toBe(Infinity);
        expect(sinceTick(1, 1, 2)).toBe(0);
        expect(sinceTick(4, 1, 2)).toBe(1);
    });
});

describe("entranceCues", () => {
    const pace = { share: 0.75, countBeats: 2, apartBeats: 2 };

    it("lands the first on the downbeat and the rest evenly, at most `apartBeats` apart", () => {
        expect(entranceCues(5, 10, 16, 0.25, pace)).toEqual([10, 10.5, 11, 11.5, 12]);
        expect(entranceCues(1, 10, 16, 0.25, pace)).toEqual([10]);
    });

    it("finishes the last entrance's count-up inside `share` of the span", () => {
        for (const p of [pace, { share: 0.7, countBeats: 4, apartBeats: 2 }]) {
            for (const n of [2, 5, 9]) {
                const beat = 0.35;
                const span = 16 * beat;
                const cues = entranceCues(n, 0, span, beat, p);
                expect(cues[cues.length - 1]! + p.countBeats * beat).toBeLessThanOrEqual(span * p.share + 1e-9);
                for (let i = 1; i < n; i++) expect(cues[i]! - cues[i - 1]!).toBeGreaterThan(0);
            }
        }
    });
});
