import { describe, expect, it } from "vitest";
import { PERSONA_HEROES, PERSONAS, personaEdition } from "@deadlock-plus/stats/dispatch/personas.fixture";
import { editionSignals } from "@deadlock-plus/stats/dispatch/signals";
import type { Ctx } from "../../../kit/types";
import { SCENE_FONTS, type SceneAssets } from "../../../scene";
import { collectorsVideoData, copyRefs } from "../data";
import { collectorsPlan } from "../plan";
import { deckLines, type BeatDraw, type Deck } from "./card";
import { CARD_DRAWS, EXIT_S, FLIP_S } from "./cards";
import { glintAt, draw as pack, packYaw } from "./pack";
import { draw as tear, tearTimes } from "./tear";

/** A 2D context that accepts every call and measures text at half its size per character. */
function stubCtx(): Ctx {
    const gradient = { addColorStop: () => undefined };
    let font = "10px x";
    const target: Record<string | symbol, unknown> = {
        createLinearGradient: () => gradient,
        createRadialGradient: () => gradient,
        measureText: (s: string) => ({ width: s.length * Number(/(\d+(\.\d+)?)px/.exec(font)?.[1] ?? 10) * 0.5 }),
    };
    return new Proxy(target, {
        get: (t, k) => (k in t ? t[k] : () => undefined),
        set: (t, k, v) => {
            if (k === "font") font = v as string;
            t[k] = v;
            return true;
        },
    }) as unknown as Ctx;
}

const BAR = (60 / 155) * 4;
const assets: SceneAssets = {
    view: {} as SceneAssets["view"],
    images: {},
    fonts: SCENE_FONTS,
    timing: { seconds: 26 * BAR, fps: 30, bars: 26, barSeconds: BAR },
};
const deps = {
    hero: (id: number) => PERSONA_HEROES[id] ?? `Hero ${id}`,
    badge: (b: number) => `Tier ${b}`,
    day: (s: number) => String(s),
    number: String,
    percent: (x: number) => `${Math.round(x * 100)}%`,
    season: "Season 1",
    serial: "239522",
    site: "deadlockplus.app",
};
const SIZES = [
    { w: 1080, h: 1920 },
    { w: 1440, h: 1440 },
    { w: 1920, h: 1080 },
];
const DRAWS: Record<string, BeatDraw> = { c_pack: pack, c_tear: tear, ...CARD_DRAWS };

describe("Pack Opening beats", () => {
    for (const p of PERSONAS) {
        const e = personaEdition(p, "collectors");
        const video = collectorsVideoData(e, editionSignals(e), deps);
        const deck: Deck = { video, lines: deckLines(copyRefs(video), (r) => `${r.key} ${JSON.stringify(r.params)}`) };
        const beats = collectorsPlan(video.casting, 26).filter((b) => b.id in DRAWS);
        it(`${p}: every beat draws at five moments in every aspect`, () => {
            expect(beats.length).toBeGreaterThanOrEqual(6);
            for (const b of beats) {
                const span = b.bars * BAR;
                for (const size of SIZES) {
                    for (const local of [0, 0.2, span * 0.4, span * 0.75, span - 0.01]) {
                        expect(() => DRAWS[b.id](stubCtx(), local, span, size, deck, assets)).not.toThrow();
                    }
                }
            }
        });
    }
});

describe("pack timing", () => {
    it("comes square to the camera by the end of its beat, ready for the tear", () => {
        expect(Math.abs(packYaw(0, 3))).toBeGreaterThan(0.1);
        expect(packYaw(3, 3)).toBeCloseTo(0, 6);
    });

    it("glints from every bar line for a moment, and not between", () => {
        expect(glintAt(0, 1.5)).toBe(0);
        expect(glintAt(1.5, 1.5)).toBeCloseTo(0, 9);
        expect(glintAt(1.7, 1.5)).toBeGreaterThan(0);
        expect(glintAt(1.0, 1.5)).toBe(-1);
    });
});

describe("tearTimes", () => {
    it("lets every card out before the fan gathers, and settles the stack inside the beat", () => {
        for (const span of [BAR, 2 * BAR]) {
            for (const n of [3, 5, 7]) {
                const t = tearTimes(span, n);
                expect(t.rise(n - 1) + 0.34).toBeLessThanOrEqual(t.gather + 1e-9);
                expect(t.gather).toBeLessThan(t.settled);
                expect(t.settled).toBeLessThanOrEqual(span);
            }
        }
    });
});

describe("card beat timing", () => {
    it("flips and leaves within a three-bar card with time to read the face", () => {
        expect(3 * BAR - FLIP_S - EXIT_S).toBeGreaterThan(3);
    });
});
