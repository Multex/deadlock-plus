import { describe, expect, it } from "vitest";
import type { Beat } from "../../beats";
import { say } from "./beats/stage";
import { beatAt, cutAt, cutInto, stageOf } from "./compose";
import type { YearEndAwards } from "./data";
import type { YearEndBeatId } from "./plan";

const BAR = 1.6;
const beat = (id: YearEndBeatId, bar: number, bars: number): Beat<YearEndBeatId> => ({
    id,
    kind: "year_end",
    bar,
    bars,
    presents: [],
});
const plan = [
    beat("y_preshow", 0, 5),
    beat("y_welcome", 5, 2),
    beat("y_hero", 7, 4),
    beat("y_villain", 11, 4),
    beat("y_month", 15, 4),
    beat("y_credits", 19, 4),
    beat("y_end", 23, 2),
];

describe("beatAt", () => {
    it("starts each beat at local 0 on its bar line", () => {
        expect(beatAt(plan, 0, BAR)).toMatchObject({ id: "y_preshow", index: 0, local: 0, span: 8 });
        expect(beatAt(plan, 7.99, BAR).id).toBe("y_preshow");
        expect(beatAt(plan, 8, BAR)).toMatchObject({ id: "y_welcome", index: 1, span: 3.2 });
        expect(beatAt(plan, 8, BAR).local).toBeCloseTo(0, 9);
        expect(beatAt(plan, 12, BAR).id).toBe("y_hero");
        expect(beatAt(plan, 12, BAR).local).toBeCloseTo(0.8, 9);
    });

    it("holds the end card's last frame past the plan", () => {
        const end = beatAt(plan, 99, BAR);
        expect(end.id).toBe("y_end");
        expect(end.local).toBeLessThan(end.span);
        expect(end.local).toBeGreaterThan(end.span - 0.05);
    });
});

describe("cutInto", () => {
    it("opens the show with a flash on the drop, then never cuts the same way twice in a row", () => {
        const cuts = plan.slice(1).map((_, i) => cutInto(plan, i + 1));
        expect(cuts[0]).toBe("flash");
        for (let i = 1; i < cuts.length; i++) expect(cuts[i]).not.toBe(cuts[i - 1]);
        expect(cuts.every((c) => c === "flash" || c === "curtain" || c === "iris")).toBe(true);
    });

    it("draws the curtain before the night's last award", () => {
        expect(cutInto(plan, 4)).toBe("curtain");
    });
});

describe("cutAt", () => {
    const b = BAR / 4;
    const cut = 7 * BAR;

    it("is closed on the bar line and open a beat either side", () => {
        expect(cutAt(plan, cut, BAR)).toMatchObject({ kind: "curtain", p: 1 });
        expect(cutAt(plan, cut - b - 0.01, BAR)).toBeNull();
        expect(cutAt(plan, cut + b + 0.01, BAR)).toBeNull();
        const closing = cutAt(plan, cut - b / 2, BAR)!;
        expect(closing.p).toBeGreaterThan(0);
        expect(closing.p).toBeLessThan(1);
        expect(closing.closing).toBe(true);
        expect(cutAt(plan, cut + b / 4, BAR)!.closing).toBe(false);
    });

    it("never cuts at the very start or past the end", () => {
        expect(cutAt(plan, 0, BAR)).toBeNull();
        expect(cutAt(plan, 25 * BAR + 0.1, BAR)).toBeNull();
    });
});

describe("stageOf", () => {
    const ref = (key: string, count?: number) => ({
        key,
        params: { year: "2026" },
        ...(count === undefined ? {} : { count }),
    });
    const night = {
        preshow: { marquee: ref("m"), hook: ref("h", 486), figures: [] },
        welcome: { line: ref("w") },
        awards: [
            {
                title: ref("a.title"),
                nominees: [{ line: ref("a.n", 3) }, { line: ref("a.n", 5) }],
                ceremony: { nominees: ref("c.n"), envelope: ref("c.e"), goesTo: ref("c.g") },
                accept: ref("a.accept", 3),
            },
        ],
        credits: { title: ref("cr"), rows: [{ text: ref("cr.matches", 486), names: [] }] },
        end: { cta: ref("cta"), url: "x" },
    } as unknown as YearEndAwards;

    it("translates every line the night says, counted ones through tn", () => {
        const stage = stageOf(night, {
            t: (key, params) => `${key}|${params?.year}`,
            tn: (key, count) => `${key}#${count}`,
        });
        expect(stage.awards).toBe(night);
        expect(Object.keys(stage.lines)).toHaveLength(13);
        expect(say(stage, night.preshow.hook)).toBe("h#486");
        expect(say(stage, night.awards[0]!.nominees[1]!.line)).toBe("a.n#5");
        expect(say(stage, night.awards[0]!.ceremony.goesTo)).toBe("c.g|2026");
        expect(say(stage, night.credits.rows[0]!.text)).toBe("cr.matches#486");
        expect(say(stage, night.end.cta)).toBe("cta|2026");
    });
});
