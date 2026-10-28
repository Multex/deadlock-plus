import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { interpolate } from "$lib/core/i18n.svelte";
import en from "../../../../../../../../../locales/dispatch/en.json";
import { PERSONA_HEROES, PERSONAS, personaEdition } from "@deadlock-plus/stats/dispatch/personas.fixture";
import { editionSignals } from "@deadlock-plus/stats/dispatch/signals";
import type { Edition } from "@deadlock-plus/stats/dispatch/types";
import { VIDEO_VARIANTS } from "../../beats";
import {
    AWARD_SIGNALS,
    MAIN_SHAPES,
    MAIN_SLOTS,
    YEAR_END_SLOTS,
    yearEndAwards,
    yearEndSfx,
    type AwardsDeps,
    type CopyRef,
    type YearEndAwards,
} from "./data";
import { awardsPlan, CATEGORIES } from "./plan";

type Catalog = Record<string, string>;

function flatten(node: object, prefix = "", out: Catalog = {}): Catalog {
    for (const [name, value] of Object.entries(node)) {
        const key = prefix ? `${prefix}.${name}` : name;
        if (typeof value === "string") out[key] = value;
        else flatten(value as object, key, out);
    }
    return out;
}

/** The lines file is read on top of en.json until it is merged; `DISPATCH_VIDEO_LINES` points at another copy. */
const LINES =
    process.env.DISPATCH_VIDEO_LINES ??
    fileURLToPath(
        new URL(
            "../../../../../../../../../.agents/experiments/dispatch-video-rethink/year_end-lines.txt",
            import.meta.url,
        ),
    );
const CATALOG = flatten(en);
const FROM_FILE: string[] = [];
if (existsSync(LINES)) {
    for (const line of readFileSync(LINES, "utf8").split(/\r?\n/)) {
        const m = /^([\w.]+): (".*")$/.exec(line);
        if (!m) continue;
        CATALOG[m[1]] = JSON.parse(m[2]) as string;
        FROM_FILE.push(m[1]);
    }
}

const deps: AwardsDeps = {
    hero: (id) => PERSONA_HEROES[id],
    number: (n) => n.toLocaleString("en-US"),
    percent: (share) => `${Math.round(share * 100)}%`,
    day: (s, tz) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: tz }).format(s * 1000),
    monthName: (s, tz) => new Intl.DateTimeFormat("en-US", { month: "long", timeZone: tz }).format(s * 1000),
};

function render(ref: CopyRef): string {
    const plural = ref.count === undefined ? "" : ref.count === 1 ? "_one" : "_other";
    const template = CATALOG[`${ref.key}${plural}`];
    if (template === undefined) throw new Error(`missing ${ref.key}${plural}`);
    const params = ref.count === undefined ? ref.params : { count: deps.number(ref.count), ...ref.params };
    return interpolate(template, params);
}

function refs(v: YearEndAwards): CopyRef[] {
    return [
        v.preshow.marquee,
        ...(v.preshow.hook ? [v.preshow.hook] : []),
        v.welcome.line,
        ...v.awards.flatMap((a) => [
            a.title,
            a.ceremony.nominees,
            a.ceremony.envelope,
            a.ceremony.goesTo,
            a.accept,
            ...a.nominees.map((n) => n.line),
        ]),
        v.credits.title,
        ...v.credits.rows.map((r) => r.text),
        v.end.cta,
    ];
}

function figures(v: YearEndAwards) {
    return [
        ...v.preshow.figures,
        ...v.awards.flatMap((a) => a.nominees.flatMap((n) => n.figures)),
        ...v.credits.rows.flatMap((r) => (r.figure ? [r.figure] : [])),
    ];
}

const persona = Object.fromEntries(PERSONAS.map((p) => [p, personaEdition(p, "year_end")])) as Record<
    (typeof PERSONAS)[number],
    Edition
>;
const awardsOf = Object.fromEntries(PERSONAS.map((p) => [p, yearEndAwards(persona[p], deps)])) as Record<
    (typeof PERSONAS)[number],
    YearEndAwards
>;

/** A year with every award's data: two played months with a swing, mates, rivals, graded nominees and a tape. */
function fullYear(): Edition {
    const base = personaEdition("P3", "year_end");
    const month = (i: number, matches: number, wins: number) => ({
        monthStartS: Date.UTC(2025, 11 + i, 1) / 1000,
        matches,
        wins,
    });
    return {
        ...base,
        months: [
            month(0, 12, 3),
            month(1, 29, 14),
            month(2, 14, 7),
            ...Array.from({ length: 9 }, (_, i) => month(3 + i, 0, 0)),
        ],
        newHeroes: [1],
        heroes: [...base.heroes.slice(0, 2), { heroId: 1, games: 3, wins: 2, playtimeS: 6000 }],
        rivals: [
            { accountId: 8, name: "Saltmarsh", matches: 9, wins: 2 },
            { accountId: 5, name: "Brine", matches: 4, wins: 1 },
        ],
        nominees: [
            { ...base.bestGame!, matchId: 40, kills: 3, letter: "B" },
            base.bestGame!,
            { ...base.bestGame!, matchId: 41, kills: 20, deaths: 0, letter: "S" },
        ],
        bestGame: { ...base.bestGame!, matchId: 41, kills: 20, deaths: 0, letter: "S" },
    };
}

describe("yearEndAwards", () => {
    it("asks only for keys that exist, in every variant of every slot", () => {
        const missing: string[] = [];
        for (const [beat, slots] of Object.entries(YEAR_END_SLOTS)) {
            for (const [slot, { counted }] of Object.entries(slots)) {
                for (let n = 1; n <= VIDEO_VARIANTS; n++) {
                    const key = `dispatch.video.year_end.${beat}.${slot}_${n}`;
                    for (const k of counted ? [`${key}_one`, `${key}_other`] : [key])
                        if (!(k in CATALOG)) missing.push(k);
                }
            }
        }
        expect(missing).toEqual([]);
    });

    it("keeps the lines file to the slots the data can ask for", () => {
        const known = new Set(
            Object.entries(YEAR_END_SLOTS).flatMap(([beat, slots]) =>
                Object.entries(slots).flatMap(([slot, { counted }]) =>
                    Array.from({ length: VIDEO_VARIANTS }, (_, i) => {
                        const key = `dispatch.video.year_end.${beat}.${slot}_${i + 1}`;
                        return counted ? [`${key}_one`, `${key}_other`] : [key];
                    }).flat(),
                ),
            ),
        );
        expect(FROM_FILE.filter((k) => !known.has(k))).toEqual([]);
    });

    it("never writes a dash or a raw key, and fills every placeholder", () => {
        for (const text of FROM_FILE.map((k) => CATALOG[k])) expect(text).not.toMatch(/[–—]/);
        for (const v of [...Object.values(awardsOf), yearEndAwards(fullYear(), deps)]) {
            for (const ref of refs(v)) {
                expect(ref.key.startsWith("dispatch.video.year_end.")).toBe(true);
                const text = render(ref);
                expect(text).not.toMatch(/[{}–—]/);
                expect(text).not.toMatch(/dispatch\./);
            }
        }
    });

    it("never puts a zero or NaN on screen", () => {
        for (const v of [...Object.values(awardsOf), yearEndAwards(fullYear(), deps)]) {
            for (const f of figures(v)) {
                expect(Number.isFinite(f.value)).toBe(true);
                if (!f.source.endsWith(".deaths")) expect(f.value).toBeGreaterThan(0);
                expect(f.source).toMatch(/^[a-zA-Z]/);
            }
            for (const ref of refs(v)) if (ref.count !== undefined) expect(ref.count).toBeGreaterThan(0);
        }
    });

    it("leads with the strongest signal an award can carry, and spends each signal once", () => {
        for (const p of PERSONAS) {
            const v = awardsOf[p];
            const usable = new Set(Object.values(AWARD_SIGNALS).flat());
            const strongest = editionSignals(persona[p]).find((s) => usable.has(s.id));
            const lead = v.awards.at(-1)!;
            expect(lead.lead).toBe(true);
            if (strongest) expect(lead.signal).toBe(strongest.id);
            const spent = v.awards.flatMap((a) => (a.signal ? [a.signal] : []));
            expect(new Set(spent).size).toBe(spent.length);
        }
    });

    it("gives each persona its own night: different awards order and different words", () => {
        const orders = PERSONAS.map((p) => awardsOf[p].awards.map((a) => a.id).join(","));
        expect(new Set(orders).size).toBe(PERSONAS.length);
        // The ceremony's catchphrases ("The envelope, please.") are the genre; the rest must be the player's own.
        const words = PERSONAS.map((p) =>
            refs(awardsOf[p])
                .filter((r) => !r.key.includes(".y_ceremony."))
                .map(render),
        );
        for (let i = 0; i < words.length; i++)
            for (let j = i + 1; j < words.length; j++) {
                const shared = words[i].filter((w) => words[j].includes(w));
                expect(shared.length).toBeLessThan(words[i].length / 4);
            }
    });

    it("picks two categories from the year when it can fill them", () => {
        const v = yearEndAwards(fullYear(), deps);
        const ids = v.awards.map((a) => a.id);
        expect(ids).toContain("y_hero");
        expect(ids).toContain("y_month");
        expect(ids.filter((id) => (CATEGORIES as readonly string[]).includes(id))).toHaveLength(2);
        // Copperhead in 61% of games (0.76) outranks the S graded game (0.75), the 7-match night and Saltmarsh.
        expect(v.lineup.lead).toBe("y_supporting");
        expect(ids).toContain("y_performance");
        expect(ids).not.toContain("y_endurance");
    });

    it("turns Month of the Year into a comeback when a month swung", () => {
        const month = yearEndAwards(fullYear(), deps).awards.find((a) => a.id === "y_month")!;
        expect(month.signal).toBe("swing_month");
        expect(month.title.key).toMatch(/\.title_comeback_\d$/);
        expect(month.nominees[0].label).toBe("January");
    });

    it("drops awards the year has no data for", () => {
        const bare: Edition = {
            ...persona.P1,
            months: undefined,
            mates: [],
            nemesis: null,
            rivals: [],
            tape: undefined,
        };
        const ids = yearEndAwards(bare, deps).awards.map((a) => a.id);
        expect(ids).not.toContain("y_month");
        expect(ids).not.toContain("y_supporting");
        expect(ids).not.toContain("y_villain");
        // Lantern's year has one played month: no field to nominate from.
        expect(awardsOf.P1.awards.map((a) => a.id)).not.toContain("y_month");
    });

    it("names the winner first among the nominees, the best game for Performance of the Year", () => {
        const perf = yearEndAwards({ ...fullYear(), mates: [], nemesis: null, rivals: [] }, deps).awards.find(
            (a) => a.id === "y_performance",
        )!;
        expect(perf.nominees).toHaveLength(3);
        expect(perf.nominees[0].grade).toBe("S");
        expect(perf.nominees[0].heroId).toBe(8);
    });

    it("times its sound effects on the plan the export lays out", () => {
        const v = awardsOf.P3;
        const cues = yearEndSfx(v)({ seconds: 40.3, fps: 30, bars: 29, barSeconds: 240 / 172 });
        const plan = awardsPlan(29, v.lineup);
        expect(cues.filter((c) => c.cue === "envelope_tear")).toHaveLength(plan.length - 4);
        expect(cues.some((c) => c.cue === "crowd")).toBe(true);
    });
});

function shapeOf(template: string): (typeof MAIN_SHAPES)[number] {
    if (template.includes("?")) return "question";
    if (template.includes("!")) return "shout";
    if (/^(\{count\}|\{kda\}|\d)/.test(template)) return "number";
    if (template.startsWith("{")) return "name";
    return "plain";
}

/** Every persona under many account ids, so the picks cover every variant. */
const seeded = PERSONAS.flatMap((p) =>
    Array.from({ length: 30 }, (_, i) => yearEndAwards({ ...persona[p], accountId: 1000 + i }, deps)),
);

describe("line shapes", () => {
    it("gives each main line's variant its fixed shape", () => {
        const wrong: string[] = [];
        for (const slot of MAIN_SLOTS) {
            for (let n = 1; n <= VIDEO_VARIANTS; n++) {
                const key = `dispatch.video.year_end.${slot}_${n}`;
                for (const k of [key, `${key}_one`, `${key}_other`]) {
                    if (k in CATALOG && shapeOf(CATALOG[k]) !== MAIN_SHAPES[n - 1]) wrong.push(`${k}: ${CATALOG[k]}`);
                }
            }
        }
        expect(wrong).toEqual([]);
    });

    it("never repeats a main line's shape inside one video", () => {
        for (const v of [...seeded, yearEndAwards(fullYear(), deps)]) {
            const mains = [v.preshow.hook, ...v.awards.map((a) => a.accept)].filter((r): r is CopyRef => r !== null);
            const variants = mains.map((r) => /_(\d)$/.exec(r.key)![1]);
            expect(new Set(variants).size).toBe(variants.length);
        }
    });

    it("keeps colon lines and lines led by you or your under a quarter", () => {
        const lines = seeded.flatMap((v) => refs(v).map(render));
        const colons = lines.filter((l) => l.includes(":")).length;
        const you = lines.filter((l) => /^your?\b/i.test(l)).length;
        expect(colons / lines.length).toBeLessThan(0.25);
        expect(you / lines.length).toBeLessThan(0.25);
    });
});
