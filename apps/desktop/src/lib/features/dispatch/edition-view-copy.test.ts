import { appendFileSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { interpolate } from "$lib/core/i18n.svelte";
import en from "../../../../../../locales/en.json";
import { PERSONA_HEROES, PERSONAS, personaEdition, type Persona } from "@deadlock-plus/stats/dispatch/personas.fixture";
import { HEADLINE_SHAPES, STORY_COPY, type HeadlineShape } from "@deadlock-plus/stats/dispatch/stories";
import type { DispatchStoryKind, EditionKind } from "@deadlock-plus/stats/dispatch/types";
import { dateRange } from "./date-range";
import { editionView, HEADLINE_CAP, type DispatchViewDeps } from "./edition-view";

type Catalog = Record<string, string>;

function flatten(node: object, prefix = "", out: Catalog = {}): Catalog {
    for (const [name, value] of Object.entries(node)) {
        const key = prefix ? `${prefix}.${name}` : name;
        if (typeof value === "string") out[key] = value;
        else flatten(value as object, key, out);
    }
    return out;
}

/** `DISPATCH_COPY_LINES` overlays a file of `key: "text"` lines, to check copy before it is merged into en.json. */
const CATALOG = flatten(en);
const overlay = process.env.DISPATCH_COPY_LINES;
if (overlay) {
    for (const line of readFileSync(overlay, "utf8").split(/\r?\n/)) {
        const m = /^([\w.]+): (".*")$/.exec(line);
        if (m) CATALOG[m[1]] = JSON.parse(m[2]) as string;
    }
}

const KINDS: readonly EditionKind[] = ["weekly", "monthly", "collectors", "year_end"];
const SPECIALS: readonly EditionKind[] = ["collectors", "year_end"];

interface Part {
    part: string;
    counted?: boolean;
}
interface StoryShape {
    story: DispatchStoryKind;
    kinds: readonly EditionKind[];
    headlines: Part[];
    decks: Part[];
    angles: Part[];
    versus?: boolean;
    /** Placeholders the story's lines may use, beyond `count`. */
    params: string[];
}

const c = (part: string): Part => ({ part, counted: true });
const p = (part: string): Part => ({ part });

/** Every slot `storyCopy` can produce for a story in a kind, from the detectors in `stories.ts`. */
const STORIES: StoryShape[] = [
    {
        story: "record",
        kinds: KINDS,
        headlines: [p("headline_winning"), p("headline_losing"), p("headline_even")],
        decks: [c("deck")],
        angles: [c("angle_losing_then_winning")],
        versus: true,
        params: ["wins", "losses", "winrate", "margin", "top", "of"],
    },
    {
        story: "hours",
        kinds: KINDS,
        headlines: [c("headline")],
        decks: [p("deck"), c("deck_days")],
        angles: [],
        versus: true,
        params: ["hours", "playtime", "top", "days"],
    },
    {
        story: "top_hero",
        kinds: KINDS,
        headlines: [p("headline")],
        decks: [c("deck")],
        angles: [p("angle_one_trick")],
        params: ["hero", "share", "wins", "games"],
    },
    {
        story: "new_hero",
        kinds: KINDS,
        headlines: [p("headline")],
        decks: [c("deck")],
        angles: [p("angle_debut"), c("angle_explorer")],
        params: ["hero", "games"],
    },
    {
        story: "best_game",
        kinds: KINDS,
        headlines: [p("headline")],
        decks: [p("deck"), p("deck_graded")],
        angles: [p("angle_big_game")],
        params: ["hero", "kills", "deaths", "assists", "net_worth", "date", "when", "letter"],
    },
    {
        story: "best_streak",
        kinds: KINDS,
        headlines: [c("headline")],
        decks: [p("deck")],
        angles: [c("angle_streak")],
        versus: true,
        params: ["wins"],
    },
    {
        story: "longest_session",
        kinds: KINDS,
        headlines: [c("headline")],
        decks: [p("deck")],
        angles: [c("angle_marathon")],
        params: ["duration", "date", "top", "when"],
    },
    {
        story: "busiest_day",
        kinds: KINDS,
        headlines: [c("headline")],
        decks: [p("deck")],
        angles: [],
        params: ["date", "top"],
    },
    {
        story: "longest_match",
        kinds: KINDS,
        headlines: [p("headline")],
        decks: [p("deck")],
        angles: [],
        params: ["duration"],
    },
    {
        story: "rank_move",
        kinds: ["weekly", "monthly"],
        headlines: ["up", "down", "held_up", "held_down"].map((v) => p(`headline_${v}`)),
        decks: ["up", "down", "held_up", "held_down"].map((v) => p(`deck_${v}`)),
        angles: [c("angle_climb"), c("angle_slide")],
        params: ["from", "to", "peak"],
    },
    {
        story: "rank_move",
        kinds: ["collectors"],
        headlines: [p("headline_held_up"), p("headline_held_down")],
        decks: [p("deck_held_up"), p("deck_held_down")],
        angles: [],
        params: ["from", "to", "peak"],
    },
    {
        story: "played_with",
        kinds: KINDS,
        headlines: [p("headline")],
        decks: [c("deck")],
        angles: [p("angle_duo")],
        params: ["player", "wins", "share", "together"],
    },
    {
        story: "nemesis",
        kinds: KINDS,
        headlines: [p("headline")],
        decks: [c("deck")],
        angles: [c("angle_nemesis")],
        params: ["player", "matches"],
    },
    { story: "damage", kinds: KINDS, headlines: [p("headline")], decks: [c("deck")], angles: [], params: ["damage"] },
    {
        story: "mvp_count",
        kinds: KINDS,
        headlines: [c("headline")],
        decks: [p("deck")],
        angles: [c("angle_mvp")],
        params: ["rated"],
    },
    {
        story: "night_owl",
        kinds: KINDS,
        headlines: [p("headline")],
        decks: [c("deck")],
        angles: [p("angle_night_owl")],
        params: ["share", "top"],
    },
    {
        story: "peak_rank",
        kinds: ["collectors"],
        headlines: [p("headline")],
        decks: [p("deck"), p("deck_top")],
        angles: [],
        params: ["peak", "end"],
    },
    {
        story: "season_climb",
        kinds: ["collectors"],
        headlines: [p("headline_up"), p("headline_down")],
        decks: [c("deck_up"), c("deck_down")],
        angles: [p("angle_bounce_back")],
        params: ["from", "to", "steps", "low"],
    },
    {
        story: "days_played",
        kinds: ["monthly", "year_end"],
        headlines: [c("headline")],
        decks: [p("deck")],
        angles: [p("angle_grinder")],
        params: ["days", "total", "share", "top"],
    },
    {
        story: "heroes_tried",
        kinds: ["year_end"],
        headlines: [c("headline")],
        decks: [p("deck"), c("deck_new")],
        angles: [c("angle_explorer")],
        params: ["heroes"],
    },
    {
        story: "busiest_month",
        kinds: ["year_end"],
        headlines: [c("headline")],
        decks: [p("deck")],
        angles: [],
        params: ["month", "top"],
    },
];

const forms = (key: string, counted?: boolean) => (counted ? [`${key}_one`, `${key}_other`] : [key]);
const variants = (base: string, n: number, counted?: boolean) =>
    Array.from({ length: n }, (_, i) => forms(`${base}_${i + 1}`, counted)).flat();

interface Line {
    key: string;
    story: StoryShape;
    role: "core" | "deck" | "versus";
    shape?: HeadlineShape;
}

function storyLines(): Line[] {
    return STORIES.flatMap((story) =>
        story.kinds.flatMap((kind) => {
            const base = `dispatch.story.${story.story}.${kind}`;
            const shaped = (parts: Part[]) =>
                parts.flatMap((x) =>
                    HEADLINE_SHAPES.flatMap((shape) =>
                        forms(`${base}.${x.part}_${shape}`, x.counted).map((key): Line => ({
                            key,
                            story,
                            role: "core",
                            shape,
                        })),
                    ),
                );
            const numbered = (parts: Part[], n: number, role: Line["role"]) =>
                parts.flatMap((x) => variants(`${base}.${x.part}`, n, x.counted).map((key) => ({ key, story, role })));
            return [
                ...shaped(story.headlines),
                ...shaped(story.angles),
                ...numbered(story.decks, STORY_COPY.deck, "deck"),
                ...(story.versus ? numbered([c("versus_up"), c("versus_down")], STORY_COPY.versus, "versus") : []),
            ];
        }),
    );
}

const FIXED_KEYS = [
    "dispatch.story.frame.deck_versus",
    ...["night", "morning", "afternoon", "evening"].map((w) => `dispatch.story.when.${w}`),
];

/** Long real values, so a line that fits here fits the paper. */
const VALUES: Record<string, string> = {
    hero: "Mo & Krill",
    player: "Copperhead",
    top: "Lady Geist",
    wins: "15",
    losses: "8",
    margin: "7",
    winrate: "65%",
    share: "52%",
    kills: "14",
    deaths: "1",
    assists: "17",
    net_worth: "41.2k",
    date: "Sun, Oct 4",
    when: "in the afternoon",
    duration: "52m 10s",
    from: "Ascendant 2",
    to: "Ascendant 6",
    peak: "Ascendant 6",
    end: "Ascendant 5",
    low: "Archon 2",
    steps: "7",
    damage: "412,300",
    rated: "23",
    playtime: "12h 40m",
    hours: "12",
    days: "16",
    total: "31",
    month: "September",
    games: "12",
    of: "8",
    letter: "S-",
    heroes: "12",
    matches: "14",
    count: "12",
    played: "23",
    together: "14",
};
const VALUE_ENTITIES = ["hero", "player", "top", "from", "to", "peak", "end", "low", "month", "date"].map(
    (k) => VALUES[k],
);

/**
 * How a headline reads, from its text alone. `entities` are the names it may lead with (heroes, players, ranks,
 * months, dates). The order matters: a colon makes a label whatever else it holds, and so on down.
 */
function shapeOf(text: string, entities: readonly string[]): HeadlineShape {
    const t = text.trim();
    if (t.includes(":")) return "label";
    if (/^[“"]/.test(t)) return "quote";
    if (/[.!?…]\s+\S/.test(t.replace(/a\.m\./g, "am"))) return "pair";
    if (t.endsWith("?")) return "ask";
    if (t.endsWith("!")) return "shout";
    if (/^\d/.test(t)) return "num";
    if (entities.some((e) => e && t.startsWith(e))) return "name";
    return "plain";
}

const YOU = /\byou(r|'re|'ve)?\b/i;
const FORBIDDEN =
    /\b(delve|intricate|crucial|showcase|pivotal|tapestry|landscape|enhance|foster|underscore|vibrant|boasts|serves as|deadlock plus)\b/i;
const DOUBLED = /\b(\w+)\b[\s,:;!?.—-]+\1\b/i;

const catalogMissing = (keys: readonly string[]) => keys.filter((k) => !(k in CATALOG));

describe("Dispatch print copy catalog", () => {
    it("holds every line the copy picker can ask for", () => {
        expect(catalogMissing([...storyLines().map((l) => l.key), ...FIXED_KEYS])).toEqual([]);
    });

    it("holds no story line the picker can never reach", () => {
        const reachable = new Set([...storyLines().map((l) => l.key), ...FIXED_KEYS]);
        const stray = Object.keys(CATALOG).filter((k) => k.startsWith("dispatch.story.") && !reachable.has(k));
        expect(stray).toEqual([]);
    });

    it("uses only the placeholders each story has", () => {
        const bad = storyLines().flatMap(({ key, story }) => {
            const allowed = new Set([...story.params, "count", "top", "played"]);
            const used = [...(CATALOG[key] ?? "").matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
            return used.filter((u) => !allowed.has(u)).map((u) => `${key}: {${u}}`);
        });
        expect(bad).toEqual([]);
    });

    it("reads cleanly and in the shape its key names", () => {
        const problems: string[] = [];
        for (const line of storyLines()) {
            const tpl = CATALOG[line.key];
            if (tpl === undefined) continue;
            const text = interpolate(tpl, VALUES);
            const where = line.key;
            if (/\{\w+\}/.test(text)) problems.push(`${where}: dangling slot in "${text}"`);
            if (FORBIDDEN.test(text)) problems.push(`${where}: forbidden word in "${text}"`);
            const doubled = DOUBLED.exec(text);
            if (doubled) problems.push(`${where}: doubled "${doubled[1]}" in "${text}"`);
            if (/([.!?:])\s*[.:]/.test(text.replace(/a\.m\./g, "am"))) {
                problems.push(`${where}: stacked punctuation in "${text}"`);
            }
            const cap = line.role === "core" ? HEADLINE_CAP : line.role === "deck" ? 130 : 48;
            if (text.length > cap) problems.push(`${where}: ${text.length} > ${cap} "${text}"`);
            if (line.shape && shapeOf(text, VALUE_ENTITIES) !== line.shape) {
                problems.push(`${where}: reads as ${shapeOf(text, VALUE_ENTITIES)}: "${text}"`);
            }
        }
        expect(problems).toEqual([]);
    });

    it("never prints the old one-size phrases", () => {
        const old = storyLines().filter(({ key }) => /steals the show|runs the show/i.test(CATALOG[key] ?? ""));
        expect(old).toEqual([]);
    });
});

const t = (key: string, params?: Record<string, string | number>) => interpolate(CATALOG[key] ?? key, params);
const tn = (key: string, count: number, params?: Record<string, string | number>) =>
    interpolate(CATALOG[`${key}_${count === 1 ? "one" : "other"}`] ?? `${key}_other`, { count, ...params });

const DAYS = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const deps: DispatchViewDeps = {
    t,
    tn,
    number: (n) => new Intl.NumberFormat("en").format(n),
    hero: (id) => (PERSONA_HEROES[id] ? { name: PERSONA_HEROES[id], art: null } : undefined),
    day: (s) => new Date(s * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
    dayRange: (a, b) => dateRange(DAYS, a * 1000, b * 1000, t("dispatch.range_join")),
    month: (s) => new Date(s * 1000).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }),
    percent: (v) => `${Math.round(v * 100)}%`,
    duration: (s) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`,
    netWorth: (n) => `${Math.round(n / 1000)}k`,
    rank: (badge) => `Rank ${badge}`,
};

const MONTHS = Array.from({ length: 12 }, (_, m) =>
    new Date(Date.UTC(2026, m, 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }),
);
/** What a persona's headline may lead with, as the test deps print it. */
const ENTITIES = [
    ...Object.values(PERSONA_HEROES),
    "Copperhead",
    "Saltmarsh",
    "Gloam",
    "Rank ",
    ...MONTHS,
    ...MONTHS.map((m) => m.slice(0, 3)),
];

const SEEDS = 1000;
/** A file path: the spread tests append their measurements there. */
const REPORT = process.env.DISPATCH_COPY_REPORT;

const pageOf = (p: Persona, kind: EditionKind, id: string, context = {}) =>
    editionView({ ...personaEdition(p, kind), id }, deps, context);

describe("Dispatch print headline shapes", () => {
    it("spreads headlines over the shapes and keeps colons and second person rare", () => {
        const report: string[] = [];
        const problems: string[] = [];
        for (const kind of KINDS) {
            const shapes = new Map<HeadlineShape, number>();
            let lines = 0;
            let colons = 0;
            let you = 0;
            for (const p of PERSONAS) {
                for (let i = 0; i < SEEDS; i++) {
                    const view = pageOf(p, kind, `${kind}-seed-${i}`);
                    const page = view.stories!.map((s) => shapeOf(s.headline, ENTITIES));
                    const front = page.slice(0, HEADLINE_SHAPES.length);
                    if (new Set(front).size !== front.length) problems.push(`${kind} ${p} ${i}: ${front.join(",")}`);
                    for (const [n, s] of view.stories!.entries()) {
                        lines++;
                        shapes.set(page[n], (shapes.get(page[n]) ?? 0) + 1);
                        if (s.headline.includes(":")) colons++;
                        if (YOU.test(s.headline)) you++;
                    }
                }
            }
            const share = (n: number) => n / lines;
            const top = Math.max(...shapes.values());
            report.push(
                `${kind}: ${[...shapes].map(([s, n]) => `${s} ${(share(n) * 100).toFixed(1)}%`).join(", ")}; ` +
                    `colon ${(share(colons) * 100).toFixed(1)}%, you ${(share(you) * 100).toFixed(1)}%`,
            );
            if (share(top) > 0.2) problems.push(`${kind}: one shape at ${share(top)}`);
            if (share(colons) >= 0.2) problems.push(`${kind}: colons at ${share(colons)}`);
            if (share(you) >= 0.25) problems.push(`${kind}: second person at ${share(you)}`);
            if (shapes.size !== HEADLINE_SHAPES.length) problems.push(`${kind}: only ${shapes.size} shapes`);
        }
        if (REPORT) appendFileSync(REPORT, `${report.join("\n")}\n`);
        expect(problems.slice(0, 20)).toEqual([]);
    }, 120_000);

    it("never leads with the previous same-kind edition's shape", () => {
        for (const kind of KINDS) {
            for (const p of PERSONAS) {
                const chain: string[] = [];
                let prev: HeadlineShape | null = null;
                for (let n = 0; n < 60; n++) {
                    const id = `${kind}-chain-${n}`;
                    const lead = shapeOf(pageOf(p, kind, id, { chain: [...chain] }).banner!.headline, ENTITIES);
                    expect(lead, `${kind} ${p} ${n}`).not.toBe(prev);
                    prev = lead;
                    chain.push(id);
                }
            }
        }
    });

    it("rarely reprints the previous edition's headline for a story", () => {
        let repeats = 0;
        let pairs = 0;
        for (const kind of KINDS) {
            for (const p of PERSONAS) {
                const chain: string[] = [];
                let prev: Map<string, string> | null = null;
                for (let n = 0; n < 60; n++) {
                    const id = `${kind}-chain-${n}`;
                    const view = pageOf(p, kind, id, { chain: [...chain] });
                    const lines = new Map(view.stories!.map((s) => [s.kind, s.headline]));
                    if (prev) {
                        for (const [k, text] of lines) {
                            if (!prev.has(k)) continue;
                            pairs++;
                            if (prev.get(k) === text) repeats++;
                        }
                    }
                    prev = lines;
                    chain.push(id);
                }
            }
        }
        if (REPORT) appendFileSync(REPORT, `same story, same headline as the previous edition: ${repeats}/${pairs}\n`);
        expect(repeats / pairs).toBeLessThan(0.08);
    }, 60_000);

    it("rarely gives two players the same sentence for the same story", () => {
        let shared = 0;
        let pairs = 0;
        for (const kind of KINDS) {
            for (let i = 0; i < SEEDS; i++) {
                const id = `${kind}-seed-${i}`;
                const a = new Map(pageOf("P1", kind, id).stories!.map((s) => [s.kind, s.headline]));
                for (const s of pageOf("P3", kind, id).stories!) {
                    if (!a.has(s.kind)) continue;
                    pairs++;
                    if (a.get(s.kind) === s.headline) shared++;
                }
            }
        }
        if (REPORT) appendFileSync(REPORT, `P1/P3 same-id collisions: ${shared}/${pairs}\n`);
        expect(shared / pairs).toBeLessThan(0.05);
    }, 60_000);
});

describe("editionView copy", () => {
    it("gives the three personas different front pages in every kind", () => {
        for (const kind of KINDS) {
            const fronts = PERSONAS.map((p) => editionView(personaEdition(p, kind), deps).banner?.headline);
            expect(new Set(fronts).size, `${kind}: ${fronts.join(" | ")}`).toBe(3);
        }
    });

    it("keeps every headline inside the cap", () => {
        for (const kind of KINDS) {
            for (const p of PERSONAS) {
                for (const s of editionView(personaEdition(p, kind), deps).stories!) {
                    expect(s.headline.length, s.headline).toBeLessThanOrEqual(HEADLINE_CAP);
                }
            }
        }
    });

    it("adds the comparison with the previous edition to the deck", () => {
        const prev = personaEdition("P1", "weekly", 0);
        const e = personaEdition("P1", "weekly", 1);
        const less = { ...prev, stats: { ...prev.stats, matches: 4 } };
        const record = editionView(e, deps, { chain: [prev.id], previous: less }).stories!.find(
            (s) => s.kind === "record",
        );
        expect(record?.deck).toMatch(/(Up from 4 matches last week|Last week: just 4 matches|last week's 4)!$/);
    });

    it("leads a special edition with its own lead stories", () => {
        for (const kind of SPECIALS) {
            for (const p of PERSONAS) {
                const lead = editionView(personaEdition(p, kind), deps).banner?.kind;
                expect(
                    kind === "collectors"
                        ? ["season_climb", "rank_move", "peak_rank"]
                        : ["hours", "top_hero", "days_played"],
                ).toContain(lead);
            }
        }
    });
});

const DASHES = /[–—]/;

describe("Dispatch text has no dashes", () => {
    it("keeps en and em dashes out of every dispatch.* line", () => {
        expect(Object.entries(CATALOG).filter(([k, v]) => k.startsWith("dispatch.") && DASHES.test(v))).toEqual([]);
    });

    it("renders P1 to P3 in every kind without one", () => {
        const found: string[] = [];
        const walk = (node: unknown, where: string) => {
            if (typeof node === "string") {
                if (DASHES.test(node)) found.push(`${where}: ${node}`);
            } else if (node && typeof node === "object") {
                for (const [k, v] of Object.entries(node)) walk(v, `${where}.${k}`);
            }
        };
        for (const kind of KINDS) {
            for (const p of PERSONAS) {
                for (let n = 0; n < 6; n++) {
                    const chain = Array.from({ length: n }, (_, i) => personaEdition(p, kind, i).id);
                    walk(editionView(personaEdition(p, kind, n), deps, { chain }), `${kind}.${p}.${n}`);
                }
            }
        }
        expect(found).toEqual([]);
    });
});
