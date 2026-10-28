import { describe, expect, it } from "vitest";
import { PERSONA_HEROES, PERSONAS, personaEdition } from "@deadlock-plus/stats/dispatch/personas.fixture";
import type { Ctx } from "../../../kit/types";
import { SCENE_FONTS, type SceneAssets } from "../../../scene";
import { yearEndAwards, type AwardsDeps, type CopyRef, type YearEndAwards } from "../data";
import { awardsPlan } from "../plan";
import * as credits from "./credits";
import * as end from "./end";
import * as preshow from "./preshow";
import { layoutRich, lineId, type Stage } from "./stage";
import * as welcome from "./welcome";

const deps: AwardsDeps = {
    hero: (id) => PERSONA_HEROES[id],
    number: (n) => n.toLocaleString("en-US"),
    percent: (s) => `${Math.round(s * 100)}%`,
    day: () => "Oct 4",
    monthName: () => "October",
};

function refs(v: YearEndAwards): CopyRef[] {
    return [
        v.preshow.marquee,
        ...(v.preshow.hook ? [v.preshow.hook] : []),
        v.welcome.line,
        v.credits.title,
        ...v.credits.rows.map((r) => r.text),
        v.end.cta,
    ];
}

/** Each line reads its key, with the count up front, so the number-finding paths run. */
function stageOf(persona: (typeof PERSONAS)[number]): Stage {
    const awards = yearEndAwards(personaEdition(persona, "year_end"), deps);
    const lines: Record<string, string> = {};
    for (const r of refs(awards)) {
        const words = r.key.split(".").pop()!.replace(/_/g, " ");
        lines[lineId(r)] =
            r.count === undefined
                ? `${words} ${Object.values(r.params).join(" ")}`
                : `${deps.number(r.count)} ${words}`;
    }
    return { awards, lines };
}

/** A 2D context that keeps nothing but the size of every line of text drawn. */
function stubCtx(texts: { text: string; px: number }[]): Ctx {
    let font = "10px x";
    const gradient = { addColorStop() {} };
    const target: Record<string, unknown> = {
        measureText: (s: string) => ({ width: s.length * Number(/(\d+(?:\.\d+)?)px/.exec(font)![1]) * 0.55 }),
        createLinearGradient: () => gradient,
        createRadialGradient: () => gradient,
        fillText: (s: string) => {
            if (s.trim()) texts.push({ text: s, px: Number(/(\d+(?:\.\d+)?)px/.exec(font)![1]) });
        },
    };
    return new Proxy(target, {
        get: (t, k: string) => (k in t ? t[k] : k === "font" ? font : () => undefined),
        set: (t, k: string, v) => {
            if (k === "font") font = v;
            else t[k] = v;
            return true;
        },
    }) as unknown as Ctx;
}

const SIZES = [
    { w: 1080, h: 1920 },
    { w: 1440, h: 1440 },
    { w: 1920, h: 1080 },
];
const BAR = (60 / 172) * 4;
const assets = {
    view: {},
    images: {},
    fonts: SCENE_FONTS,
    timing: { seconds: 41, fps: 30, bars: 29, barSeconds: BAR },
} as unknown as SceneAssets;
const BEATS = { y_preshow: preshow, y_welcome: welcome, y_credits: credits, y_end: end } as const;

describe("Awards Night frame beats", () => {
    for (const persona of PERSONAS) {
        const stage = stageOf(persona);
        const plan = awardsPlan(29, stage.awards.lineup);
        for (const [id, beat] of Object.entries(BEATS)) {
            const span = plan.find((b) => b.id === id)!.bars * BAR;
            it(`${id} draws for ${persona} in every aspect, never below 44 px at 1080`, () => {
                for (const size of SIZES) {
                    const u = Math.min(size.w, size.h) / 1080;
                    for (const t of [0, span * 0.25, span * 0.5, span * 0.75, span - 1 / 30]) {
                        const texts: { text: string; px: number }[] = [];
                        beat.draw(stubCtx(texts), t, span, size, stage, assets);
                        expect(texts.length).toBeGreaterThan(0);
                        for (const x of texts) expect(x.px / u, x.text).toBeGreaterThanOrEqual(44 - 1e-6);
                    }
                }
            });
        }
    }

    it("puts the year's match count on the pre-show's first frame", () => {
        const stage = stageOf("P1");
        const texts: { text: string; px: number }[] = [];
        preshow.draw(stubCtx(texts), 0, 7, { w: 1080, h: 1920 }, stage, assets);
        const count = String(stage.awards.preshow.figures[0].value);
        expect(texts.some((x) => x.text === count && x.px >= 96)).toBe(true);
    });
});

describe("shimmer", () => {
    it("lights the number's own letters on a cue, never the box round them", () => {
        const calls: string[] = [];
        let op = "source-over";
        const gradient = { addColorStop() {} };
        const ctx = new Proxy({} as Record<string, unknown>, {
            get: (t, k: string) => {
                if (k in t) return t[k];
                if (k === "createLinearGradient" || k === "createRadialGradient") return () => gradient;
                if (k === "measureText") return (s: string) => ({ width: s.length * 50 });
                if (k === "globalCompositeOperation") return op;
                return (...args: unknown[]) => calls.push(`${op}:${k}:${typeof args[0] === "string" ? args[0] : ""}`);
            },
            set: (t, k: string, v) => {
                if (k === "globalCompositeOperation") op = v;
                else t[k] = v;
                return true;
            },
        }) as unknown as Ctx;
        const lines = layoutRich([{ text: "158", px: 236, tag: "num" }], 1000, (s, px) => s.length * px * 0.5);
        const look = () => ({ family: "Retail Demo", weight: 700, fill: "#fff" });
        preshow.shimmer(ctx, lines, 540, 600, BAR + 0.1, BAR, 3, 1, look);
        const lit = calls.filter((c) => c.startsWith("lighter:"));
        expect(lit).toContain("lighter:fillText:158");
        expect(lit.some((c) => /fillRect|fill:|clip/.test(c))).toBe(false);
    });
});

describe("wordCue", () => {
    it("spreads the marquee's words over the bar cues, first on the first", () => {
        expect([0, 1, 2, 3].map((i) => preshow.wordCue(i, 4, 4))).toEqual([0, 1, 2, 3]);
        expect([0, 1, 2].map((i) => preshow.wordCue(i, 3, 4))).toEqual([0, 1, 2]);
        expect([0, 1, 2, 3, 4, 5].map((i) => preshow.wordCue(i, 6, 2))).toEqual([0, 0, 0, 1, 1, 1]);
    });
});

describe("nameRuns", () => {
    it("tags the player's name and keeps the words round it", () => {
        expect(welcome.nameRuns("Welcome, Moth. Sit.", "Moth", 100).map((r) => [r.text, r.tag ?? null])).toEqual([
            ["Welcome, ", null],
            ["Moth", "name"],
            [". Sit.", null],
        ]);
        expect(welcome.nameRuns("Lights up.", null, 100)).toEqual([{ text: "Lights up.", px: 100 }]);
    });
});
