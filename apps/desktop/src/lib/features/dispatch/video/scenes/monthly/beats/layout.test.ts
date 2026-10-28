import { describe, expect, it } from "vitest";
import { featureArt, logPick, logRows } from "./feature";
import { liveRows, spreadLayout } from "./print";
import { stage } from "./studio";
import { typedLength, wrapAround } from "./interview";
import { keepLens } from "./takes";

describe("typedLength", () => {
    it("types nothing before the cue and everything once the time is up", () => {
        expect(typedLength("Busiest day?", 0.9, 1, 30)).toBe(0);
        expect(typedLength("Busiest day?", 1 + 6 / 30, 1, 30)).toBe(6);
        expect(typedLength("Busiest day?", 5, 1, 30)).toBe(12);
    });
});

describe("keepLens", () => {
    const bounds = { x: 100, y: 400, w: 800, h: 1000 };
    it("keeps the whole lens inside the area it may cover", () => {
        expect(keepLens(50, 300, 120, bounds)).toEqual({ x: 220, y: 520 });
        expect(keepLens(980, 1500, 120, bounds)).toEqual({ x: 780, y: 1280 });
    });
    it("leaves a lens that already fits where it is", () => {
        expect(keepLens(500, 800, 120, bounds)).toEqual({ x: 500, y: 800 });
    });
});

describe("logRows", () => {
    it("shows the whole run when it fits, rows no taller than the cap", () => {
        expect(logRows(8, 800, 84, 112)).toEqual({ shown: 8, rowH: 100 });
        expect(logRows(3, 800, 84, 112)).toEqual({ shown: 3, rowH: 112 });
    });
    it("keeps a row for the '+N' line when the run is longer than the page", () => {
        const r = logRows(14, 700, 84, 112);
        expect(r.shown).toBe(7);
        expect(r.rowH * (r.shown + 1)).toBeLessThanOrEqual(700 + 1e-9);
        expect(r.rowH).toBeGreaterThanOrEqual(84);
    });
});

describe("logPick", () => {
    const m = (outcome: "win" | "loss", i: number) => ({
        date: `${i}`,
        heroId: i,
        outcome,
        kda: { kills: i, deaths: 0, assists: 0 },
    });
    it("keeps the end of the losing run and the start of the turn", () => {
        const reel = [
            ...Array.from({ length: 6 }, (_, i) => m("loss", i)),
            ...Array.from({ length: 8 }, (_, i) => m(i === 3 ? "loss" : "win", 6 + i)),
        ];
        const picked = logPick(reel, 7);
        expect(picked).toHaveLength(7);
        expect(picked[0]!.outcome).toBe("loss");
        expect(picked.at(-1)!.outcome).toBe("win");
        expect(picked.map((x) => x.heroId)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    });
    it("returns a short run whole", () => {
        const reel = [m("win", 1), m("win", 2)];
        expect(logPick(reel, 5)).toEqual(reel);
    });
});

describe("wrapAround", () => {
    const measure = (s: string) => s.length * 10;
    it("keeps the first lines clear of the drop cap and lets the rest run full width", () => {
        const lines = wrapAround(measure, "aaaa bbbb cccc dddd eeee ffff gggg", 100, 50, 2);
        expect(lines.slice(0, 2).every((l) => measure(l) <= 50)).toBe(true);
        expect(lines.slice(2).some((l) => measure(l) > 50)).toBe(true);
    });
});

describe("liveRows", () => {
    it("keeps the live rows of a 9:16 page inside the safe band", () => {
        const tall = stage({ w: 1080, h: 1920 });
        const sp = spreadLayout(tall);
        const live = liveRows(tall, sp);
        expect(sp.right.y + live.top * sp.s).toBeGreaterThanOrEqual(tall.safe.top);
        expect(sp.right.y + live.bottom * sp.s).toBeLessThanOrEqual(tall.safe.bottom);
        expect(live.bottom - live.top).toBeGreaterThan(1000);
    });
    it("gives a square or wide page its whole printed area", () => {
        for (const size of [
            { w: 1440, h: 1440 },
            { w: 1920, h: 1080 },
        ]) {
            const st = stage(size);
            expect(liveRows(st, spreadLayout(st))).toEqual({ top: 90, bottom: 1333 - 120 });
        }
    });
});

describe("spreadLayout", () => {
    it("sets page body type at or over the phone floor in every aspect", () => {
        for (const size of [
            { w: 1080, h: 1920 },
            { w: 1440, h: 1440 },
            { w: 1920, h: 1080 },
        ]) {
            const st = stage(size);
            const sp = spreadLayout(st);
            expect(60 * sp.s).toBeGreaterThanOrEqual(44 * st.u - 1e-9);
            expect(130 * sp.s).toBeGreaterThanOrEqual(96 * st.u - 1e-9);
            expect(sp.right.x + sp.right.w).toBeLessThanOrEqual(st.w);
        }
    });
});

describe("featureArt", () => {
    it("pictures each angle its own way, and a run without a tape as its number", () => {
        expect(featureArt("climb", 0)).toBe("makeover");
        expect(featureArt("streak", 8)).toBe("log");
        expect(featureArt("streak", 0)).toBe("number");
        expect(featureArt("nemesis", 0)).toBe("pair");
        expect(featureArt("explorer", 0)).toBe("cast");
        expect(featureArt("one_trick", 0)).toBe("number");
    });
});
