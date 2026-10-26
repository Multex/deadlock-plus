import { describe, expect, it } from "vitest";
import { PERSONA_HEROES, PERSONAS, personaEdition } from "@deadlock-plus/stats/dispatch/personas.fixture";
import type { SceneAssets } from "../../../scene";
import { yearEndAwards, type AwardsDeps, type CopyRef, type YearEndAwards } from "../data";
import { AWARDS } from "../plan";
import { AWARD_BEATS, awardImages } from "./award";
import { lineId, type Stage } from "./stage";

const deps: AwardsDeps = {
    hero: (id) => PERSONA_HEROES[id],
    number: (n) => String(n),
    percent: (s) => `${Math.round(s * 100)}%`,
    day: (s) => new Date(s * 1000).toISOString().slice(0, 10),
    monthName: (s) => new Date(s * 1000).toISOString().slice(0, 7),
};

function refs(night: YearEndAwards): CopyRef[] {
    return night.awards.flatMap((a) => [
        a.title,
        a.accept,
        a.ceremony.nominees,
        a.ceremony.envelope,
        a.ceremony.goesTo,
        ...a.nominees.map((n) => n.line),
    ]);
}

function stageOf(persona: (typeof PERSONAS)[number]): Stage {
    const awards = yearEndAwards(personaEdition(persona, "year_end"), deps);
    const lines = Object.fromEntries(refs(awards).map((r) => [lineId(r), `${r.key} with some words ${r.count ?? ""}`]));
    return { awards, lines };
}

/** A 2D context that accepts every call and measures text by its length. */
function stubContext() {
    const gradient = { addColorStop: () => {} };
    const target: Record<string | symbol, unknown> = {
        measureText: (s: string) => ({ width: s.length * 24 }),
        createLinearGradient: () => gradient,
        createRadialGradient: () => gradient,
        calls: 0,
    };
    return new Proxy(target, {
        get(t, key) {
            if (key in t) return t[key];
            return () => {
                (t.calls as number)++;
            };
        },
        set(t, key, value) {
            t[key] = value;
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

function assets(): SceneAssets {
    return {
        view: {} as SceneAssets["view"],
        images: {},
        fonts: { display: "Retail Demo", body: "Valve Oracle", pulp: "Valve Pulp" },
        timing: { seconds: 40, fps: 30, bars: 29, barSeconds: BAR },
    };
}

describe("award beats", () => {
    for (const persona of PERSONAS) {
        const stage = stageOf(persona);
        it(`${persona}: every award of the night draws in every aspect without throwing`, () => {
            expect(stage.awards.awards.length).toBeGreaterThan(0);
            for (const award of stage.awards.awards) {
                for (const size of SIZES) {
                    for (const bars of [3, 4, 6]) {
                        const span = bars * BAR;
                        for (const k of [0, 0.2, 0.45, 0.6, 0.95]) {
                            const ctx = stubContext();
                            AWARD_BEATS[award.id](ctx as never, k * span, span, size, stage, assets());
                            expect(ctx.calls as number).toBeGreaterThan(20);
                        }
                    }
                }
            }
        });
    }

    it("has a drawing for every award the plan can hand out", () => {
        for (const id of AWARDS) expect(typeof AWARD_BEATS[id]).toBe("function");
    });

    it("draws an award the night does not hold as an empty room", () => {
        const stage = stageOf("P1");
        const missing = AWARDS.find((id) => !stage.awards.awards.some((a) => a.id === id))!;
        const ctx = stubContext();
        AWARD_BEATS[missing](ctx as never, 1, 4 * BAR, SIZES[0]!, stage, assets());
        expect(ctx.calls as number).toBeGreaterThan(0);
    });
});

describe("awardImages", () => {
    it("asks for the winner smug and the other nominees beaten, by hero", () => {
        const stage = stageOf("P1");
        const keys = awardImages(stage.awards).map((i) => i.key);
        const heroAward = stage.awards.awards.find((a) => a.id === "y_hero")!;
        const [win, ...rest] = heroAward.nominees;
        expect(keys).toContain(`mood:${win!.heroId}:gloat`);
        expect(keys).toContain(`hero:${win!.heroId}`);
        for (const n of rest) expect(keys).toContain(`mood:${n.heroId}:critical`);
        expect(new Set(keys).size).toBe(keys.length);
    });
});
