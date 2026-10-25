import { describe, expect, it } from "vitest";

import { seeded } from "../../theme-decor-random";
import { glow, stringLights, wireAt } from "./lights";

const W = 1400;

describe("stringLights", () => {
    it("lays out the same strands for the same seed", () => {
        expect(stringLights(W, seeded(1))).toEqual(stringLights(W, seeded(1)));
    });

    it("strings more bulbs across a wider panel", () => {
        const count = (width: number) => stringLights(width, seeded(2)).reduce((n, s) => n + s.bulbs.length, 0);
        expect(count(1800)).toBeGreaterThan(count(900));
    });

    it("spans the whole width between its strands", () => {
        const strands = stringLights(W, seeded(3));
        expect(Math.min(...strands.map((s) => Math.min(s.from.x, s.to.x)))).toBeLessThanOrEqual(0);
        expect(Math.max(...strands.map((s) => Math.max(s.from.x, s.to.x)))).toBeGreaterThanOrEqual(W);
    });

    it("hangs across the top, clear of most of the panel", () => {
        for (const s of stringLights(W, seeded(4))) {
            for (let t = 0; t <= 1; t += 0.1) expect(wireAt(s, t, 0).y).toBeLessThan(140);
        }
    });
});

describe("wireAt", () => {
    const [strand] = stringLights(W, seeded(5));

    it("runs from one anchor to the other", () => {
        expect(wireAt(strand!, 0, 12_345)).toEqual(strand!.from);
        expect(wireAt(strand!, 1, 12_345)).toEqual(strand!.to);
    });

    it("sags lowest near the middle of the span", () => {
        const middle = wireAt(strand!, 0.5, 0).y;
        const chord = (strand!.from.y + strand!.to.y) / 2;
        expect(middle).toBeGreaterThan(chord + 20);
        expect(middle).toBeGreaterThan(wireAt(strand!, 0.15, 0).y);
        expect(middle).toBeGreaterThan(wireAt(strand!, 0.85, 0).y);
    });

    it("sways only a little", () => {
        const rest = wireAt(strand!, 0.5, 0);
        for (let now = 0; now < 60_000; now += 333) {
            const p = wireAt(strand!, 0.5, now);
            expect(Math.hypot(p.x - rest.x, p.y - rest.y)).toBeLessThan(12);
        }
    });

    it("sways slowly enough that ten frames a second look smooth", () => {
        for (let now = 0; now < 20_000; now += 100) {
            const a = wireAt(strand!, 0.5, now);
            const b = wireAt(strand!, 0.5, now + 100);
            expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(1);
        }
    });
});

describe("glow", () => {
    const bulbs = stringLights(W, seeded(6)).flatMap((s) => s.bulbs);
    const dips = (bulb: (typeof bulbs)[number]) => {
        for (let now = 0; now < 60_000; now += 50) if (glow(bulb, now) < 1) return true;
        return false;
    };

    it("keeps most bulbs steady", () => {
        expect(bulbs.filter(dips).length).toBeLessThan(bulbs.length / 4);
    });

    it("lets the odd bulb flicker", () => {
        expect(bulbs.filter(dips).length).toBeGreaterThan(0);
    });

    it("flickers in stutters long enough to catch at ten frames a second", () => {
        const flickery = bulbs.find(dips)!;
        let run = 0;
        let longest = 0;
        for (let now = 0; now < 60_000; now += 10) {
            run = glow(flickery, now) < 1 ? run + 10 : 0;
            longest = Math.max(longest, run);
        }
        expect(longest).toBeGreaterThanOrEqual(100);
    });
});
