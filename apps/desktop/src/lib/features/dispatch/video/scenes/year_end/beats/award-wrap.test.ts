import { describe, expect, it } from "vitest";
import { PERSONA_HEROES, personaEdition } from "@deadlock-plus/stats/dispatch/personas.fixture";
import type { SceneAssets } from "../../../scene";
import { yearEndAwards, type AwardsDeps, type CopyRef } from "../data";
import { AWARD_BEATS } from "./award";
import { lineId, type Stage } from "./stage";

const deps: AwardsDeps = {
    hero: (id) => PERSONA_HEROES[id],
    number: (n) => String(n),
    percent: (s) => `${Math.round(s * 100)}%`,
    day: () => "Sun, Jun 14",
    monthName: () => "August",
};

const TITLES = ["Hottest Run of 2026", "The 2026 Comeback Award", "Best Supporting Role, 2026"];

function stageWith(title: string): Stage {
    const awards = yearEndAwards(personaEdition("P1", "year_end"), deps);
    const lines: Record<string, string> = {};
    const put = (r: CopyRef | null, text: string) => r && (lines[lineId(r)] = text);
    for (const a of awards.awards) {
        put(a.title, title);
        put(a.accept, "Encore! Infernus went 14/1/20 on Sun, Jun 14, and nobody saw it coming.");
        put(a.ceremony.nominees, "The nominees are...");
        put(a.ceremony.envelope, "The envelope, please.");
        put(a.ceremony.goesTo, "And the award goes to...");
        for (const n of a.nominees) {
            put(n.line, "16 games together");
        }
    }
    return { awards, lines };
}

/** A 2D context that measures text by its length and keeps every string drawn, in order. */
function recorder(drawn: string[]) {
    let font = "10px x";
    const gradient = { addColorStop: () => {} };
    const target: Record<string | symbol, unknown> = {
        measureText: (s: string) => ({ width: s.length * Number(/(\d+(?:\.\d+)?)px/.exec(font)![1]) * 0.55 }),
        createLinearGradient: () => gradient,
        createRadialGradient: () => gradient,
        fillText: (s: string) => drawn.push(s),
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
const assets: SceneAssets = {
    view: {} as SceneAssets["view"],
    images: {},
    fonts: { display: "Retail Demo", body: "Valve Oracle", pulp: "Valve Pulp" },
    timing: { seconds: 40, fps: 30, bars: 29, barSeconds: BAR },
};

/** The lines of `text` drawn this frame, in order: every drawn string that is a run of its words. */
function linesOf(drawn: string[], text: string): string[] {
    return drawn.filter((s) => s.trim() && ` ${text} `.includes(` ${s} `));
}

describe("award beat wrapping", () => {
    for (const title of TITLES) {
        const stage = stageWith(title);
        for (const award of stage.awards.awards) {
            it(`breaks "${title}" the same way on every frame of ${award.id}`, () => {
                for (const size of SIZES) {
                    for (const bars of [3, 4]) {
                        const span = bars * BAR;
                        const header = title.toLocaleUpperCase();
                        const seen = new Set<string>();
                        for (let t = 0; t < span; t += 1 / 30) {
                            const drawn: string[] = [];
                            AWARD_BEATS[award.id](recorder(drawn) as never, t, span, size, stage, assets);
                            seen.add(linesOf(drawn, header).join(" / "));
                        }
                        expect([...seen], `${size.w}x${size.h}, ${bars} bars`).toHaveLength(1);
                    }
                }
            });
        }
    }
});
