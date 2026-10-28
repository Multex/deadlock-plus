import { describe, expect, it } from "vitest";
import { PERSONA_HEROES, PERSONAS, personaEdition } from "@deadlock-plus/stats/dispatch/personas.fixture";
import { monthPalette } from "../../../../kinds/monthly/palette";
import type { SceneAssets } from "../../../scene";
import { monthlyVideoData, type MonthlyVideoDeps, type TakeFrame } from "../data";
import { monthlyPlan } from "../plan";
import { draw as cover } from "./cover";
import { draw as end } from "./end";
import { draw as feature } from "./feature";
import { draw as flash } from "./flash";
import { draw as interview } from "./interview";
import { draw as stand } from "./stand";
import { draw as wardrobe } from "./wardrobe";
import { draw as shot, shotTimes } from "./shot";
import { monthlyLines, type BeatDraw, type MonthlyDraw } from "./studio";
import { blankRun, draw as takes, takesTimes } from "./takes";

const deps: MonthlyVideoDeps = {
    hero: (id) => PERSONA_HEROES[id] ?? `Hero ${id}`,
    rank: (badge) => `Rank ${badge}`,
    number: (n) => String(n),
    percent: (v) => `${Math.round(v * 100)}%`,
    date: (s, tz, options) => new Intl.DateTimeFormat("en-GB", { ...options, timeZone: tz }).format(s * 1000),
    duration: (s) => `${Math.round(s / 3600)} hours`,
};

/** A 2D context that accepts every call and measures text at half an em a glyph. */
function stubCtx(): CanvasRenderingContext2D {
    let px = 10;
    const gradient = { addColorStop: () => {} };
    const target: Record<string, unknown> = {};
    return new Proxy(target, {
        get(t, k) {
            if (k === "measureText") return (s: string) => ({ width: s.length * px * 0.5 });
            if (k === "createLinearGradient" || k === "createRadialGradient") return () => gradient;
            if (k === "createPattern") return () => null;
            if (k in t) return t[k as string];
            return () => {};
        },
        set(t, k, v) {
            if (k === "font") px = Number(/(\d+(?:\.\d+)?)px/.exec(String(v))?.[1] ?? px);
            t[k as string] = v;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
}

const BAR = 240 / 155;
const SIZES = [
    { w: 1080, h: 1920 },
    { w: 1440, h: 1440 },
    { w: 1920, h: 1080 },
];
const BEATS: Record<string, BeatDraw> = {
    m_flash: flash,
    m_takes: takes,
    m_shot: shot,
    m_wardrobe: wardrobe,
    m_interview: interview,
    m_feature: feature,
    m_cover: cover,
    m_stand: stand,
    m_end: end,
};

describe("Monthly beats draw", () => {
    for (const persona of PERSONAS) {
        const e = personaEdition(persona, "monthly");
        const video = monthlyVideoData(e, deps, null);
        const d: MonthlyDraw = {
            video,
            palette: monthPalette(10),
            lines: monthlyLines(video, (c) => c.key, deps.number),
            locale: "en-GB",
        };
        const assets: SceneAssets = {
            view: {} as SceneAssets["view"],
            images: {},
            fonts: { display: "Retail Demo", body: "Valve Oracle", pulp: "Valve Pulp" },
            timing: { seconds: 26 * BAR, fps: 30, bars: 26, barSeconds: BAR },
        };
        for (const beat of monthlyPlan(video.cast, 26).filter((b) => b.id in BEATS)) {
            it(`${persona} ${beat.id} draws in every aspect at five times`, () => {
                const span = beat.bars * BAR;
                for (const size of SIZES)
                    for (const t of [0, span * 0.2, span * 0.45, span * 0.7, span - 0.01])
                        expect(() => BEATS[beat.id]!(stubCtx() as never, t, span, size, d, assets)).not.toThrow();
            });
        }
    }
});

describe("takes timing", () => {
    it("slides the sheet in, develops every frame, then lands the loupe on the bar line", () => {
        const t = takesTimes(BAR, 2 * BAR, 30);
        expect(t.land).toBeCloseTo(BAR, 9);
        expect(t.develop(29) + t.developFor).toBeLessThan(t.land);
        expect(t.loupeFrom).toBeGreaterThan(t.slide * 0.5);
        expect(t.loupeFrom).toBeLessThan(t.land);
    });
});

describe("blankRun", () => {
    const frame = (matches: number, day: number): TakeFrame => ({ day, matches, wins: 0, heroId: null });
    it("finds the longest gap between two played days, not the empty edges of the month", () => {
        const frames = [0, 0, 2, 0, 0, 1, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0].map((m, i) => frame(m, i + 1));
        expect(blankRun(frames)).toEqual([6, 9]);
        expect(blankRun([0, 0, 0, 0, 0, 2, 0, 1, 0, 0, 0].map((m, i) => frame(m, i + 1)))).toEqual([6, 6]);
    });
    it("is null without a gap", () => {
        expect(blankRun([1, 2, 1].map((m, i) => frame(m, i + 1)))).toBeNull();
    });
});

describe("shot timing", () => {
    it("fires the shutter on the second bar line, as the sound cue does, and lands the rest after it in order", () => {
        const t = shotTimes(BAR, 3 * BAR);
        expect(t.shutter).toBeCloseTo(BAR, 9);
        expect(t.travel[1]).toBeLessThan(t.pencil[1]);
        expect(t.pencil[1]).toBeLessThan(t.shutter);
        const order = [t.shutter, t.pull[0], t.kda, t.worth, t.caption];
        expect([...order].sort((a, b) => a - b)).toEqual(order);
        expect(t.caption).toBeLessThan(3 * BAR * 0.85);
    });
});
