import { appendFileSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { interpolate } from "$lib/core/i18n.svelte";
import en from "../../../../../../locales/dispatch/en.json";
import { PERSONA_HEROES, PERSONAS, personaEdition, type Persona } from "@deadlock-plus/stats/dispatch/personas.fixture";
import { cellConditions, HEADLINE_SHAPES, STORY_COPY, type HeadlineShape } from "@deadlock-plus/stats/dispatch/stories";
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
    /** Placeholders the story's lines may use, beyond `count` and `me`. */
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
        params: ["wins", "losses", "winrate", "margin", "run_wins", "of", "played"],
    },
    {
        story: "hours",
        kinds: KINDS,
        headlines: [c("headline")],
        decks: [p("deck"), c("deck_days")],
        angles: [],
        versus: true,
        params: ["hours", "playtime", "days", "played"],
    },
    {
        story: "top_hero",
        kinds: KINDS,
        headlines: [p("headline")],
        decks: [c("deck")],
        angles: [p("angle_one_trick")],
        params: ["hero", "share", "wins", "games", "played"],
    },
    {
        story: "new_hero",
        kinds: KINDS,
        headlines: [c("headline")],
        decks: [c("deck")],
        angles: [p("angle_debut"), c("angle_explorer")],
        params: ["hero", "games", "fresh", "played"],
    },
    {
        story: "best_game",
        kinds: KINDS,
        headlines: [p("headline")],
        decks: [p("deck"), p("deck_graded")],
        angles: [p("angle_big_game")],
        params: ["hero", "kills", "deaths", "assists", "net_worth", "date", "when", "letter", "played"],
    },
    {
        story: "best_streak",
        kinds: KINDS,
        headlines: [c("headline")],
        decks: [p("deck")],
        angles: [c("angle_streak")],
        versus: true,
        params: ["wins", "played"],
    },
    {
        story: "longest_session",
        kinds: KINDS,
        headlines: [c("headline")],
        decks: [p("deck")],
        angles: [c("angle_marathon")],
        params: ["duration", "date", "when", "played"],
    },
    {
        story: "busiest_day",
        kinds: KINDS,
        headlines: [c("headline")],
        decks: [p("deck")],
        angles: [],
        params: ["date", "played"],
    },
    {
        story: "longest_match",
        kinds: KINDS,
        headlines: [p("headline")],
        decks: [p("deck")],
        angles: [],
        params: ["duration", "played"],
    },
    {
        story: "rank_move",
        kinds: ["weekly", "monthly"],
        headlines: ["up", "down", "held_up", "held_down"].map((v) => p(`headline_${v}`)),
        decks: ["up", "down", "held_up", "held_down"].map((v) => p(`deck_${v}`)),
        angles: [c("angle_climb"), c("angle_slide")],
        params: ["from", "to", "peak", "steps", "played"],
    },
    {
        story: "rank_move",
        kinds: ["collectors"],
        headlines: [p("headline_held_up"), p("headline_held_down")],
        decks: [p("deck_held_up"), p("deck_held_down")],
        angles: [],
        params: ["from", "to", "peak", "steps", "played"],
    },
    {
        story: "played_with",
        kinds: KINDS,
        headlines: [p("headline")],
        decks: [c("deck")],
        angles: [p("angle_duo")],
        params: ["player", "wins", "share", "together", "played"],
    },
    {
        story: "nemesis",
        kinds: KINDS,
        headlines: [p("headline")],
        decks: [c("deck")],
        angles: [c("angle_nemesis")],
        params: ["player", "matches", "played"],
    },
    {
        story: "damage",
        kinds: KINDS,
        headlines: [p("headline")],
        decks: [c("deck")],
        angles: [],
        params: ["damage", "games", "played"],
    },
    {
        story: "mvp_count",
        kinds: KINDS,
        headlines: [c("headline")],
        decks: [p("deck")],
        angles: [c("angle_mvp")],
        params: ["rated", "played"],
    },
    {
        story: "night_owl",
        kinds: KINDS,
        headlines: [p("headline")],
        decks: [c("deck")],
        angles: [p("angle_night_owl")],
        params: ["share", "games", "played"],
    },
    {
        story: "peak_rank",
        kinds: ["collectors"],
        headlines: [p("headline")],
        decks: [p("deck"), p("deck_top")],
        angles: [],
        params: ["peak", "end", "played"],
    },
    {
        story: "season_climb",
        kinds: ["collectors"],
        headlines: [p("headline_up"), p("headline_down")],
        decks: [c("deck_up"), c("deck_down")],
        angles: [p("angle_bounce_back")],
        params: ["from", "to", "steps", "low", "played"],
    },
    {
        story: "days_played",
        kinds: ["monthly", "year_end"],
        headlines: [c("headline")],
        decks: [p("deck")],
        angles: [p("angle_grinder")],
        params: ["days", "total", "share", "played"],
    },
    {
        story: "heroes_tried",
        kinds: ["year_end"],
        headlines: [c("headline")],
        decks: [p("deck"), c("deck_new")],
        angles: [c("angle_explorer")],
        params: ["heroes", "played"],
    },
    {
        story: "busiest_month",
        kinds: ["year_end"],
        headlines: [c("headline")],
        decks: [p("deck")],
        angles: [],
        params: ["month", "played"],
    },
];

const forms = (key: string, counted?: boolean) => (counted ? [`${key}_one`, `${key}_other`] : [key]);

interface Line {
    key: string;
    story: StoryShape;
    role: "core" | "deck" | "versus";
    shape?: HeadlineShape;
    /** The condition the picker checks before printing the line; empty when it always may. */
    cond: string;
}

/** Every line the picker can print for a story in a kind: each cell's lines come from the condition table. */
function storyLines(): Line[] {
    return STORIES.flatMap((story) =>
        story.kinds.flatMap((kind) => {
            const base = `${story.story}.${kind}`;
            const cell = (name: string, counted: boolean | undefined, role: Line["role"], shape?: HeadlineShape) => {
                const conds = role === "versus" ? Array<string>(STORY_COPY.versus).fill("") : cellConditions(name);
                return conds.flatMap((cond, i) =>
                    forms(`dispatch.story.${name}_${i + 1}`, counted).map((key): Line => ({
                        key,
                        story,
                        role,
                        cond,
                        ...(shape ? { shape } : {}),
                    })),
                );
            };
            const shaped = (parts: Part[]) =>
                parts.flatMap((x) =>
                    HEADLINE_SHAPES.flatMap((shape) => cell(`${base}.${x.part}_${shape}`, x.counted, "core", shape)),
                );
            return [
                ...shaped(story.headlines),
                ...shaped(story.angles),
                ...story.decks.flatMap((x) => cell(`${base}.${x.part}`, x.counted, "deck")),
                ...(story.versus
                    ? ["versus_up", "versus_down"].flatMap((v) => cell(`${base}.${v}`, true, "versus"))
                    : []),
            ];
        }),
    );
}

/** Every cell the picker can ask for, by story, kind and part, with its shape for headline cells. */
function storyCells(): string[] {
    return STORIES.flatMap((story) =>
        story.kinds.flatMap((kind) => [
            ...[...story.headlines, ...story.angles].flatMap((x) =>
                HEADLINE_SHAPES.map((shape) => `${story.story}.${kind}.${x.part}_${shape}`),
            ),
            ...story.decks.map((x) => `${story.story}.${kind}.${x.part}`),
        ]),
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
    run_wins: "7",
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
    me: "Wintermoth",
    fresh: "4",
};
const VALUE_ENTITIES = ["hero", "player", "me", "from", "to", "peak", "end", "low", "month", "date"].map(
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
        const empty = storyCells().filter((cell) => cellConditions(cell).length < 3);
        expect(empty).toEqual([]);
        expect(catalogMissing([...storyLines().map((l) => l.key), ...FIXED_KEYS])).toEqual([]);
    });

    it("holds no story line the picker can never reach", () => {
        const reachable = new Set([...storyLines().map((l) => l.key), ...FIXED_KEYS]);
        const stray = Object.keys(CATALOG).filter((k) => k.startsWith("dispatch.story.") && !reachable.has(k));
        expect(stray).toEqual([]);
    });

    it("uses only the placeholders each story has", () => {
        const bad = storyLines().flatMap(({ key, story }) => {
            const allowed = new Set([...story.params, "count", "me"]);
            const used = [...(CATALOG[key] ?? "").matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
            return used.filter((u) => !allowed.has(u)).map((u) => `${key}: {${u}}`);
        });
        expect(bad).toEqual([]);
    });

    it("conditions lines only on numbers the story has", () => {
        const bad = storyLines().flatMap(({ key, story, cond }) => {
            const facts = new Set([...story.params, "count", "me", ...(story.versus ? ["prev", "now"] : [])]);
            const names = cond.split(/[^a-z_]+/).filter((n) => n && !/^\d/.test(n));
            return names.filter((n) => !facts.has(n)).map((n) => `${key}: ${n}`);
        });
        expect(bad).toEqual([]);
    });

    it("prints the reader's name and a grade only where the line checks for them", () => {
        const bad = storyLines().filter(({ key, cond, role }) => {
            const tpl = CATALOG[key] ?? "";
            const has = (name: string) =>
                cond.split(",").some(
                    (a) =>
                        a
                            .trim()
                            .replace(/^!/, "")
                            .split(/[<>=!]/)[0] === name,
                );
            if (tpl.includes("{me}") && !has("me")) return true;
            return (
                role === "core" &&
                key.includes(".best_game.") &&
                !key.includes("angle_big_game") &&
                tpl.includes("{letter}") &&
                !has("letter")
            );
        });
        expect(bad.map((l) => l.key)).toEqual([]);
    });

    it("gives every headline and deck a real detail: a name, a number, a date or a rank", () => {
        const bare = storyLines()
            .filter(({ role }) => role !== "versus")
            .filter(({ key }) => ![...(CATALOG[key] ?? "").matchAll(/\{(\w+)\}/g)].some((m) => m[1] !== "when"));
        expect(bare.map(({ key }) => `${key}: ${CATALOG[key]}`)).toEqual([]);
    });

    it("never words two lines of one story and kind the same", () => {
        const seen = new Map<string, string>();
        const twice: string[] = [];
        for (const { key } of storyLines()) {
            const scope = key.split(".").slice(2, 4).join(".");
            const text = `${scope}|${CATALOG[key]}`;
            const other = seen.get(text);
            if (other && other.replace(/_(one|other)$/, "") !== key.replace(/_(one|other)$/, "")) {
                twice.push(`${key} = ${other}`);
            }
            seen.set(text, key);
        }
        expect(twice).toEqual([]);
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

    it("says a single rung only on a one-subrank rank move", () => {
        const bad = storyLines().filter(
            ({ key, cond }) =>
                key.includes(".rank_move.") &&
                !key.includes(".angle_") &&
                /\b(a|one) rung\b/i.test(CATALOG[key] ?? "") &&
                !/(^|,)\s*steps=1\s*(,|$)/.test(cond),
        );
        expect(bad.map(({ key }) => `${key}: ${CATALOG[key]}`)).toEqual([]);
    });

    it("never calls a total of playtime one unbroken sitting", () => {
        const sitting =
            /no breaks|door to door|start to finish|start the clock|clock started|sat down|pressed play|took the stage|later, still|“just one more,” \{count\} hours? later|hours? ago/i;
        const bad = storyLines().filter(({ key }) => key.includes(".hours.") && sitting.test(CATALOG[key] ?? ""));
        expect(bad.map(({ key }) => `${key}: ${CATALOG[key]}`)).toEqual([]);
    });

    it("words the duo share as a share of matches", () => {
        const bad = storyLines().filter(
            ({ key }) =>
                key.includes(".played_with.") && /\{share\} of the (week|month|season|year)\./.test(CATALOG[key] ?? ""),
        );
        expect(bad.map(({ key }) => `${key}: ${CATALOG[key]}`)).toEqual([]);
    });

    it("gives every deck a fact its headline lacks", () => {
        const bad: string[] = [];
        for (const pair of deckPairs()) {
            const { story, base, head, deck } = pair;
            for (const hk of headKeys(pair)) {
                const h = new Set(lineFacts(story.story, head.part, hk));
                const countOnly = holdsAll(h, story, deck);
                for (const dk of lineKeys(`${base}.${deck.part}`, deck.counted)) {
                    const fresh = lineFacts(story.story, deck.part, dk).filter(
                        (f) => !h.has(f) && f !== "me" && (f !== "played" || countOnly),
                    );
                    if (!fresh.length) bad.push(`${dk} adds nothing to ${hk}: ${CATALOG[dk]} | ${CATALOG[hk]}`);
                }
            }
        }
        if (REPORT) appendFileSync(REPORT, `${bad.join("\n")}\n`);
        expect(bad.slice(0, 20)).toEqual([]);
        expect(bad.length).toBe(0);
    });

    it("prints the match count in few decks that have another fact to add", () => {
        // A deck under a headline that already prints every other fact can only add the match count.
        const forced = new Set(
            deckPairs()
                .filter((pair) =>
                    headKeys(pair).some((hk) =>
                        holdsAll(new Set(lineFacts(pair.story.story, pair.head.part, hk)), pair.story, pair.deck),
                    ),
                )
                .map(({ base, deck }) => `${base}.${deck.part}`),
        );
        const share = KINDS.map((kind) => {
            const decks = storyLines().filter(
                ({ key, role }) =>
                    role === "deck" &&
                    key.split(".")[3] === kind &&
                    !key.endsWith("_one") &&
                    !forced.has(key.slice("dispatch.story.".length).replace(/_\d+(_other)?$/, "")),
            );
            const counting = decks.filter(({ key, story }) =>
                lineFacts(story.story, partOfKey(key), key).includes("played"),
            );
            return { kind, counting: counting.length, decks: decks.length };
        });
        if (REPORT) appendFileSync(REPORT, `${share.map((s) => `${s.kind} ${s.counting}/${s.decks}`).join("\n")}\n`);
        expect(share.filter((s) => s.counting > s.decks * MATCH_COUNT_DECK_SHARE)).toEqual([]);
    });

    it("says what a share is of, and words grades and rankings plainly", () => {
        const awkward =
            /of them all|\b(performance|outing|showing)( \{when\})? for \{hero\}|every other month|came first/i;
        const bad = storyLines().filter(({ key }) => awkward.test(CATALOG[key] ?? ""));
        expect(bad.map(({ key }) => `${key}: ${CATALOG[key]}`)).toEqual([]);
    });

    it("says the duo share is a share of matches", () => {
        const counted = /\{share\} of (the )?(\w+'s )?(ranked )?(matches|games)\b/;
        const bad = storyLines().filter(({ key }) => {
            const tpl = CATALOG[key] ?? "";
            return key.includes(".played_with.") && tpl.includes("{share}") && !counted.test(tpl);
        });
        expect(bad.map(({ key }) => `${key}: ${CATALOG[key]}`)).toEqual([]);
    });
});

/** At most this share of a kind's decks may print the period's match count when they have another fact to add. */
const MATCH_COUNT_DECK_SHARE = 1 / 10;

interface DeckPair {
    story: StoryShape;
    base: string;
    head: Part;
    deck: Part;
}

/** Each deck cell with every headline and angle cell it can print under. */
function deckPairs(): DeckPair[] {
    return STORIES.flatMap((story) =>
        story.kinds.flatMap((kind) => {
            const base = `${story.story}.${kind}`;
            return [...story.headlines, ...story.angles].flatMap((head) => {
                const own = story.decks.filter((d) => d.part === head.part.replace("headline_", "deck_"));
                return (own.length ? own : story.decks).map((deck) => ({ story, base, head, deck }));
            });
        }),
    );
}

const headKeys = ({ base, head }: DeckPair) =>
    HEADLINE_SHAPES.flatMap((shape) => lineKeys(`${base}.${head.part}_${shape}`, head.counted));

/** Every key of a cell's lines, both plural forms for a counted cell. */
const lineKeys = (cell: string, counted?: boolean) =>
    cellConditions(cell).flatMap((_, i) => forms(`dispatch.story.${cell}_${i + 1}`, counted));

/** The part of a story line's key, such as `deck_graded`. */
const partOfKey = (key: string) => key.split(".")[4].replace(/_\d+(_one|_other)?$/, "");

/** Story params that only some decks receive (`stories.ts` detectors); empty for facts only an angle brings. */
const ONLY_IN: Record<string, Record<string, readonly string[]>> = {
    record: { run_wins: [], of: [] },
    hours: { days: ["deck_days"] },
    new_hero: { games: [] },
    best_game: { letter: ["deck_graded"] },
    played_with: { share: [] },
    season_climb: { low: [] },
};

/** The facts a deck could print besides the match count: its story's numbers and names, and its own count. */
function printable(story: StoryShape, deck: Part): string[] {
    const only = ONLY_IN[story.story] ?? {};
    const facts = story.params
        .filter((f) => !only[f] || only[f].includes(deck.part))
        .map((f) => (f === "hours" ? "playtime" : f));
    if (deck.counted) facts.push(named(story.story, deck.part, "{count}").slice(1, -1));
    return [...new Set(facts)].filter((f) => f !== "played");
}

/** Whether a headline's facts leave a deck nothing to add but the match count. */
const holdsAll = (head: Set<string>, story: StoryShape, deck: Part) => printable(story, deck).every((f) => head.has(f));

/** The facts a line gives; a singular form of a counted line gives its count unprinted ("First Lash match on record"). */
function lineFacts(story: string, part: string, key: string): string[] {
    const facts = factsIn(named(story, part, CATALOG[key] ?? ""));
    const other = CATALOG[key.replace(/_one$/, "_other")] ?? "";
    if (key.endsWith("_one") && other.includes("{count}")) facts.push(named(story, part, "{count}").slice(1, -1));
    return facts;
}

/** What `{count}` holds in each story's cells, by part; `*` for the rest. */
const COUNT_AS: Record<string, Record<string, string>> = {
    record: { deck: "played", "*": "run_losses" },
    hours: { deck_days: "days", "*": "playtime" },
    top_hero: { "*": "games" },
    new_hero: { angle_explorer: "heroes", "*": "fresh" },
    best_streak: { "*": "wins" },
    longest_session: { "*": "session" },
    busiest_day: { "*": "day_matches" },
    rank_move: { "*": "steps" },
    played_with: { "*": "together" },
    nemesis: { "*": "losses" },
    damage: { "*": "games" },
    mvp_count: { "*": "mvps" },
    night_owl: { "*": "games" },
    season_climb: { "*": "steps" },
    days_played: { "*": "days" },
    heroes_tried: { deck_new: "fresh", "*": "heroes" },
    busiest_month: { "*": "month_matches" },
};

/** `tpl` with `{count}` and `{hours}` named for what they hold in that story's cell. */
function named(story: string, part: string, tpl: string): string {
    const count = COUNT_AS[story]?.[part] ?? COUNT_AS[story]?.["*"] ?? "count";
    return tpl.replace(/\{count\}/g, `{${count}}`).replace(/\{hours\}/g, "{playtime}");
}

/** The facts a line prints, the time of day among them. */
const factsIn = (tpl: string) => [...tpl.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

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
    "Lantern",
    "Moth",
    "Kettle",
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

    it("never reprints the previous edition's headline for a story", () => {
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
        expect(repeats).toBe(0);
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
        expect(shared / pairs).toBeLessThan(0.01);
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
