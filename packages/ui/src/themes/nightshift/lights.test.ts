import { describe, expect, it } from "vitest";

import { seeded } from "../../theme-decor-random";
import { bulbReach, glow, haloRadius, stringLights, wireAt, type Header } from "./lights";

const W = 1400;

/**
 * Where a page header sits on the lights canvas: the page column inside the panel's 1 px border and 10 px
 * scrollbar gutter, its h1 31 px below the panel's top (measured in the app at a 15 px root size).
 */
function headerOf(width: number, maxWidth: number, padding: number): Header {
    const inner = width - 11;
    const page = Math.min(inner, maxWidth);
    const left = 1 + (inner - page) / 2 + padding;
    return { left, right: left + page - 2 * padding, top: 31 };
}
const pageHeader = (width: number) => headerOf(width, 960, 30);
/** The Builds page runs almost the full width of the panel. */
const buildsHeader = (width: number) => headerOf(width, 1232, 15);

const HEADER = pageHeader(W);

describe("stringLights", () => {
    it("lays out the same strands for the same seed", () => {
        expect(stringLights(W, seeded(1), HEADER)).toEqual(stringLights(W, seeded(1), HEADER));
    });

    it("strings more bulbs across a wider panel", () => {
        const count = (width: number) =>
            stringLights(width, seeded(2), pageHeader(width)).reduce((n, s) => n + s.bulbs.length, 0);
        expect(count(1800)).toBeGreaterThan(count(900));
    });

    it("spans the whole width between its strands", () => {
        const strands = stringLights(W, seeded(3), HEADER);
        expect(Math.min(...strands.map((s) => Math.min(s.from.x, s.to.x)))).toBeLessThanOrEqual(0);
        expect(Math.max(...strands.map((s) => Math.max(s.from.x, s.to.x)))).toBeGreaterThanOrEqual(W);
    });

    it("hangs across the top, clear of most of the panel", () => {
        for (const s of stringLights(W, seeded(4), HEADER)) {
            for (let t = 0; t <= 1; t += 0.1) expect(wireAt(s, t, 0).y).toBeLessThan(140);
        }
    });

    // Panel widths: a 1440 px window, the 1480 px minimum with the sidebar open and collapsed, a 2560 px window.
    const panels = [1230, 1270, 1420, 2350].flatMap((width) => [
        { width, header: pageHeader(width) },
        { width, header: buildsHeader(width) },
    ]);

    it("keeps every bulb and its halo above the page header over its column, all through the sway", () => {
        for (const { width, header } of panels) {
            for (const seed of [0x11c7, 1, 2, 3]) {
                let lowest = -Infinity;
                for (const strand of stringLights(width, seeded(seed), header)) {
                    for (const bulb of strand.bulbs) {
                        for (let now = 0; now < 10_000; now += 20) {
                            const p = wireAt(strand, bulb.t, now);
                            const r = haloRadius(bulb);
                            if (p.x + r < header.left || p.x - r > header.right) continue;
                            lowest = Math.max(lowest, p.y + bulbReach(bulb));
                        }
                    }
                }
                expect(lowest, `panel ${width}, header ${header.left}-${header.right}`).toBeLessThanOrEqual(header.top);
            }
        }
    });

    it("still drops deep strands in the side gutters beside a narrow page column", () => {
        const header = pageHeader(1230);
        const deep = stringLights(1230, seeded(0x11c7), header).flatMap((s) =>
            s.bulbs.map((b) => wireAt(s, b.t, 0)).filter((p) => p.x >= 0 && p.x < header.left && p.y > 40),
        );
        expect(deep.length).toBeGreaterThan(0);
    });

    it("hangs its deep strands across the panel when no header is in reach", () => {
        const lowest = Math.max(
            ...stringLights(W, seeded(7), null).flatMap((s) => s.bulbs.map((b) => wireAt(s, b.t, 0).y)),
        );
        expect(lowest).toBeGreaterThan(50);
    });
});

describe("wireAt", () => {
    const [strand] = stringLights(W, seeded(5), HEADER);

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
    const bulbs = stringLights(W, seeded(6), HEADER).flatMap((s) => s.bulbs);
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
