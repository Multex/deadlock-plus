import { describe, expect, it } from "vitest";

import { seeded } from "../../theme-decor-random";
import { STAR, createSpecks, crawl, layout, speckAt, starPoints, tangent, turnAt } from "./sigil";

describe("starPoints", () => {
    it("puts the star's points on the circle, the first at the top", () => {
        const points = starPoints();

        expect(points).toHaveLength(5);
        for (const p of points) expect(Math.hypot(p.x, p.y)).toBeCloseTo(1);
        expect(points[0]!.x).toBeCloseTo(0);
        expect(points[0]!.y).toBeCloseTo(-1);
    });

    it("draws a pentagram: each stroke skips a point, coming back to the start", () => {
        expect(STAR).toEqual([0, 2, 4, 1, 3, 0]);
    });
});

describe("tangent", () => {
    it("touches the circle at one point and runs on past it both ways", () => {
        const { from, to } = tangent(Math.PI / 3, 3);
        // Distance from the centre to the line through both ends.
        const d = Math.abs(from.x * to.y - to.x * from.y) / Math.hypot(to.x - from.x, to.y - from.y);

        expect(d).toBeCloseTo(1);
        expect(Math.hypot(to.x - from.x, to.y - from.y)).toBeCloseTo(6);
    });
});

describe("layout", () => {
    it("sets the sigil low on the right, big, and partly off the panel", () => {
        const { cx, cy, r } = layout(1230, 836);

        expect(cx).toBeGreaterThan(1230 / 2);
        expect(cy).toBeGreaterThan(836 / 2);
        expect(r).toBeGreaterThan(300);
        expect(cx + r).toBeGreaterThan(1230);
    });

    it("keeps a usable size in a small window", () => {
        expect(layout(600, 400).r).toBeGreaterThanOrEqual(220);
    });
});

describe("turnAt", () => {
    it("turns by the wall clock, so a rebuilt panel carries on where it was", () => {
        expect(turnAt(5_000_000)).toBe(turnAt(5_000_000));
        expect(turnAt(5_060_000)).not.toBe(turnAt(5_000_000));
    });

    it("turns slowly enough that ten frames a second look smooth at the rim", () => {
        const rim = layout(1230, 836).r;
        expect((turnAt(1_000_100) - turnAt(1_000_000)) * rim).toBeLessThan(1);
    });
});

describe("crawl", () => {
    it("moves the dashes along the lines slowly, by the wall clock", () => {
        expect(crawl(1_000_100) - crawl(1_000_000)).toBeGreaterThan(0);
        expect(crawl(1_000_100) - crawl(1_000_000)).toBeLessThan(2);
    });
});

describe("specks", () => {
    const specks = createSpecks(seeded(1), 40);

    it("scatters the same specks for the same seed", () => {
        expect(specks).toEqual(createSpecks(seeded(1), 40));
    });

    it("drifts each speck slowly and keeps it on the panel, wrapping round", () => {
        for (const s of specks) {
            for (const now of [0, 1e6, 7.7e8]) {
                const a = speckAt(s, now, 1230, 836);
                const b = speckAt(s, now + 100, 1230, 836);
                expect(a.x).toBeGreaterThanOrEqual(0);
                expect(a.x).toBeLessThanOrEqual(1230);
                expect(a.y).toBeGreaterThanOrEqual(0);
                expect(a.y).toBeLessThanOrEqual(836);
                if (Math.abs(b.y - a.y) < 400) expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(1);
            }
        }
    });
});
