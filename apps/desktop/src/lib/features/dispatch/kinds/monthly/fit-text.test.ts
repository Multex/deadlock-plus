import { afterEach, describe, expect, it, vi } from "vitest";
import { fitAll, fitText, type FitNode } from "./fit-text";

/** A box whose content grows linearly with the font size, counting each layout-forcing read. */
function fakeNode(box: { w: number; h: number }, perPx: { w: number; h: number }) {
    let fs = Number.NaN;
    let reads = 0;
    const node: FitNode = {
        style: {
            setProperty(name: string, value: string) {
                if (name === "--fs") fs = parseFloat(value);
            },
        },
        get scrollHeight() {
            reads++;
            return Math.max(box.h, Math.ceil(fs * perPx.h));
        },
        get scrollWidth() {
            reads++;
            return Math.max(box.w, Math.ceil(fs * perPx.w));
        },
        clientHeight: box.h,
        clientWidth: box.w,
    };
    return { node, size: () => fs, reads: () => reads };
}

/** The answer of shrinking 1px at a time from `max`, the reference the fit must match. */
function linearAnswer(box: { w: number; h: number }, perPx: { w: number; h: number }, max: number, min: number) {
    const fits = (s: number) => Math.ceil(s * perPx.h) <= box.h + 1 && Math.ceil(s * perPx.w) <= box.w + 1;
    let s = max;
    while (s > min && !fits(s)) s--;
    return s;
}

const ranges: [max: number, min: number][] = [
    [124, 48],
    [46, 22],
    [21, 13],
    [17, 12],
    [50, 26],
];

describe("fitAll", () => {
    it("picks the same size as shrinking one pixel at a time", () => {
        for (const [max, min] of ranges) {
            for (let h = 10; h <= 160; h += 7) {
                for (let w = 30; w <= 600; w += 41) {
                    const box = { w, h };
                    const perPx = { w: 3.7, h: 1.25 };
                    const f = fakeNode(box, perPx);
                    fitAll([{ node: f.node, max, min }]);
                    expect(f.size(), `max ${max} min ${min} box ${w}x${h}`).toBe(linearAnswer(box, perPx, max, min));
                }
            }
        }
    });

    it("forces a logarithmic number of layouts per node", () => {
        const max = 124;
        const min = 48;
        const bound = 2 * (Math.ceil(Math.log2(max - min + 1)) + 1);
        for (let h = 60; h <= 160; h += 5) {
            const f = fakeNode({ w: 10_000, h }, { w: 1, h: 1 });
            fitAll([{ node: f.node, max, min }]);
            expect(f.reads(), `box height ${h}`).toBeLessThanOrEqual(bound);
        }
    });

    it("reads once when the largest size already fits", () => {
        const f = fakeNode({ w: 1000, h: 1000 }, { w: 1, h: 1 });
        fitAll([{ node: f.node, max: 124, min: 48 }]);
        expect(f.size()).toBe(124);
        expect(f.reads()).toBeLessThanOrEqual(2);
    });

    it("fits several nodes in one pass, each to its own answer", () => {
        const specs = [
            { box: { w: 284, h: 136 }, perPx: { w: 9, h: 3 }, max: 46, min: 22 },
            { box: { w: 284, h: 44 }, perPx: { w: 20, h: 2.4 }, max: 17, min: 12 },
            { box: { w: 900, h: 118 }, perPx: { w: 11, h: 1 }, max: 124, min: 48 },
        ];
        const fakes = specs.map((s) => fakeNode(s.box, s.perPx));
        fitAll(specs.map((s, i) => ({ node: fakes[i].node, max: s.max, min: s.min })));
        specs.forEach((s, i) => expect(fakes[i].size()).toBe(linearAnswer(s.box, s.perPx, s.max, s.min)));
    });
});

describe("fitText font loading", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("stops refitting when font readiness resolves with a stale loading status", async () => {
        const tasks: VoidFunction[] = [];
        vi.stubGlobal("queueMicrotask", (task: VoidFunction) => tasks.push(task));
        vi.stubGlobal("document", { fonts: { status: "loading", ready: Promise.resolve() } });
        const fake = fakeNode({ w: 1000, h: 1000 }, { w: 1, h: 1 });
        const detach = fitText(46, 22)(fake.node as HTMLElement);
        try {
            tasks.shift()!();
            await Promise.resolve();
            while (tasks.length && fake.reads() < 20) {
                tasks.shift()!();
                await Promise.resolve();
            }
            expect(tasks).toHaveLength(0);
            expect(fake.reads()).toBeLessThanOrEqual(4);
        } finally {
            detach();
            while (tasks.length) tasks.shift()!();
        }
    });

    it("fits again after fonts load, but leaves detached nodes alone", async () => {
        const tasks: VoidFunction[] = [];
        let ready!: () => void;
        const fonts = { status: "loading", ready: new Promise<void>((resolve) => (ready = resolve)) };
        vi.stubGlobal("queueMicrotask", (task: VoidFunction) => tasks.push(task));
        vi.stubGlobal("document", { fonts });
        const live = fakeNode({ w: 1000, h: 1000 }, { w: 1, h: 1 });
        const removed = fakeNode({ w: 1000, h: 1000 }, { w: 1, h: 1 });
        const detachLive = fitText(46, 22)(live.node as HTMLElement);
        const detachRemoved = fitText(46, 22)(removed.node as HTMLElement);
        try {
            tasks.shift()!();
            const reads = removed.reads();
            detachRemoved();
            fonts.status = "loaded";
            ready();
            await Promise.resolve();
            while (tasks.length) tasks.shift()!();
            expect(live.reads()).toBe(4);
            expect(removed.reads()).toBe(reads);
        } finally {
            detachLive();
            detachRemoved();
        }
    });
});
