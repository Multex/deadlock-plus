import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import en from "../../../../../../../../../locales/en.json";
import { PERSONA_HEROES, PERSONAS, personaEdition } from "@deadlock-plus/stats/dispatch/personas.fixture";
import type { Edition } from "@deadlock-plus/stats/dispatch/types";
import { MUSIC_TRACKS } from "../../music";
import { SFX_CUES } from "../../sfx";
import { videoTimeline } from "../../timeline";
import { allCopy, allStats, monthlySfx, monthlyVideoData, type Copy, type MonthlyVideoDeps } from "./data";
import { MONTHLY_SLOTS, slotKeys } from "./slots";

type Catalog = Record<string, string>;

function flatten(node: object, prefix = "", out: Catalog = {}): Catalog {
    for (const [name, value] of Object.entries(node)) {
        const key = prefix ? `${prefix}.${name}` : name;
        if (typeof value === "string") out[key] = value;
        else flatten(value as object, key, out);
    }
    return out;
}

/** `DISPATCH_VIDEO_LINES` (or the lane's lines file, when present) overlays copy that is not merged into en.json yet. */
const CATALOG = flatten(en);
const LINES =
    process.env.DISPATCH_VIDEO_LINES ??
    fileURLToPath(
        new URL(
            "../../../../../../../../../.agents/experiments/dispatch-video-rethink/monthly-lines.txt",
            import.meta.url,
        ),
    );
if (existsSync(LINES)) {
    for (const line of readFileSync(LINES, "utf8").split(/\r?\n/)) {
        const m = /^([\w.]+): (".*")$/.exec(line);
        if (m) CATALOG[m[1]!] = JSON.parse(m[2]!) as string;
    }
}

const DATE = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "long" });
const deps: MonthlyVideoDeps = {
    hero: (id) => PERSONA_HEROES[id] ?? `Hero ${id}`,
    rank: (badge) => `Rank ${badge}`,
    number: (n) => String(n),
    percent: (v) => `${Math.round(v * 100)}%`,
    date: (s, tz, options) => new Intl.DateTimeFormat("en-GB", { ...options, timeZone: tz }).format(s * 1000),
    duration: (s) => `${Math.round(s / 3600)} hours`,
};

function render(c: Copy): string {
    const key = c.count === undefined ? c.key : `${c.key}_${c.count === 1 ? "one" : "other"}`;
    const template = CATALOG[key];
    if (template === undefined) return `MISSING ${key}`;
    const params: Record<string, string | number> = { ...c.params };
    if (c.count !== undefined) params.count = c.count;
    return template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}

function thin(): Edition {
    const e = personaEdition("P2", "monthly");
    return {
        ...e,
        playerName: null,
        heroes: [],
        newHeroes: [],
        bestGame: null,
        tape: undefined,
        mates: [],
        nemesis: null,
        rank: null,
        stats: { ...e.stats, nightShare: 0, busiestDay: null, playtimeS: 0, daysPlayed: 0 },
    };
}

/** A month where everything fires, so the most beats and slots get asked for. */
function loud(): Edition {
    const e = personaEdition("P3", "monthly");
    return {
        ...e,
        longestWin: 9,
        newHeroes: [1],
        rank: { startBadge: 41, endBadge: 23, peakBadge: 41, delta: -3 },
        stats: { ...e.stats, nightShare: 0.45, daysPlayed: 25 },
        bestGame: { ...e.bestGame!, letter: "S+" },
        combat: [{ mvpRankCounts: [2, 2, 1], mvpRated: 20 } as never],
    };
}

/** The fixture gives every persona 16 days played; two players sharing a fact may share its line. */
function ownDays(p: (typeof PERSONAS)[number]): Edition {
    const e = personaEdition(p, "monthly");
    return { ...e, stats: { ...e.stats, daysPlayed: { P1: 16, P2: 12, P3: 19 }[p] } };
}

const EDITIONS: [string, Edition][] = [
    ...PERSONAS.map((p) => [p, personaEdition(p, "monthly")] as [string, Edition]),
    ["thin", thin()],
    ["loud", loud()],
];

describe("monthly video copy", () => {
    it("has all five variants of every slot, with both plural forms for counted ones", () => {
        const missing = MONTHLY_SLOTS.flatMap((s) => slotKeys(s).filter((k) => CATALOG[k] === undefined));
        expect(missing).toEqual([]);
    });

    it.each(EDITIONS)("%s asks only for slots in the catalogue, with every placeholder filled", (_, e) => {
        const data = monthlyVideoData(e, deps);
        for (const c of allCopy(data)) {
            expect(c.key).toMatch(/^dispatch\.video\.monthly\.m_\w+\.\w+_[1-5]$/);
            const slot = MONTHLY_SLOTS.find((s) => c.key.replace(/_[1-5]$/, "") === `dispatch.video.monthly.${s.beat}.${s.slot}`);
            expect(slot, c.key).toBeDefined();
            expect(c.count !== undefined, c.key).toBe(slot!.counted);
            const given = new Set([...Object.keys(c.params), ...(c.count === undefined ? [] : ["count"])]);
            for (const key of slotKeys(slot!)) {
                for (const [, name] of (CATALOG[key] ?? "").matchAll(/\{(\w+)\}/g)) {
                    expect(given.has(name!), `${key} needs {${name}}`).toBe(true);
                }
            }
            expect(render(c)).not.toContain("MISSING");
        }
    });

    it("never writes a dash", () => {
        const lines = Object.entries(CATALOG).filter(([k]) => k.startsWith("dispatch.video.monthly."));
        expect(lines.length).toBeGreaterThan(0);
        for (const [k, v] of lines) expect(v, k).not.toMatch(/[–—]/);
        for (const [, e] of EDITIONS) {
            for (const c of allCopy(monthlyVideoData(e, deps))) expect(render(c)).not.toMatch(/[–—]/);
        }
    });

    it("gives each persona its own words", () => {
        // Labels without data (a title, the price tag) and the next issue's date, the same for every player in a month,
        // may meet by chance; every line that carries the player's data may not.
        const texts = PERSONAS.map(
            (p) =>
                new Set(
                    allCopy(monthlyVideoData(ownDays(p), deps))
                        .filter((c) => !c.key.includes(".m_stand."))
                        .filter((c) => /\{\w+\}/.test(CATALOG[c.count === undefined ? c.key : `${c.key}_other`] ?? ""))
                        .map(render),
                ),
        );
        for (let i = 0; i < texts.length; i++) {
            for (let j = i + 1; j < texts.length; j++) {
                const shared = [...texts[i]!].filter((t) => texts[j]!.has(t));
                expect(shared, shared.join(" | ")).toEqual([]);
            }
        }
    });

    it("varies the shape: under a quarter of lines carry a colon or lead with you/your", () => {
        const texts: string[] = [];
        for (let accountId = 1; accountId <= 40; accountId++) {
            for (const p of PERSONAS) {
                const e = { ...personaEdition(p, "monthly"), accountId };
                texts.push(...allCopy(monthlyVideoData(e, deps)).map(render));
            }
        }
        const share = (test: (t: string) => boolean) => texts.filter(test).length / texts.length;
        expect(share((t) => t.includes(":"))).toBeLessThan(0.25);
        expect(share((t) => /^"?(you|your)/i.test(t))).toBeLessThan(0.25);
    });

    it("never reads the print's story copy", () => {
        for (const [, e] of EDITIONS) {
            for (const c of allCopy(monthlyVideoData(e, deps))) expect(c.key).not.toMatch(/^dispatch\.story\./);
        }
    });
});

describe("monthlyVideoData", () => {
    it.each(EDITIONS)("%s puts no 0 or NaN number on screen, and names each number's source", (_, e) => {
        for (const s of allStats(monthlyVideoData(e, deps))) {
            expect(Number.isFinite(s.value), s.source).toBe(true);
            expect(s.value, s.source).toBeGreaterThan(0);
            expect(s.source).toMatch(/^[a-zA-Z]/);
        }
    });

    it("is the same for the same edition", () => {
        const e = personaEdition("P1", "monthly");
        expect(monthlyVideoData(e, deps)).toEqual(monthlyVideoData(e, deps));
    });

    it("builds the contact sheet from the tape when the edition has no days", () => {
        const data = monthlyVideoData(personaEdition("P1", "monthly"), deps);
        const takes = data.beats.m_takes!;
        expect(takes.frames).toHaveLength(31);
        expect(takes.frames.reduce((n, f) => n + f.matches, 0)).toBe(23);
        expect(takes.frames[takes.loupe]!.matches).toBeGreaterThan(0);
    });

    it("circles the best game's day on the contact sheet", () => {
        const data = monthlyVideoData(personaEdition("P1", "monthly"), deps);
        expect(data.beats.m_shot!.frame).toBe(3);
    });

    it("leaves a nameless player's slate without a name", () => {
        const data = monthlyVideoData(thin(), deps);
        expect(data.beats.m_flash.slate.key).toContain(".slate_anon_");
    });
});

describe("monthlySfx", () => {
    it.each(EDITIONS)("%s lands every cue inside the video, in order, on a picked sound", (_, e) => {
        const data = monthlyVideoData(e, deps);
        for (const track of MUSIC_TRACKS) {
            const tl = videoTimeline(track);
            const cues = monthlySfx(data, tl);
            expect(cues.length).toBeGreaterThan(0);
            expect(cues[0]).toMatchObject({ cue: "shutter", atSeconds: 0 });
            for (let i = 0; i < cues.length; i++) {
                expect(SFX_CUES[cues[i]!.cue]).toBeDefined();
                expect(cues[i]!.atSeconds).toBeGreaterThanOrEqual(0);
                expect(cues[i]!.atSeconds).toBeLessThan(tl.bars * tl.barSeconds);
                if (i > 0) expect(cues[i]!.atSeconds).toBeGreaterThanOrEqual(cues[i - 1]!.atSeconds);
            }
        }
    });
});
