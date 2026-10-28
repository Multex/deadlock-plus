import { readFileSync } from "node:fs";
import { delimiter } from "node:path";
import { describe, expect, it } from "vitest";
import { interpolate } from "$lib/core/i18n.svelte";
import en from "../../../../../../../../../locales/dispatch/en.json";
import { PERSONA_HEROES, PERSONAS, personaEdition } from "@deadlock-plus/stats/dispatch/personas.fixture";
import { editionSignals } from "@deadlock-plus/stats/dispatch/signals";
import type { Edition } from "@deadlock-plus/stats/dispatch/types";
import { VIDEO_VARIANTS } from "../../beats";
import {
    collectorsSfx,
    collectorsVideoData,
    copyRefs,
    LINE_SHAPES,
    lineShape,
    type LineShape,
    slotKeys,
    type CollectorsVideoData,
    type CollectorsVideoDeps,
    type CopyRef,
} from "./data";
import { castCards, chaseFlipBar, collectorsPlan } from "./plan";

type Catalog = Record<string, string>;

function flatten(node: object, prefix = "", out: Catalog = {}): Catalog {
    for (const [name, value] of Object.entries(node)) {
        const key = prefix ? `${prefix}.${name}` : name;
        if (typeof value === "string") out[key] = value;
        else flatten(value as object, key, out);
    }
    return out;
}

/** `DISPATCH_COPY_LINES` overlays files of `key: "text"` lines, to check copy before it is merged into en.json. */
const CATALOG = flatten(en);
for (const file of (process.env.DISPATCH_COPY_LINES ?? "").split(delimiter).filter(Boolean)) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        const m = /^([\w.]+): (".*")$/.exec(line);
        if (m) CATALOG[m[1]] = JSON.parse(m[2]) as string;
    }
}

const deps: CollectorsVideoDeps = {
    hero: (id) => PERSONA_HEROES[id] ?? `Hero ${id}`,
    badge: (b) => `Tier${Math.floor(b / 10)} ${b % 10}`,
    day: (s) => new Date(s * 1000).toISOString().slice(0, 10),
    number: (n) => String(n),
    percent: (x) => `${Math.round(x * 100)}%`,
    season: "Season 1",
    serial: "239522",
    site: "deadlockplus.app",
};

const build = (e: Edition) => collectorsVideoData(e, editionSignals(e), deps);
const persona = (p: (typeof PERSONAS)[number]) => personaEdition(p, "collectors");

function resolve(ref: CopyRef): string {
    const key = ref.count === undefined ? ref.key : `${ref.key}_${ref.count === 1 ? "one" : "other"}`;
    const template = CATALOG[key];
    expect(template, key).toBeTypeOf("string");
    return interpolate(template, { ...(ref.count === undefined ? {} : { count: String(ref.count) }), ...ref.params });
}

const EDGES: Record<string, Edition> = {
    "no wins": { ...persona("P2"), stats: { ...persona("P2").stats, wins: 0, losses: 22, winrate: 0 } },
    "no rank, no heroes": { ...persona("P3"), rank: null, heroes: [], tape: undefined },
    "old edition": { ...persona("P1"), rankSeries: undefined, tape: undefined, playerName: undefined },
    "with a rank series": {
        ...persona("P1"),
        rankSeries: [
            { startS: 1785500000, badge: 23, outcome: "win" },
            { startS: 1790000000, badge: 35, outcome: "win" },
            { startS: 1792000000, badge: 34, outcome: "loss" },
        ],
        rank: { startBadge: 23, endBadge: 34, peakBadge: 35, delta: 4 },
    },
};

const ALL: [string, CollectorsVideoData][] = [
    ...PERSONAS.map((p) => [p, build(persona(p))] as [string, CollectorsVideoData]),
    ...Object.entries(EDGES).map(([name, e]) => [name, build(e)] as [string, CollectorsVideoData]),
];

describe("collectors video copy", () => {
    it("has every variant of every slot the data can ask for", () => {
        const missing = slotKeys().filter((k) => CATALOG[k] === undefined);
        expect(missing).toEqual([]);
    });

    it("asks only for keys in the slot list, under dispatch.video.collectors.<beat>.<slot>_<n>", () => {
        const known = new Set(slotKeys());
        for (const [, data] of ALL) {
            for (const ref of copyRefs(data)) {
                expect(ref.key).toMatch(
                    new RegExp(`^dispatch\\.video\\.collectors\\.c_\\w+\\.\\w+_[1-${VIDEO_VARIANTS}]$`),
                );
                expect(ref.key.startsWith("dispatch.story.")).toBe(false);
                const asked = ref.count === undefined ? [ref.key] : [`${ref.key}_one`, `${ref.key}_other`];
                for (const k of asked) expect(known.has(k), k).toBe(true);
            }
        }
    });

    it("never prints an en or em dash", () => {
        const dashed = Object.entries(CATALOG).filter(
            ([k, v]) => k.startsWith("dispatch.video.collectors.") && /[–—]/.test(v),
        );
        expect(dashed).toEqual([]);
        for (const [, data] of ALL) for (const ref of copyRefs(data)) expect(resolve(ref)).not.toMatch(/[–—]/);
    });

    it("fills every hole it prints", () => {
        for (const [, data] of ALL) for (const ref of copyRefs(data)) expect(resolve(ref)).not.toMatch(/\{\w+\}/);
    });

    it("gives the three personas different words", () => {
        const texts = PERSONAS.map((p) => new Set(copyRefs(build(persona(p))).map(resolve)));
        for (let i = 0; i < texts.length; i++) {
            for (let j = i + 1; j < texts.length; j++) {
                const shared = [...texts[i]].filter((x) => texts[j].has(x));
                expect(shared.length / Math.min(texts[i].size, texts[j].size)).toBeLessThan(0.25);
            }
        }
    });

    it("gives two players the same season different lines", () => {
        const a = build(persona("P1"));
        const b = build({ ...persona("P1"), accountId: 999 });
        expect(copyRefs(a).map((r) => r.key)).not.toEqual(copyRefs(b).map((r) => r.key));
    });
});

const SHAPE_TEST: Record<LineShape, RegExp> = {
    number: /^\{(count|wins|losses|rate|share)\}/,
    name: /^\{(hero|player|season|start|low|badge|end)\}/,
    question: /\?/,
    quote: /^"[^"]+"/,
    shout: /!$/,
    time: /^(\{date\}|On|In|At|By|After|Over|Every|Most|From|For|Across|Through|This|Since|Past|Saturday|All)\b/,
    kicker: /: /,
    sentence: /^[A-Z][a-z]+\b.*\.$/,
};

const seeds = (p: (typeof PERSONAS)[number]) =>
    Array.from({ length: 40 }, (_, i) => build({ ...persona(p), accountId: 1000 + i * 7919 }));

describe("collectors video line shapes", () => {
    it("tags each main line variant with a shape its English text has", () => {
        for (const [slot, shapes] of Object.entries(LINE_SHAPES)) {
            expect(new Set(shapes).size, slot).toBe(VIDEO_VARIANTS);
            shapes.forEach((shape, i) => {
                const key = `dispatch.video.collectors.${slot}_${i + 1}`;
                for (const text of [CATALOG[key], CATALOG[`${key}_other`]].filter(Boolean)) {
                    expect(text, key).toMatch(SHAPE_TEST[shape]);
                    if (shape !== "kicker") expect(text, key).not.toMatch(/: /);
                }
            });
        }
    });

    it("never gives two main lines of one video the same shape", () => {
        for (const p of PERSONAS) {
            for (const data of seeds(p)) {
                const mains = [
                    data.pack.hook,
                    ...data.cards.map((c) => c.line),
                    ...(data.chase ? [data.chase.line] : []),
                ];
                const shapes = mains.map((r) => lineShape(r.key));
                expect(shapes.every(Boolean), mains.map((r) => r.key).join()).toBe(true);
                expect(new Set(shapes).size, shapes.join()).toBe(shapes.length);
            }
        }
    });

    it("keeps colon lines and lines led by you or your each under a quarter", () => {
        const lines = PERSONAS.flatMap((p) => seeds(p).flatMap((d) => copyRefs(d).map(resolve)));
        const colon = lines.filter((l) => /: /.test(l)).length / lines.length;
        const you = lines.filter((l) => /^(you|your)\b/i.test(l)).length / lines.length;
        expect(colon).toBeLessThan(0.25);
        expect(you).toBeLessThan(0.25);
    });
});

describe("collectorsVideoData", () => {
    it("never puts a 0 or a non-number on screen", () => {
        for (const [name, data] of ALL) {
            for (const stat of [
                ...data.pack.stats,
                ...data.cards.flatMap((c) => c.stats),
                ...(data.chase?.stats ?? []),
                ...data.slab.stats,
            ]) {
                expect(Number.isFinite(stat.value), `${name} ${stat.source}`).toBe(true);
                expect(stat.value, `${name} ${stat.source}`).toBeGreaterThan(0);
                expect(stat.source).toMatch(/^[\w.[\]]+/);
            }
        }
    });

    it("drops the record from the grind card when a side is 0", () => {
        const grind = build(EDGES["no wins"]).cards.find((c) => c.beat === "c_grind")!;
        expect(grind.line.key).toContain(".line_plain_");
    });

    it("deals the cards in the plan's order, rarer as they go, the chase as holo", () => {
        for (const p of PERSONAS) {
            const e = persona(p);
            const data = build(e);
            expect(data.cards.map((c) => c.beat)).toEqual(castCards(e, editionSignals(e)).cards.map((c) => c.beat));
            const tiers = ["common", "uncommon", "rare", "gold"];
            const ranks = data.cards.map((c) => tiers.indexOf(c.rarity));
            expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
            expect(data.cards[0].rarity).toBe("common");
            expect(data.chase?.rarity).toBe("holo");
        }
    });

    it("dates the peak only when the rank series holds it", () => {
        expect(build(EDGES["old edition"]).chase?.line.key).toContain(".peak_line_nodate_");
        const dated = build(EDGES["with a rank series"]).chase!;
        expect(dated.line.key).toContain(".peak_line_");
        expect(dated.line.key).not.toContain("nodate");
        expect(dated.line.params.date).toBe("2026-09-21");
    });

    it("signs the slab and the fan without a name when the edition has none", () => {
        const data = build(EDGES["old edition"]);
        expect(data.slab.label.key).toContain(".label_anon_");
        expect(data.fan.sign.key).toContain(".sign_anon_");
    });

    it("puts the hero's face on the Main card: smug on a winning record, battered on a losing one", () => {
        const main = build(persona("P1")).cards.find((c) => c.beat === "c_main")!;
        expect(main.hero).toEqual({ id: 12, mood: "gloat" });
        const slump = { ...persona("P3"), heroes: [{ heroId: 8, games: 10, wins: 3, playtimeS: 9000 }] };
        expect(build(slump).cards.find((c) => c.beat === "c_main")!.hero).toEqual({ id: 8, mood: "critical" });
    });
});

describe("collectorsSfx", () => {
    it("lands each motion's sound on its beat's bar line", () => {
        const bar = 240 / 155;
        for (const p of PERSONAS) {
            const e = persona(p);
            const plan = collectorsPlan(castCards(e, editionSignals(e)), 26);
            const cues = collectorsSfx(plan, bar);
            const at = (id: string) => plan.find((b) => b.id === id)!.bar * bar;
            const has = (cue: string, s: number) =>
                expect(
                    cues.some((c) => c.cue === cue && Math.abs(c.atSeconds - s) < 1e-9),
                    `${p} ${cue}@${s}`,
                ).toBe(true);
            has("foil_glint", 0);
            has("foil_rip", at("c_tear"));
            has("card_deal", at("c_tear") + bar / 2);
            for (const b of plan.filter((x) => ["c_grind", "c_main", "c_pull", "c_insert", "c_climb"].includes(x.id))) {
                has("card_flip", b.bar * bar);
            }
            const chase = plan.find((b) => b.id === "c_chase")!;
            has("chase_build", chase.bar * bar);
            has("holo_reveal", (chase.bar + chaseFlipBar(chase.bars)) * bar);
            has("slab_click", at("c_slab") + bar);
            for (const c of cues) {
                expect(c.atSeconds).toBeGreaterThanOrEqual(0);
                expect(c.atSeconds).toBeLessThan(26 * bar);
            }
        }
    });
});
