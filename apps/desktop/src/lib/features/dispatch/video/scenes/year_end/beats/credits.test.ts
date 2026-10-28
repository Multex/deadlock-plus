import { describe, expect, it } from "vitest";
import { PERSONA_HEROES, PERSONAS, personaEdition } from "@deadlock-plus/stats/dispatch/personas.fixture";
import { sceneFrame } from "../../../kit/frame";
import { SCENE_FONTS, type SceneAssets } from "../../../scene";
import { yearEndAwards, type AwardsDeps } from "../data";
import { awardsPlan } from "../plan";
import { ROLL_CAP, draw, pickRows } from "./credits";
import { lineId, type Stage } from "./stage";

const deps: AwardsDeps = {
    hero: (id) => PERSONA_HEROES[id],
    number: (n) => n.toLocaleString("en-US"),
    percent: (s) => `${Math.round(s * 100)}%`,
    day: () => "Oct 4",
    monthName: () => "October",
};

function stageOf(persona: (typeof PERSONAS)[number]): Stage {
    const awards = yearEndAwards(personaEdition(persona, "year_end"), deps);
    const lines: Record<string, string> = {};
    lines[lineId(awards.credits.title)] = "Roll the credits";
    for (const r of awards.credits.rows) {
        const slot = r.text.key.split(".").pop()!.replace(/_\d+$/, "");
        lines[lineId(r.text)] = r.text.count === undefined ? slot : `${deps.number(r.text.count)} ${slot}`;
    }
    return { awards, lines };
}

/** A 2D context that keeps where every string is drawn. */
function recorder(drawn: { text: string; y: number }[]) {
    let font = "10px x";
    const gradient = { addColorStop: () => {} };
    const target: Record<string | symbol, unknown> = {
        measureText: (s: string) => ({ width: s.length * Number(/(\d+(?:\.\d+)?)px/.exec(font)![1]) * 0.55 }),
        createLinearGradient: () => gradient,
        createRadialGradient: () => gradient,
        fillText: (s: string, _x: number, y: number) => drawn.push({ text: s, y }),
    };
    return new Proxy(target, {
        get: (t, k) => (k in t ? t[k] : k === "font" ? font : () => undefined),
        set: (t, k, v) => {
            if (k === "font") font = v;
            else t[k] = v;
            return true;
        },
    });
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

describe("the credit roll", () => {
    for (const persona of PERSONAS) {
        const stage = stageOf(persona);
        const span = awardsPlan(29, stage.awards.lineup).find((b) => b.id === "y_credits")!.bars * BAR;
        for (const size of SIZES) {
            it(`rolls ${persona} up at one gentle speed from first frame to last in ${size.w}x${size.h}`, () => {
                const { u } = sceneFrame(size.w, size.h);
                const dt = 1 / 30;
                const frames: { text: string; y: number }[][] = [];
                for (let t = 0; t < span; t += dt) {
                    const drawn: { text: string; y: number }[] = [];
                    draw(recorder(drawn) as never, t, span, size, stage, assets);
                    frames.push(drawn);
                }
                // "starring" is the first billing, on screen from frame 0; its label's height on the frame is the roll.
                const ys = frames.map((d) => d.find((x) => x.text === "STARRING")?.y);
                const seen = ys.filter((y): y is number => y !== undefined);
                expect(seen.length).toBeGreaterThan(30);
                const steps = ys
                    .slice(1)
                    .flatMap((y, i) => (y === undefined || ys[i] === undefined ? [] : [ys[i]! - y]));
                const speed = steps[0]! / dt;
                expect(speed).toBeGreaterThan(20 * u);
                expect(speed).toBeLessThanOrEqual(ROLL_CAP * u);
                for (const s of steps) expect(s / dt).toBeCloseTo(speed, 6);
            });
        }
    }
});

describe("pickRows", () => {
    it("keeps the top billings that fit, in billing order", () => {
        // Heights 100 each, gaps 50: the third row starts 300 down, a fourth would start 450 down.
        const rows = pickRows([100, 100, 100, 100], [3, 0, 2, 1], 400, 50);
        expect(rows).toEqual([1, 2, 3]);
    });

    it("always keeps the first billing, even when it alone is too tall", () => {
        expect(pickRows([900, 100], [0, 1], 400, 50)).toEqual([0]);
    });
});
