import { describe, expect, it } from "vitest";
import {
    edgeLabelTop,
    nearestSample,
    rangeAt,
    stepSample,
    timeTicks,
    tipPlacement,
    tOf,
    xOf,
    yOf,
    type ChartBox,
    type ChartDomain,
} from "./chart";

const box: ChartBox = { width: 600, height: 160, padLeft: 4, padRight: 4, padTop: 6, padBottom: 6 };
const LABEL = 14;
const dom = (vMin: number, vMax: number): ChartDomain => ({ tMax: 100, vMin, vMax });

describe("edgeLabelTop", () => {
    it("keeps both labels at the edges when the zero line is clear of them", () => {
        const d = dom(-5000, 5000);
        expect(edgeLabelTop("max", d, box, LABEL)).toBe(0);
        expect(edgeLabelTop("min", d, box, LABEL)).toBe(box.height - LABEL);
    });

    it("puts a zero minimum just above the zero line", () => {
        const d = dom(0, 8000);
        const top = edgeLabelTop("min", d, box, LABEL);
        expect(top).not.toBeNull();
        expect(top! + LABEL).toBeLessThan(yOf(0, d, box));
        expect(edgeLabelTop("max", d, box, LABEL)).toBe(0);
    });

    it("puts a zero maximum just below the zero line", () => {
        const d = dom(-8000, 0);
        const top = edgeLabelTop("max", d, box, LABEL);
        expect(top).not.toBeNull();
        expect(top!).toBeGreaterThan(yOf(0, d, box));
        expect(edgeLabelTop("min", d, box, LABEL)).toBe(box.height - LABEL);
    });

    it("drops a small non-zero extreme whose label the zero line would cross", () => {
        expect(edgeLabelTop("min", dom(-200, 40000), box, LABEL)).toBeNull();
        expect(edgeLabelTop("max", dom(-40000, 200), box, LABEL)).toBeNull();
    });

    it("keeps a label the zero line only comes near", () => {
        const d = dom(-5000, 30000);
        expect(yOf(0, d, box)).toBeLessThan(box.height - LABEL - 2);
        expect(edgeLabelTop("min", d, box, LABEL)).toBe(box.height - LABEL);
    });
});

describe("tOf", () => {
    const d = dom(0, 10);

    it("inverts xOf", () => {
        expect(tOf(xOf(37, d, box), d, box)).toBeCloseTo(37);
    });

    it("clamps to the plotted span", () => {
        expect(tOf(0, d, box)).toBe(0);
        expect(tOf(box.width, d, box)).toBe(d.tMax);
    });
});

describe("nearestSample", () => {
    const line = [
        { t: 0, v: 0 },
        { t: 180, v: 10 },
        { t: 360, v: 30 },
        { t: 400, v: 35 },
    ];

    it("snaps to the closest sample, never between two", () => {
        expect(nearestSample(line, 80)).toBe(0);
        expect(nearestSample(line, 100)).toBe(1);
        expect(nearestSample(line, 300)).toBe(2);
        expect(nearestSample(line, 385)).toBe(3);
    });

    it("clamps outside the sampled span", () => {
        expect(nearestSample(line, -50)).toBe(0);
        expect(nearestSample(line, 9000)).toBe(3);
    });

    it("has no sample on an empty line", () => expect(nearestSample([], 10)).toBeNull());
});

describe("stepSample", () => {
    it("moves one sample and stops at the ends", () => {
        expect(stepSample(2, 1, 5)).toBe(3);
        expect(stepSample(2, -1, 5)).toBe(1);
        expect(stepSample(4, 1, 5)).toBe(4);
        expect(stepSample(0, -1, 5)).toBe(0);
    });

    it("enters from the end the key points away from", () => {
        expect(stepSample(null, 1, 5)).toBe(0);
        expect(stepSample(null, -1, 5)).toBe(4);
    });

    it("has nowhere to go on an empty line", () => expect(stepSample(null, 1, 0)).toBeNull());
});

describe("rangeAt", () => {
    const a = [
        { t: 0, v: 0 },
        { t: 100, v: 50 },
    ];
    const b = [
        { t: 0, v: 0 },
        { t: 100, v: 20 },
    ];

    it("spans the lines at that time", () => expect(rangeAt([a, b], 100)).toEqual({ min: 20, max: 50 }));
    it("ignores empty lines", () => expect(rangeAt([a, []], 100)).toEqual({ min: 50, max: 50 }));
    it("is null with nothing to span", () => expect(rangeAt([[]], 100)).toBeNull());
});

describe("tipPlacement", () => {
    const area = { width: 1000, height: 150 };
    const tip = { width: 200, height: 80 };

    it("sits to the right of the anchor, clear of it", () => {
        const p = tipPlacement({ x: 400, y: 75 }, tip, area, 12);
        expect(p.left).toBe(412);
        expect(p.top).toBe(35);
    });

    it("flips to the left when the right side has no room", () => {
        const p = tipPlacement({ x: 900, y: 75 }, tip, area, 12);
        expect(p.left).toBe(900 - 12 - 200);
        expect(p.left + tip.width).toBeLessThan(900);
    });

    it("stays on the right at the left edge", () => {
        expect(tipPlacement({ x: 0, y: 75 }, tip, area, 12).left).toBe(12);
    });

    it("keeps the box inside the chart vertically", () => {
        expect(tipPlacement({ x: 400, y: 2 }, tip, area, 12).top).toBe(0);
        expect(tipPlacement({ x: 400, y: 149 }, tip, area, 12).top).toBe(70);
    });

    it("clamps inside a chart too narrow for either side", () => {
        const narrow = { width: 260, height: 150 };
        const p = tipPlacement({ x: 130, y: 75 }, tip, narrow, 12);
        expect(p.left).toBeGreaterThanOrEqual(0);
        expect(p.left + tip.width).toBeLessThanOrEqual(narrow.width);
    });

    it("pins a box taller than the chart to the top", () => {
        expect(tipPlacement({ x: 400, y: 75 }, { width: 200, height: 300 }, area, 12).top).toBe(0);
    });
});

describe("timeTicks", () => {
    const plot = { width: 1170, padLeft: 8, padRight: 8 };
    const LABEL_W = 32;
    const GAP = 24;
    const ticks = (duration: number, p = plot) => timeTicks(duration, p, LABEL_W, GAP);
    const minutes = (duration: number, p = plot) => ticks(duration, p).map((k) => k.t / 60);
    const span = (k: { x: number; align: string }, width: number) => {
        if (k.align === "start") return [0, LABEL_W];
        if (k.align === "end") return [width - LABEL_W, width];
        return [k.x - LABEL_W / 2, k.x + LABEL_W / 2];
    };
    const expectClear = (duration: number, p = plot) => {
        const spans = ticks(duration, p).map((k) => span(k, p.width));
        for (const [left, right] of spans) {
            expect(left).toBeGreaterThanOrEqual(0);
            expect(right).toBeLessThanOrEqual(p.width);
        }
        for (let i = 1; i < spans.length; i++) expect(spans[i][0] - spans[i - 1][1]).toBeGreaterThanOrEqual(GAP);
    };

    it("steps a short match by one minute and labels its end", () => {
        expect(minutes(10 * 60 + 50)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10 + 50 / 60]);
        expectClear(10 * 60 + 50);
    });

    it("steps a typical match by five minutes", () => {
        expect(minutes(38 * 60 + 42)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 38.7]);
        expectClear(38 * 60 + 42);
    });

    it("steps a long match by five minutes on a wide chart and wider on a narrow one", () => {
        expect(minutes(70 * 60)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70]);
        expect(minutes(70 * 60, { width: 400, padLeft: 3, padRight: 3 })).toEqual([0, 15, 30, 45, 60]);
        expectClear(70 * 60);
        expectClear(70 * 60, { width: 400, padLeft: 3, padRight: 3 });
    });

    it("aligns the first label to the left edge, the end label to the right edge and centres the rest", () => {
        const all = ticks(38 * 60 + 42);
        expect(all[0]).toEqual({ t: 0, x: plot.padLeft, align: "start" });
        expect(all[1].align).toBe("center");
        expect(all[1].x).toBeCloseTo(plot.padLeft + (300 / (38 * 60 + 42)) * (plot.width - 16));
        expect(all[all.length - 1]).toEqual({ t: 38 * 60 + 42, x: plot.width - plot.padRight, align: "end" });
    });

    it("leaves the end label out when it would collide with the last tick", () => {
        expect(minutes(35 * 60 + 40)).toEqual([0, 5, 10, 15, 20, 25, 30, 35]);
        expectClear(35 * 60 + 40);
    });

    it("drops a tick whose centred label the right edge would cut, in favour of the end label", () => {
        const all = ticks(40 * 60);
        expect(all.map((k) => k.t / 60)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40]);
        expect(all[all.length - 1].align).toBe("end");
    });

    it("keeps only 0:00 when the duration is zero or not a number", () => {
        expect(ticks(0)).toEqual([{ t: 0, x: plot.padLeft, align: "start" }]);
        expect(ticks(-5)).toEqual([{ t: 0, x: plot.padLeft, align: "start" }]);
        expect(ticks(Number.NaN)).toEqual([{ t: 0, x: plot.padLeft, align: "start" }]);
    });

    it("has no ticks before the chart is measured", () => {
        expect(ticks(2000, { width: 0, padLeft: 0, padRight: 0 })).toEqual([]);
    });

    it("thins out on a narrow chart and never overlaps", () => {
        expect(minutes(38 * 60 + 42, { width: 160, padLeft: 1, padRight: 1 })).toEqual([0, 30]);
        expect(minutes(38 * 60 + 42, { width: 70, padLeft: 1, padRight: 1 })).toEqual([0]);
        expect(minutes(38 * 60 + 42, { width: 30, padLeft: 1, padRight: 1 })).toEqual([0]);
        for (const width of [70, 100, 160, 240, 400, 700]) {
            for (const duration of [45, 620, 2322, 4200, 9000])
                expectClear(duration, { width, padLeft: 1, padRight: 1 });
        }
    });
});
