import { describe, expect, it } from "vitest";

import { litShare, sky } from "./city";

const at = (hour: number, minute = 0) => new Date(2026, 9, 25, hour, minute);

describe("litShare", () => {
    it("is busiest in the evening and thins out toward the small hours", () => {
        expect(litShare(at(19))).toBeGreaterThan(litShare(at(23)));
        expect(litShare(at(23))).toBeGreaterThan(litShare(at(3)));
    });

    it("picks up again with the early risers before dawn", () => {
        expect(litShare(at(6, 30))).toBeGreaterThan(litShare(at(4)));
    });

    it("changes smoothly, with no jump at the top of an hour", () => {
        expect(Math.abs(litShare(at(1, 59)) - litShare(at(2)))).toBeLessThan(0.02);
    });

    it("stays a share", () => {
        for (let h = 0; h < 24; h++) {
            expect(litShare(at(h))).toBeGreaterThan(0);
            expect(litShare(at(h))).toBeLessThanOrEqual(1);
        }
    });
});

describe("sky", () => {
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
    const light = (hex: string) => rgb(hex).reduce((a, b) => a + b);

    it("stays teal at every hour, like the show's graded street", () => {
        for (let h = 0; h < 24; h += 0.5) {
            for (const hex of Object.values(sky(at(Math.floor(h), (h % 1) * 60)))) {
                const [r, g, b] = rgb(hex);
                expect(r).toBeLessThan(g);
                expect(r).toBeLessThan(b);
            }
        }
    });

    it("lifts a little by day and is darkest in the dead of night", () => {
        expect(light(sky(at(13)).horizon)).toBeGreaterThan(light(sky(at(3)).horizon));
        expect(light(sky(at(13)).top)).toBeGreaterThan(light(sky(at(3)).top));
    });

    it("gives hex colours for the top and the horizon", () => {
        expect(sky(at(0)).top).toMatch(/^#[0-9a-f]{6}$/);
        expect(sky(at(0)).horizon).toMatch(/^#[0-9a-f]{6}$/);
    });
});
