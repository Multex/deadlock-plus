import { describe, expect, it } from "vitest";
import type { Copy } from "../data";
import { copyId, coverRect, fitLines, pencilLoop, sheetLayout, stage } from "./studio";

/** Every glyph half an em wide: enough to reason about wrapping without a canvas. */
const measure = (s: string, px: number) => s.length * px * 0.5;

describe("fitLines", () => {
    it("keeps the size when the text fits on the allowed lines", () => {
        expect(fitLines(measure, "short line", { px: 100, floor: 50, maxW: 1000, maxLines: 2 })).toEqual({
            px: 100,
            lines: ["short line"],
        });
    });

    it("shrinks before it breaks past the allowed lines", () => {
        const r = fitLines(measure, "aaaa bbbb cccc dddd eeee", { px: 100, floor: 40, maxW: 500, maxLines: 2 });
        expect(r.lines.length).toBeLessThanOrEqual(2);
        expect(r.px).toBeLessThan(100);
        expect(r.px).toBeGreaterThanOrEqual(40);
        for (const l of r.lines) expect(measure(l, r.px)).toBeLessThanOrEqual(500);
    });

    it("never goes under the floor: it takes more lines instead", () => {
        const r = fitLines(measure, "one two three four five six seven eight nine ten", {
            px: 60,
            floor: 44,
            maxW: 300,
            maxLines: 2,
        });
        expect(r.px).toBe(44);
        expect(r.lines.length).toBeGreaterThan(2);
    });

    it("shrinks one long word to fit the width, but not under the floor", () => {
        expect(fitLines(measure, "Supercalifragilistic", { px: 100, floor: 20, maxW: 400, maxLines: 1 }).px).toBe(40);
        expect(fitLines(measure, "Supercalifragilistic", { px: 100, floor: 60, maxW: 400, maxLines: 1 }).px).toBe(60);
    });
});

describe("pencilLoop", () => {
    const pts = pencilLoop(500, 400, 120, 80, 7, 1);

    it("draws the same loop for the same seed and a different one for another", () => {
        expect(pencilLoop(500, 400, 120, 80, 7, 1)).toEqual(pts);
        expect(pencilLoop(500, 400, 120, 80, 8, 1)).not.toEqual(pts);
    });

    it("goes round more than once, like a hand circling, and stays near the ellipse", () => {
        const turn = (p: { x: number; y: number }) => Math.atan2((p.y - 400) / 80, (p.x - 500) / 120);
        let swept = 0;
        for (let i = 1; i < pts.length; i++) {
            let d = turn(pts[i]!) - turn(pts[i - 1]!);
            if (d > Math.PI) d -= 2 * Math.PI;
            if (d < -Math.PI) d += 2 * Math.PI;
            swept += d;
        }
        expect(Math.abs(swept)).toBeGreaterThan(2 * Math.PI);
        for (const p of pts) {
            const r = Math.hypot((p.x - 500) / 120, (p.y - 400) / 80);
            expect(r).toBeGreaterThan(0.85);
            expect(r).toBeLessThan(1.25);
        }
    });

    it("draws only the share of the stroke it is asked for", () => {
        const half = pencilLoop(500, 400, 120, 80, 7, 0.5);
        expect(half.length).toBeLessThan(pts.length);
        expect(half.length).toBeGreaterThan(pts.length / 3);
        expect(pencilLoop(500, 400, 120, 80, 7, 0)).toEqual([]);
    });
});

describe("sheetLayout", () => {
    const area = { x: 40, y: 300, w: 1000, h: 900 };

    it("puts a week on each strip, frames the same 3:2 size, inside the area and apart", () => {
        for (const days of [28, 30, 31]) {
            const s = sheetLayout(days, area);
            expect(s.frames).toHaveLength(days);
            expect(s.strips).toHaveLength(Math.ceil(days / 7));
            const f0 = s.frames[0]!;
            expect(f0.w / f0.h).toBeCloseTo(1.5, 5);
            s.frames.forEach((f, i) => {
                expect(f.w).toBeCloseTo(f0.w, 6);
                expect(f.x).toBeGreaterThanOrEqual(area.x - 1e-6);
                expect(f.y).toBeGreaterThanOrEqual(area.y - 1e-6);
                expect(f.x + f.w).toBeLessThanOrEqual(area.x + area.w + 1e-6);
                expect(f.y + f.h).toBeLessThanOrEqual(area.y + area.h + 1e-6);
                const strip = s.strips[Math.floor(i / 7)]!;
                expect(f.y).toBeGreaterThan(strip.y);
                expect(f.y + f.h).toBeLessThan(strip.y + strip.h);
                if (i % 7) expect(f.x).toBeGreaterThan(s.frames[i - 1]!.x + s.frames[i - 1]!.w);
            });
        }
    });

    it("fills the width of the area when the height allows", () => {
        const s = sheetLayout(30, { x: 0, y: 0, w: 1000, h: 2000 });
        const right = Math.max(...s.strips.map((r) => r.x + r.w));
        expect(right).toBeCloseTo(1000, 3);
    });
});

describe("coverRect", () => {
    it("fills the box and keeps the picture's shape, centred on the focus", () => {
        const r = coverRect(400, 200, { x: 0, y: 0, w: 100, h: 100 }, 0.5, 0.5);
        expect(r.h).toBe(100);
        expect(r.w).toBe(200);
        expect(r.x).toBe(-50);
        expect(coverRect(400, 200, { x: 0, y: 0, w: 100, h: 100 }, 1, 0.5).x).toBe(-100);
    });
});

describe("stage", () => {
    it("names the aspect and the band key text keeps to", () => {
        expect(stage({ w: 1080, h: 1920 }).aspect).toBe("tall");
        expect(stage({ w: 1440, h: 1440 }).aspect).toBe("square");
        expect(stage({ w: 1920, h: 1080 }).aspect).toBe("wide");
        expect(stage({ w: 1080, h: 1920 }).safe).toEqual({ top: 240, bottom: 1360 });
    });
});

describe("copyId", () => {
    it("tells apart the same key with other params or count", () => {
        const a: Copy = { key: "k_1", params: { a: 1 } };
        expect(copyId(a)).toBe(copyId({ key: "k_1", params: { a: 1 } }));
        expect(copyId(a)).not.toBe(copyId({ key: "k_1", params: { a: 2 } }));
        expect(copyId(a)).not.toBe(copyId({ ...a, count: 3 }));
    });
});
