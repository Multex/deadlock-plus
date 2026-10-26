import { describe, expect, it } from "vitest";
import { sceneFrame } from "../../../kit/frame";
import { revealBar } from "../plan";
import { awardTimes, fitLines, nomineeSlots, seatOrder } from "./award-kit";

const BAR = 60 / 172 * 4;

describe("awardTimes", () => {
    for (const bars of [3, 4, 5, 6]) {
        it(`tears the envelope on the plan's reveal bar for ${bars} bars`, () => {
            const at = awardTimes(bars, BAR, 3);
            const beat = { id: "y_hero" as const, bar: 7, bars };
            expect(at.reveal).toBeCloseTo((revealBar(beat)! - beat.bar) * BAR, 9);
        });

        it(`runs title, nominees, envelope, tear, spotlight, acceptance in order inside ${bars} bars`, () => {
            const at = awardTimes(bars, BAR, 3);
            expect(at.nominees[0]).toBeGreaterThanOrEqual(at.title);
            const order = [0, ...at.nominees, at.envelope, at.reveal, at.spot, at.accept];
            for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]!);
            expect(at.accept).toBeLessThan(bars * BAR - BAR / 2);
        });
    }

    it("lands the spotlight a beat after the tear, as the sound effects do", () => {
        const at = awardTimes(4, BAR, 3);
        expect(at.spot - at.reveal).toBeCloseTo(BAR / 4, 9);
    });

    it("lands nominees on the beat when there is room, at most a beat apart", () => {
        const at = awardTimes(6, BAR, 3);
        for (const t of at.nominees) expect((t / (BAR / 4)) % 1).toBeCloseTo(0, 6);
        for (const n of [1, 2, 3]) {
            const cues = awardTimes(3, BAR, n).nominees;
            for (let i = 1; i < cues.length; i++) expect(cues[i]! - cues[i - 1]!).toBeLessThanOrEqual(BAR / 4 + 1e-9);
        }
    });
});

describe("seatOrder", () => {
    it("seats every nominee once", () => {
        for (const n of [1, 2, 3]) {
            for (const seed of ["a", "b", "y_hero", "y_villain"]) {
                expect([...seatOrder(n, seed)].sort()).toEqual(Array.from({ length: n }, (_, i) => i));
            }
        }
    });

    it("is stable for a seed and does not always seat the winner first", () => {
        expect(seatOrder(3, "x")).toEqual(seatOrder(3, "x"));
        const winnerSeats = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map((s) => seatOrder(3, s).indexOf(0)));
        expect(winnerSeats.size).toBeGreaterThan(1);
    });
});

describe("nomineeSlots", () => {
    const sizes = [
        { w: 1080, h: 1920 },
        { w: 1440, h: 1440 },
        { w: 1920, h: 1080 },
    ];
    for (const size of sizes) {
        for (const n of [1, 2, 3]) {
            it(`lays ${n} cards inside ${size.w}x${size.h} without overlap`, () => {
                const slots = nomineeSlots(n, size);
                const { u, safe } = sceneFrame(size.w, size.h);
                expect(slots).toHaveLength(n);
                for (const r of slots) {
                    expect(r.x).toBeGreaterThanOrEqual(16 * u);
                    expect(r.x + r.w).toBeLessThanOrEqual(size.w - 16 * u);
                    expect(r.y).toBeGreaterThanOrEqual(safe.top);
                    // The label under each card is key text too.
                    expect(r.y + r.h + 180 * u).toBeLessThanOrEqual(safe.bottom);
                }
                for (let i = 1; i < n; i++) expect(slots[i]!.x).toBeGreaterThanOrEqual(slots[i - 1]!.x + slots[i - 1]!.w);
                const mid = (slots[0]!.x + slots[n - 1]!.x + slots[n - 1]!.w) / 2;
                expect(mid).toBeCloseTo(size.w / 2, 6);
            });
        }
    }
});

describe("nomineeSlots drop", () => {
    it("lowers the row by `drop` content units, for a header that runs long", () => {
        const size = { w: 1080, h: 1920 };
        const [a] = nomineeSlots(3, size);
        const [b] = nomineeSlots(3, size, 90);
        expect(b!.y - a!.y).toBeCloseTo(90, 6);
        expect(b!.x).toBe(a!.x);
    });
});

describe("fitLines", () => {
    const measure = (s: string, px: number) => s.length * px * 0.5;

    it("keeps a line that fits at its size", () => {
        expect(fitLines(measure, "Lash", 100, 96, 1000)).toEqual({ lines: ["Lash"], px: 100 });
    });

    it("shrinks a line that is a little too wide, but never under the floor", () => {
        const r = fitLines(measure, "Mo & Krill", 110, 96, 520);
        expect(r.lines).toEqual(["Mo & Krill"]);
        expect(r.px).toBeGreaterThanOrEqual(96);
        expect(measure("Mo & Krill", r.px)).toBeLessThanOrEqual(520);
    });

    it("wraps rather than going under the floor", () => {
        const r = fitLines(measure, "Accepting together tonight with Copperhead", 48, 44, 520);
        expect(r.px).toBeGreaterThanOrEqual(44);
        expect(r.lines.length).toBe(2);
        for (const l of r.lines) expect(measure(l, r.px)).toBeLessThanOrEqual(520);
    });

    it("never drops words: a line too long for its lines runs onto more", () => {
        const r = fitLines(measure, "one two three four five six", 40, 40, 70, 2);
        expect(r.lines.join(" ")).toBe("one two three four five six");
    });
});
