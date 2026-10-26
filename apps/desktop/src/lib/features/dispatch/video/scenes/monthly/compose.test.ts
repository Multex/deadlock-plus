import { describe, expect, it } from "vitest";
import { PERSONA_HEROES, PERSONAS, personaEdition } from "@deadlock-plus/stats/dispatch/personas.fixture";
import { monthPalette } from "../../../kinds/monthly/palette";
import type { Beat } from "../../beats";
import type { SceneAssets } from "../../scene";
import { beatAt, monthlyScene } from "../monthly";
import { monthlyLines, type MonthlyDraw } from "./beats/studio";
import { monthlyVideoData, type MonthlyVideoDeps } from "./data";

const BAR = 240 / 155;

const beat = (id: string, bar: number, bars: number): Beat => ({ id, kind: "monthly", bar, bars, presents: [] });
const PLAN = [beat("a", 0, 2), beat("b", 2, 3), beat("c", 5, 1)];

describe("beatAt", () => {
    it("finds the beat a time falls in, with the time into it and its length", () => {
        const at = beatAt(PLAN, 2.5 * BAR, BAR)!;
        expect(at.index).toBe(1);
        expect(at.local).toBeCloseTo(0.5 * BAR, 9);
        expect(at.span).toBeCloseTo(3 * BAR, 9);
    });
    it("starts a beat exactly on its bar line", () => {
        expect(beatAt(PLAN, 2 * BAR, BAR)!.index).toBe(1);
    });
    it("holds the last beat past the end and the first before the start", () => {
        expect(beatAt(PLAN, 99, BAR)!.index).toBe(2);
        expect(beatAt(PLAN, -1, BAR)!.index).toBe(0);
    });
    it("is null without beats", () => {
        expect(beatAt([], 1, BAR)).toBeNull();
    });
});

const deps: MonthlyVideoDeps = {
    hero: (id) => PERSONA_HEROES[id] ?? `Hero ${id}`,
    rank: (badge) => `Rank ${badge}`,
    number: (n) => String(n),
    percent: (v) => `${Math.round(v * 100)}%`,
    date: (s, tz, options) => new Intl.DateTimeFormat("en-GB", { ...options, timeZone: tz }).format(s * 1000),
    duration: (s) => `${Math.round(s / 3600)} hours`,
};

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

describe("monthlyScene", () => {
    for (const persona of PERSONAS) {
        it(`${persona} draws every frame time in every aspect`, () => {
            const video = monthlyVideoData(personaEdition(persona, "monthly"), deps, null);
            const data: MonthlyDraw = {
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
                data,
            };
            for (const size of [
                { w: 1080, h: 1920 },
                { w: 1440, h: 1440 },
                { w: 1920, h: 1080 },
            ])
                for (let t = 0; t < 26 * BAR; t += BAR / 3)
                    expect(() => monthlyScene(stubCtx() as never, t, size, assets)).not.toThrow();
        });
    }
});
