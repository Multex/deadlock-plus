import { describe, expect, it } from "vitest";
import { PERSONA_HEROES, PERSONAS, personaEdition } from "@deadlock-plus/stats/dispatch/personas.fixture";
import { monthPalette } from "../../../../kinds/monthly/palette";
import type { Rect } from "../../../kit/types";
import type { SceneAssets } from "../../../scene";
import { monthlyVideoData, type MonthlyVideoDeps } from "../data";
import { monthlyPlan } from "../plan";
import { draw as feature, PAGED } from "./feature";
import { draw as interview } from "./interview";
import { capWidth, PAGE_H, PAGE_W, spreadLayout } from "./print";
import { draw as shot, shotTimes } from "./shot";
import { monthlyLines, stage, type BeatDraw, type MonthlyDraw } from "./studio";
import { draw as wardrobe } from "./wardrobe";

const deps: MonthlyVideoDeps = {
    hero: (id) => PERSONA_HEROES[id] ?? `Hero ${id}`,
    rank: (badge) => `Rank ${badge}`,
    number: (n) => String(n),
    percent: (v) => `${Math.round(v * 100)}%`,
    date: (s, tz, options) => new Intl.DateTimeFormat("en-GB", { ...options, timeZone: tz }).format(s * 1000),
    duration: (s) => `${Math.round(s / 3600)} hours`,
};

type M = [number, number, number, number, number, number];
const mul = ([a, b, c, d, e, f]: M, [A, B, C, D, E, F]: M): M => [
    a * A + c * B,
    b * A + d * B,
    a * C + c * D,
    b * C + d * D,
    a * E + c * F + e,
    b * E + d * F + f,
];

/**
 * A 2D context that tracks its transform and records, in screen pixels, every sheet a page is printed on: the
 * `rect(0, 0, PAGE_W, PAGE_H)` each page clips to.
 */
function pageRecorder(): { ctx: CanvasRenderingContext2D; pages: Rect[] } {
    let px = 10;
    let m: M = [1, 0, 0, 1, 0, 0];
    const stack: M[] = [];
    const pages: Rect[] = [];
    const gradient = { addColorStop: () => {} };
    const calls: Record<string, (...a: number[]) => unknown> = {
        save: () => void stack.push(m),
        restore: () => void (m = stack.pop() ?? m),
        translate: (x, y) => void (m = mul(m, [1, 0, 0, 1, x, y])),
        scale: (x, y) => void (m = mul(m, [x, 0, 0, y, 0, 0])),
        rotate: (a) => void (m = mul(m, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0])),
        setTransform: (a, b, c, d, e, f) => void (m = [a, b, c, d, e, f]),
        resetTransform: () => void (m = [1, 0, 0, 1, 0, 0]),
        rect: (x, y, w, h) => {
            if (x !== 0 || y !== 0 || w !== PAGE_W || h !== PAGE_H) return;
            expect(Math.abs(m[1]) + Math.abs(m[2])).toBeLessThan(1e-9);
            pages.push({ x: m[4], y: m[5], w: m[0] * PAGE_W, h: m[3] * PAGE_H });
        },
        measureText: ((s: string) => ({ width: String(s).length * px * 0.5 })) as never,
        createLinearGradient: () => gradient,
        createRadialGradient: () => gradient,
        createPattern: () => null,
    };
    const target: Record<string, unknown> = {};
    const ctx = new Proxy(target, {
        get(t, k) {
            if (typeof k === "string" && k in calls) return calls[k];
            if (k in t) return t[k as string];
            return () => {};
        },
        set(t, k, v) {
            if (k === "font") px = Number(/(\d+(?:\.\d+)?)px/.exec(String(v))?.[1] ?? px);
            t[k as string] = v;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
    return { ctx, pages };
}

const BAR = 240 / 155;
const FPS = 30;
const SIZES = [
    { w: 1080, h: 1920 },
    { w: 1440, h: 1440 },
    { w: 1920, h: 1080 },
];
const BEATS: Record<string, BeatDraw> = {
    m_shot: shot,
    m_wardrobe: wardrobe,
    m_interview: interview,
    m_feature: feature,
};

const close = (a: Rect, b: Rect) =>
    Math.abs(a.x - b.x) < 1e-6 &&
    Math.abs(a.y - b.y) < 1e-6 &&
    Math.abs(a.w - b.w) < 1e-6 &&
    Math.abs(a.h - b.h) < 1e-6;

describe("the magazine page", () => {
    for (const persona of PERSONAS) {
        const video = monthlyVideoData(personaEdition(persona, "monthly"), deps, null);
        const d: MonthlyDraw = {
            video,
            palette: monthPalette(10),
            lines: monthlyLines(video, (c) => `${c.key} ${JSON.stringify(c.params ?? {})}`.repeat(2), deps.number),
            locale: "en-GB",
        };
        const assets: SceneAssets = {
            view: {} as SceneAssets["view"],
            images: {},
            fonts: { display: "Retail Demo", body: "Valve Oracle", pulp: "Valve Pulp" },
            timing: { seconds: 26 * BAR, fps: FPS, bars: 26, barSeconds: BAR },
        };
        const beats = monthlyPlan(video.cast, 26).filter((b) => PAGED.has(b.id));
        for (const size of SIZES)
            it(`${persona} ${size.w}x${size.h}: sits in one place at one size on every frame of every page`, () => {
                const sp = spreadLayout(stage(size));
                let frames = 0;
                for (const beat of beats) {
                    const span = beat.bars * BAR;
                    // The shot opens on the photograph full frame and pulls back to its page; from there it is at rest.
                    const from = beat.id === "m_shot" ? shotTimes(BAR, span).pull[1] : 0;
                    for (let t = from; t < span; t += 1 / FPS) {
                        const { ctx, pages } = pageRecorder();
                        BEATS[beat.id]!(ctx as never, t, span, size, d, assets);
                        expect(
                            pages.some((p) => close(p, sp.right)),
                            `${beat.id} at ${t.toFixed(3)}`,
                        ).toBe(true);
                        for (const p of pages)
                            expect(close(p, sp.right) || close(p, sp.left), `${beat.id} at ${t.toFixed(3)}`).toBe(true);
                        frames++;
                    }
                }
                expect(frames).toBeGreaterThan(60);
            });
    }
});

describe("capWidth", () => {
    it("measures the letter's ink, not its advance, so the text sits the same gap from every capital", () => {
        const ink = (right: number) =>
            ({
                font: "",
                measureText: () => ({ width: 200, actualBoundingBoxLeft: 0, actualBoundingBoxRight: right }),
            }) as unknown as CanvasRenderingContext2D;
        const lineH = 100;
        const wide = capWidth(ink(180) as never, "W", lineH, "serif");
        const narrow = capWidth(ink(90) as never, "I", lineH, "serif");
        expect(wide - 180).toBeCloseTo(narrow - 90, 9);
        expect(wide - 180).toBeLessThanOrEqual(lineH * 0.15);
        expect(wide).toBeLessThan(200);
    });
});
