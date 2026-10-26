import { appendFileSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { interpolate } from "$lib/core/i18n.svelte";
import en from "../../../../../../locales/en.json";
import { copySeed } from "@deadlock-plus/stats/dispatch/copy";
import { PERSONA_HEROES, PERSONAS, personaEdition, type Persona } from "@deadlock-plus/stats/dispatch/personas.fixture";
import { editionSignals } from "@deadlock-plus/stats/dispatch/signals";
import { STORY_COPY, storyCopy } from "@deadlock-plus/stats/dispatch/stories";
import type { DispatchParam, DispatchStoryKind, Edition, EditionKind } from "@deadlock-plus/stats/dispatch/types";
import { dateRange } from "./date-range";
import { editionView, HEADLINE_CAPS, renderStory, type DispatchViewDeps } from "./edition-view";

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
interface Shape {
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
const SHAPES: Shape[] = [
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
        params: ["player", "wins", "share"],
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
    shape: Shape;
    role: "core" | "deck" | "tail";
}

function storyLines(): Line[] {
    return SHAPES.flatMap((shape) =>
        shape.kinds.flatMap((kind) => {
            const base = `dispatch.story.${shape.story}.${kind}`;
            const of = (parts: Part[], n: number, role: Line["role"]) =>
                parts.flatMap((x) => variants(`${base}.${x.part}`, n, x.counted).map((key) => ({ key, shape, role })));
            return [
                ...of(shape.headlines, STORY_COPY.core, "core"),
                ...of(shape.angles, STORY_COPY.angle, "core"),
                ...of(shape.decks, STORY_COPY.deck, "deck"),
                ...(shape.versus ? of([c("versus_up"), c("versus_down")], STORY_COPY.versus, "tail") : []),
            ];
        }),
    );
}

const VOICE_KEYS = KINDS.flatMap((kind) =>
    (["kicker", "tail"] as const).flatMap((bank) =>
        (["up", "down"] as const).flatMap((mood) =>
            variants(
                `dispatch.story.voice.${kind}.${bank}_${mood}`,
                bank === "kicker" ? STORY_COPY.kicker : STORY_COPY.tail,
            ),
        ),
    ),
);
const FIXED_KEYS = [
    "dispatch.story.frame.kicker",
    "dispatch.story.frame.tail",
    "dispatch.story.frame.both",
    "dispatch.story.frame.tail_after",
    "dispatch.story.frame.both_after",
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
};

const FORBIDDEN =
    /\b(delve|intricate|crucial|showcase|pivotal|tapestry|landscape|enhance|foster|underscore|vibrant|boasts|serves as|deadlock plus)\b/i;
const DOUBLED = /\b(\w+)\b[\s,:;!?.\u2014-]+\1\b/i;

const catalogMissing = (keys: readonly string[]) => keys.filter((k) => !(k in CATALOG));

describe("Dispatch print copy catalog", () => {
    it("holds every line the copy picker can ask for", () => {
        const keys = [...storyLines().map((l) => l.key), ...VOICE_KEYS, ...FIXED_KEYS];
        expect(catalogMissing(keys)).toEqual([]);
    });

    it("holds no story line the picker can never reach", () => {
        const reachable = new Set([...storyLines().map((l) => l.key), ...VOICE_KEYS, ...FIXED_KEYS]);
        const kinds = KINDS.join("|");
        const stray = Object.keys(CATALOG).filter(
            (k) => new RegExp(`^dispatch\\.story\\.\\w+\\.(${kinds})\\.`).test(k) && !reachable.has(k),
        );
        expect(stray).toEqual([]);
    });

    it("uses only the placeholders each story has", () => {
        const bad = storyLines().flatMap(({ key, shape }) => {
            const allowed = new Set([...shape.params, "count", "player", "hero"]);
            const used = [...(CATALOG[key] ?? "").matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
            return used
                .filter((u) => !allowed.has(u) || (u !== "count" && !shape.params.includes(u)))
                .map((u) => `${key}: {${u}}`);
        });
        expect(bad).toEqual([]);
    });

    it("reads cleanly in every combination of kicker, line and tail", () => {
        const problems: string[] = [];
        const check = (text: string, where: string, cap?: number) => {
            if (/\{\w+\}/.test(text)) problems.push(`${where}: dangling slot in "${text}"`);
            if (FORBIDDEN.test(text)) problems.push(`${where}: forbidden word in "${text}"`);
            const doubled = DOUBLED.exec(text);
            if (doubled) problems.push(`${where}: doubled "${doubled[1]}" in "${text}"`);
            if (/([.!?:])\s*[.:]/.test(text.replace(/a\.m\./g, "am")))
                problems.push(`${where}: stacked punctuation in "${text}"`);
            if (cap !== undefined && text.length > cap) problems.push(`${where}: ${text.length} > ${cap} "${text}"`);
        };
        const lines = storyLines();
        for (const line of lines) {
            const tpl = CATALOG[line.key];
            if (tpl === undefined) continue;
            const text = interpolate(tpl, VALUES);
            check(text, line.key, line.role === "core" ? HEADLINE_CAPS.column : line.role === "deck" ? 130 : 48);
            if (line.role !== "core") continue;
            const kind = line.key.split(".")[3];
            for (const voice of VOICE_KEYS.filter((k) => k.split(".")[3] === kind)) {
                const word = CATALOG[voice];
                if (word === undefined) continue;
                const joined = voice.includes(".kicker_")
                    ? text.includes(":") && word.trimEnd().endsWith(":")
                        ? null
                        : interpolate(CATALOG["dispatch.story.frame.kicker"] ?? "", { kicker: word, core: text })
                    : interpolate(
                          CATALOG[`dispatch.story.frame.tail${/[!?.\u2026]$/.test(text) ? "_after" : ""}`] ?? "",
                          {
                              core: text,
                              tail: word,
                          },
                      );
                if (joined) check(joined, `${line.key} + ${voice}`);
            }
        }
        for (const key of VOICE_KEYS) if (CATALOG[key] !== undefined) check(CATALOG[key], key, 40);
        expect(problems).toEqual([]);
    });

    it("never prints the old one-size phrases twice in a story family", () => {
        const families = new Map<string, number>();
        for (const { key } of storyLines()) {
            const text = CATALOG[key] ?? "";
            if (!/steals the show|runs the show/i.test(text)) continue;
            const family = key.split(".").slice(0, 4).join(".");
            families.set(family, (families.get(family) ?? 0) + 1);
        }
        expect([...families].filter(([, n]) => n > 1)).toEqual([]);
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

const resolve = (p: DispatchParam): string => {
    switch (p.type) {
        case "hero":
            return PERSONA_HEROES[p.heroId] ?? `Hero ${p.heroId}`;
        case "player":
            return p.name ?? "Unnamed player";
        case "number":
            return deps.number(p.value);
        case "percent":
            return deps.percent(p.value);
        case "duration":
            return deps.duration(p.seconds);
        case "date":
            return deps.day(p.unixS, "UTC");
        case "month":
            return deps.month(p.unixS, "UTC");
        case "grade":
            return p.letter;
        case "rank":
            return deps.rank(p.badge);
    }
};

/** The banner line `persona` would get for `story` in an edition with id `id`. */
function banner(persona: Persona, kind: EditionKind, story: DispatchStoryKind, id: string): string | null {
    const base = personaEdition(persona, kind);
    const e: Edition = { ...base, id };
    const s = e.stories.find((x) => x.kind === story);
    if (!s) return null;
    const copy = storyCopy(s, 0, { edition: e, seeds: [copySeed(e.accountId, id)], signals: editionSignals(e) });
    return renderStory(copy, "banner", resolve, deps).headline;
}

const SEEDS = 1000;
/** A file path: the spread tests append their measurements there. */
const REPORT = process.env.DISPATCH_COPY_REPORT;

describe("Dispatch print copy spread", () => {
    it("gives every persona's story hundreds of distinct banner lines", () => {
        const report: string[] = [];
        const low: string[] = [];
        for (const kind of KINDS) {
            for (const persona of PERSONAS) {
                for (const s of personaEdition(persona, kind).stories) {
                    const seen = new Set<string>();
                    for (let i = 0; i < SEEDS; i++) seen.add(banner(persona, kind, s.kind, `${kind}-seed-${i}`)!);
                    report.push(`${kind} ${persona} ${s.kind}: ${seen.size}`);
                    if (seen.size < 40) low.push(`${kind} ${persona} ${s.kind}: ${seen.size}`);
                }
            }
        }
        if (REPORT) appendFileSync(REPORT, `${report.join("\n")}\n`);
        expect(low).toEqual([]);
    }, 60_000);

    it("rarely gives two players the same sentence for the same story", () => {
        let shared = 0;
        let pairs = 0;
        for (const kind of KINDS) {
            const kinds = new Set(personaEdition("P1", kind).stories.map((s) => s.kind));
            for (const s of personaEdition("P3", kind).stories) {
                if (!kinds.has(s.kind)) continue;
                for (let i = 0; i < SEEDS; i++) {
                    const id = `${kind}-seed-${i}`;
                    pairs++;
                    if (banner("P1", kind, s.kind, id) === banner("P3", kind, s.kind, id)) shared++;
                }
            }
        }
        if (REPORT) appendFileSync(REPORT, `P1/P3 same-id collisions: ${shared}/${pairs}\n`);
        expect(shared / pairs).toBeLessThan(0.02);
    }, 60_000);
});

describe("editionView copy", () => {
    it("never reprints the previous same-kind edition's line for a story", () => {
        for (const kind of KINDS) {
            const chain: string[] = [];
            let prev: Map<string, string> | null = null;
            for (let n = 0; n < 12; n++) {
                const e = personaEdition("P2", kind, n);
                const view = editionView(e, deps, { chain: [...chain] });
                const lines = new Map(view.stories!.map((s) => [s.kind, s.headline]));
                if (prev)
                    for (const [k, text] of lines)
                        if (prev.has(k)) expect(text, `${kind} ${n} ${k}`).not.toBe(prev.get(k));
                prev = lines;
                chain.push(e.id);
            }
        }
    });

    it("gives the three personas different front pages in every kind", () => {
        for (const kind of KINDS) {
            const fronts = PERSONAS.map((p) => editionView(personaEdition(p, kind), deps).banner?.headline);
            expect(new Set(fronts).size, `${kind}: ${fronts.join(" | ")}`).toBe(3);
        }
    });

    it("keeps every headline inside its role's cap", () => {
        for (const kind of KINDS) {
            for (const p of PERSONAS) {
                const view = editionView(personaEdition(p, kind), deps);
                if (view.banner) expect(view.banner.headline.length).toBeLessThanOrEqual(HEADLINE_CAPS.banner);
                for (const col of view.columns) expect(col.headline.length).toBeLessThanOrEqual(HEADLINE_CAPS.column);
            }
        }
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

const DASHES = /[\u2013\u2014]/;

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
