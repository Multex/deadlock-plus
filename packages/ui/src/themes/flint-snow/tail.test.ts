import { describe, expect, it } from "vitest";

import { seeded } from "../../theme-decor-random";
import { TAIL_HEIGHT, TAIL_WIDTH, band, furStrokes, tailFrame } from "./tail";

describe("band", () => {
    it("runs coral at the base, a dark-red flame band, then a cream tip, as on the sheet", () => {
        expect(band(0.2, 0)).toBe("coral");
        expect(band(0.5, 0)).toBe("dark");
        expect(band(0.85, 0)).toBe("cream");
    });

    it("has flame-shaped edges: the boundary moves along the tail across its width", () => {
        const edgeAt = (f: number) => {
            for (let t = 0.3; t < 0.8; t += 0.002) if (band(t, f) === "cream") return t;
            return 1;
        };

        expect(Math.abs(edgeAt(0) - edgeAt(0.33))).toBeGreaterThan(0.02);
    });
});

describe("furStrokes", () => {
    const strokes = furStrokes(seeded(1));

    it("paints the same tail every time", () => {
        expect(strokes).toEqual(furStrokes(seeded(1)));
        expect(strokes.length).toBeGreaterThan(1500);
    });

    it("stays inside the tail's box", () => {
        for (const s of strokes) {
            expect(s.x0).toBeGreaterThan(-20);
            expect(s.x0).toBeLessThan(TAIL_WIDTH + 20);
            expect(s.y0).toBeGreaterThan(-20);
            expect(s.y0).toBeLessThan(TAIL_HEIGHT + 20);
        }
    });

    it("lies along the tail toward its tip, like brushed fur", () => {
        const along = strokes.filter((s) => {
            const { along: a } = tailFrame(s.t);
            return (s.x1 - s.x0) * a[0] + (s.y1 - s.y0) * a[1] > 0;
        });

        expect(along.length / strokes.length).toBeGreaterThan(0.95);
    });
});
