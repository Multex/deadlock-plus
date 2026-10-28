import type { MvpLetter } from "@deadlock-plus/ipc-types/MvpLetter";
import { badgeParts } from "../rank";
import { pickAlong, pickVariant, variantHash } from "./copy";
import type { EditionCalendar } from "./edition";
import type { Signal, SignalId } from "./signals";
import { STORY_LINES } from "./story-lines";
import type {
    DispatchParam,
    DispatchStory,
    DispatchStoryKind,
    DispatchText,
    Edition,
    EditionKind,
    EditionStats,
} from "./types";

export type DispatchEditionInput = Omit<Edition, "stories"> & { stats: EditionStats & Partial<EditionCalendar> };

/**
 * Base score per kind, highest first. The order also breaks equal scores. Each detector adds a bonus
 * for a bigger number, capped at `BONUS_MAX`. The weights and thresholds are editorial, not game facts.
 */
const BASE_SCORE = {
    best_game: 50,
    season_climb: 49,
    rank_move: 48,
    peak_rank: 47,
    hours: 44,
    record: 42,
    best_streak: 40,
    top_hero: 38,
    played_with: 36,
    nemesis: 34,
    new_hero: 32,
    mvp_count: 30,
    // With its full bonus it only ties `hours`, and the kind order keeps the hours on a Year-End banner.
    days_played: 29,
    damage: 28,
    heroes_tried: 27,
    longest_session: 26,
    busiest_month: 25,
    busiest_day: 24,
    longest_match: 22,
    night_owl: 20,
} as const satisfies Record<DispatchStoryKind, number>;

const KIND_ORDER = Object.keys(BASE_SCORE) as DispatchStoryKind[];

export const BONUS_MAX = 15;

/** Larger than any base plus `BONUS_MAX`, so a special edition's lead kinds always outrank the rest. */
const LEAD_BOOST = 100;
const LEADS: Partial<Record<EditionKind, readonly DispatchStoryKind[]>> = {
    collectors: ["season_climb", "rank_move", "peak_rank"],
    year_end: ["hours", "top_hero", "days_played"],
};

const HOUR_S = 3600;
const DAY_S = 86400;
export const HOURS_MIN_S = HOUR_S;
export const TOP_HERO_MIN_SHARE = 0.4;
export const STREAK_MIN = 3;
export const SESSION_MIN_MATCHES = 3;
export const BUSIEST_DAY_MIN_MATCHES = 4;
export const LONG_MATCH_MIN_S = 45 * 60;
export const PLAYED_WITH_MIN_MATCHES = 3;
export const NEMESIS_MIN_LOSSES = 2;
export const NIGHT_OWL_MIN_SHARE = 0.3;
export const MONTHLY_DAYS_MIN = 15;
export const HEROES_TRIED_MIN = 3;
export const BUSIEST_MONTH_MIN_MATCHES = 5;

const GRADE_ORDER: readonly MvpLetter[] = [
    "S+",
    "S",
    "S-",
    "A+",
    "A",
    "A-",
    "B+",
    "B",
    "B-",
    "C+",
    "C",
    "C-",
    "D+",
    "D",
    "D-",
    "E+",
    "E",
    "E-",
    "F",
];

const STORY_NS = "dispatch.story";

const number = (value: number): DispatchParam => ({ type: "number", value });
const percent = (value: number): DispatchParam => ({ type: "percent", value });
const duration = (seconds: number): DispatchParam => ({ type: "duration", seconds });
const date = (unixS: number): DispatchParam => ({ type: "date", unixS });
const hero = (heroId: number): DispatchParam => ({ type: "hero", heroId });
const rank = (badge: number): DispatchParam => ({ type: "rank", badge });
const month = (unixS: number): DispatchParam => ({ type: "month", unixS });

interface Draft {
    kind: DispatchStoryKind;
    extra?: number;
    headline?: string;
    headlineCount?: number;
    deck?: string;
    deckCount?: number;
    params: Record<string, DispatchParam>;
    matchId?: number;
}

type Detector = (e: DispatchEditionInput) => Draft[];

const record: Detector = ({ stats: { wins, losses, matches } }) => {
    const scored = wins + losses;
    if (scored === 0) return [];
    const outcome = wins > losses ? "winning" : wins < losses ? "losing" : "even";
    return [
        {
            kind: "record",
            extra: wins - losses,
            headline: `headline_${outcome}`,
            deckCount: matches,
            params: { wins: number(wins), losses: number(losses), winrate: percent(wins / scored) },
        },
    ];
};

const hours: Detector = ({ stats: { playtimeS } }) => {
    if (playtimeS < HOURS_MIN_S) return [];
    const whole = Math.floor(playtimeS / HOUR_S);
    const params: Record<string, DispatchParam> = { hours: number(whole), playtime: duration(playtimeS) };
    const draft: Draft = { kind: "hours", extra: Math.floor(whole / 2), headlineCount: whole, params };
    if (playtimeS >= DAY_S) {
        const days = Math.floor(playtimeS / (DAY_S / 10)) / 10;
        params.days = number(days);
        draft.deck = "deck_days";
        draft.deckCount = days;
    }
    return [draft];
};

const topHero: Detector = ({ heroes, stats, window }) => {
    if (stats.matches === 0) return [];
    const top = [...heroes].sort((a, b) => b.games - a.games || b.playtimeS - a.playtimeS || a.heroId - b.heroId)[0];
    if (!top) return [];
    const share = top.games / stats.matches;
    const yearly = window.kind === "year_end";
    if (share < TOP_HERO_MIN_SHARE && !yearly) return [];
    return [
        {
            kind: "top_hero",
            headline: yearly ? "headline_year" : undefined,
            extra: Math.round((share - TOP_HERO_MIN_SHARE) * 25),
            deckCount: top.games,
            params: { hero: hero(top.heroId), share: percent(share), wins: number(top.wins) },
        },
    ];
};

const newHero: Detector = ({ newHeroes }) => {
    if (newHeroes.length === 0) return [];
    return [
        {
            kind: "new_hero",
            extra: (newHeroes.length - 1) * 3,
            headlineCount: newHeroes.length,
            deckCount: newHeroes.length,
            params: { hero: hero(newHeroes[0]) },
        },
    ];
};

const bestGame: Detector = ({ bestGame: g }) => {
    if (!g) return [];
    const params: Record<string, DispatchParam> = {
        hero: hero(g.heroId),
        kills: number(g.kills),
        deaths: number(g.deaths),
        assists: number(g.assists),
        net_worth: number(g.netWorth),
        date: date(g.startTime),
    };
    if (!g.letter) return [{ kind: "best_game", matchId: g.matchId, params }];
    return [
        {
            kind: "best_game",
            matchId: g.matchId,
            extra: BONUS_MAX - GRADE_ORDER.indexOf(g.letter),
            deck: "deck_graded",
            params: { ...params, letter: { type: "grade", letter: g.letter } },
        },
    ];
};

const bestStreak: Detector = ({ longestWin }) => {
    if (longestWin < STREAK_MIN) return [];
    return [
        {
            kind: "best_streak",
            extra: (longestWin - STREAK_MIN) * 3,
            headlineCount: longestWin,
            params: { wins: number(longestWin) },
        },
    ];
};

const longestSession: Detector = ({ stats: { longestSession: s } }) => {
    if (!s || s.matches < SESSION_MIN_MATCHES) return [];
    return [
        {
            kind: "longest_session",
            extra: s.matches - SESSION_MIN_MATCHES,
            headlineCount: s.matches,
            params: { duration: duration(s.durationS), date: date(s.startS) },
        },
    ];
};

const busiestDay: Detector = ({ stats: { busiestDay: d } }) => {
    if (!d || d.matches < BUSIEST_DAY_MIN_MATCHES) return [];
    return [
        {
            kind: "busiest_day",
            extra: d.matches - BUSIEST_DAY_MIN_MATCHES,
            headlineCount: d.matches,
            params: { date: date(d.dayStartS) },
        },
    ];
};

const longestMatch: Detector = ({ stats: { longestMatchS } }) => {
    if (longestMatchS < LONG_MATCH_MIN_S) return [];
    return [
        {
            kind: "longest_match",
            extra: Math.floor((longestMatchS - LONG_MATCH_MIN_S) / 120),
            params: { duration: duration(longestMatchS) },
        },
    ];
};

/** Subranks from the bottom, so a move across a tier boundary counts its real steps. */
function step(badge: number): number {
    const parts = badgeParts(badge);
    return parts ? parts.tier * 6 + parts.sub : 0;
}

const rankMove: Detector = ({ rank: r, window }) => {
    if (!r || r.delta === 0 || window.kind === "year_end") return [];
    if (window.kind === "collectors" && r.startBadge !== r.endBadge) return [];
    const variant = `${r.startBadge === r.endBadge ? "held_" : ""}${r.delta > 0 ? "up" : "down"}`;
    return [
        {
            kind: "rank_move",
            extra: 2 * Math.abs(step(r.endBadge) - step(r.startBadge)),
            headline: `headline_${variant}`,
            deck: `deck_${variant}`,
            params: { from: rank(r.startBadge), to: rank(r.endBadge), peak: rank(r.peakBadge) },
        },
    ];
};

const peakRank: Detector = ({ rank: r, window }) => {
    if (!r || window.kind !== "collectors") return [];
    return [
        {
            kind: "peak_rank",
            deck: r.peakBadge === r.endBadge ? "deck_top" : "deck",
            params: { peak: rank(r.peakBadge), end: rank(r.endBadge) },
        },
    ];
};

const seasonClimb: Detector = ({ rank: r, window }) => {
    if (!r || window.kind !== "collectors" || r.startBadge === r.endBadge) return [];
    const steps = step(r.endBadge) - step(r.startBadge);
    const variant = steps > 0 ? "up" : "down";
    return [
        {
            kind: "season_climb",
            extra: 2 * Math.abs(steps),
            headline: `headline_${variant}`,
            deck: `deck_${variant}`,
            deckCount: Math.abs(steps),
            params: { from: rank(r.startBadge), to: rank(r.endBadge), steps: number(Math.abs(steps)) },
        },
    ];
};

const daysPlayed: Detector = ({ stats: { daysPlayed: days }, window }) => {
    if (days === undefined) return [];
    const yearly = window.kind === "year_end";
    if (!yearly && !(window.kind === "monthly" && days >= MONTHLY_DAYS_MIN)) return [];
    // Rounded because a window across a DST change is an hour off whole days.
    const total = Math.round((window.endS - window.startS) / DAY_S);
    return [
        {
            kind: "days_played",
            extra: yearly ? Math.floor(days / 10) : days - MONTHLY_DAYS_MIN,
            headlineCount: days,
            params: { days: number(days), total: number(total), share: percent(days / total) },
        },
    ];
};

const heroesTried: Detector = ({ heroes, newHeroes, window }) => {
    if (window.kind !== "year_end" || heroes.length < HEROES_TRIED_MIN) return [];
    const draft: Draft = {
        kind: "heroes_tried",
        extra: heroes.length - HEROES_TRIED_MIN,
        headlineCount: heroes.length,
        params: { heroes: number(heroes.length) },
    };
    if (newHeroes.length) {
        draft.deck = "deck_new";
        draft.deckCount = newHeroes.length;
    }
    return [draft];
};

const busiestMonth: Detector = ({ stats: { busiestMonth: b }, window }) => {
    if (window.kind !== "year_end" || !b || b.matches < BUSIEST_MONTH_MIN_MATCHES) return [];
    return [
        {
            kind: "busiest_month",
            extra: Math.floor((b.matches - BUSIEST_MONTH_MIN_MATCHES) / 5),
            headlineCount: b.matches,
            params: { month: month(b.monthStartS) },
        },
    ];
};

const playedWith: Detector = ({ mates }) => {
    const top = [...mates].sort((a, b) => b.matches - a.matches || b.wins - a.wins || a.accountId - b.accountId)[0];
    if (!top || top.matches < PLAYED_WITH_MIN_MATCHES) return [];
    return [
        {
            kind: "played_with",
            extra: top.matches - PLAYED_WITH_MIN_MATCHES,
            deckCount: top.matches,
            params: { player: { type: "player", accountId: top.accountId, name: top.name }, wins: number(top.wins) },
        },
    ];
};

const nemesis: Detector = ({ nemesis: n }) => {
    if (!n) return [];
    const losses = n.matches - n.wins;
    if (losses < NEMESIS_MIN_LOSSES) return [];
    return [
        {
            kind: "nemesis",
            extra: (losses - NEMESIS_MIN_LOSSES) * 2,
            deckCount: losses,
            params: { player: { type: "player", accountId: n.accountId, name: n.name }, matches: number(n.matches) },
        },
    ];
};

const damage: Detector = ({ combat }) => {
    if (!combat) return [];
    let total = 0;
    let matches = 0;
    for (const row of combat) {
        if (row.damage === null) continue;
        total += row.damage;
        matches += row.matches;
    }
    if (total <= 0) return [];
    return [
        {
            kind: "damage",
            extra: Math.floor(total / 50000),
            deckCount: matches,
            params: { damage: number(total) },
        },
    ];
};

const mvpCount: Detector = ({ combat }) => {
    if (!combat) return [];
    const count = combat.reduce((sum, row) => sum + row.mvpRankCounts.reduce((a, b) => a + b, 0), 0);
    if (count <= 0) return [];
    const rated = combat.reduce((sum, row) => sum + row.mvpRated, 0);
    return [{ kind: "mvp_count", extra: count, headlineCount: count, params: { rated: number(rated) } }];
};

const nightOwl: Detector = ({ stats: { nightShare, matches } }) => {
    if (nightShare === null || nightShare < NIGHT_OWL_MIN_SHARE) return [];
    return [
        {
            kind: "night_owl",
            extra: Math.round((nightShare - NIGHT_OWL_MIN_SHARE) * 20),
            deckCount: Math.round(nightShare * matches),
            params: { share: percent(nightShare) },
        },
    ];
};

const DETECTORS: Detector[] = [
    bestGame,
    seasonClimb,
    rankMove,
    peakRank,
    hours,
    record,
    bestStreak,
    topHero,
    playedWith,
    nemesis,
    newHero,
    mvpCount,
    daysPlayed,
    damage,
    heroesTried,
    longestSession,
    busiestMonth,
    busiestDay,
    longestMatch,
    nightOwl,
];

function text(kind: DispatchStoryKind, part: string, count: number | undefined): DispatchText {
    const t: DispatchText = { key: `${STORY_NS}.${kind}.${part}` };
    if (count !== undefined) t.count = count;
    return t;
}

function finish(d: Draft, edition: EditionKind): DispatchStory {
    const lead = LEADS[edition]?.includes(d.kind) ? LEAD_BOOST : 0;
    const story: DispatchStory = {
        kind: d.kind,
        score: BASE_SCORE[d.kind] + lead + Math.max(0, Math.min(BONUS_MAX, d.extra ?? 0)),
        headline: text(d.kind, d.headline ?? "headline", d.headlineCount),
        deck: text(d.kind, d.deck ?? "deck", d.deckCount),
        params: d.params,
    };
    if (d.matchId !== undefined) story.matchId = d.matchId;
    return story;
}

/** Highest score first; equal scores follow the kind order of `BASE_SCORE`. */
export function rankDispatchStories(stories: readonly DispatchStory[]): DispatchStory[] {
    return [...stories].sort((a, b) => b.score - a.score || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}

/** Every story the edition supports, ranked; `[0]` is the banner. */
export function detectDispatchStories(edition: DispatchEditionInput): DispatchStory[] {
    return rankDispatchStories(
        DETECTORS.flatMap((detect) => detect(edition)).map((d) => finish(d, edition.window.kind)),
    );
}

/**
 * The build of a headline, as a reader sees it. Every headline slot holds exactly one line of each shape, so the
 * page can hand out shapes first and words second:
 * `name` leads with a hero, player, rank or month; `num` leads with a number; `ask` is one question; `shout` is a
 * short exclamation; `quote` opens on a quoted phrase; `label` is the one shape with a colon; `pair` is two short
 * sentences; `plain` is a single statement led by none of those.
 */
export const HEADLINE_SHAPES = ["name", "num", "ask", "shout", "quote", "label", "pair", "plain"] as const;
export type HeadlineShape = (typeof HEADLINE_SHAPES)[number];

/** Variants per versus slot; every versus slot holds exactly this many lines in the catalog. */
export const STORY_COPY = { versus: 3 } as const;

/**
 * The conditions of a cell's lines (a headline shape or a deck slot, as `<story>.<kind>.<part>`), line 1 first.
 * An empty condition always holds.
 */
export function cellConditions(cell: string): readonly string[] {
    const entry = STORY_LINES[cell];
    if (entry === undefined) return [];
    return typeof entry === "number" ? Array<string>(entry).fill("") : entry;
}

/** The condition of one printed line, from its full locale key. */
export function lineCondition(key: string): string {
    const m = /^dispatch\.story\.(.+)_(\d+)(?:_one|_other)?$/.exec(key);
    return m ? (cellConditions(m[1])[Number(m[2]) - 1] ?? "") : "";
}

const ATOM = /^(!?)(\w+)(?:(>=|<=|!=|=|>|<)(\w+%?))?$/;

/**
 * Whether a line's condition holds for `facts`. A condition is comma-separated parts that must all hold: `name` is a
 * fact that is present and not zero, `!name` the opposite, and `name<op>value` compares a fact with a number, a
 * percent (`50%` is 0.5) or another fact, with `>=`, `<=`, `>`, `<`, `=` or `!=`. A comparison with a fact the
 * edition does not have fails.
 */
export function lineHolds(condition: string, facts: Readonly<Record<string, number>>): boolean {
    for (const raw of condition.split(",")) {
        const part = raw.trim();
        if (!part) continue;
        const m = ATOM.exec(part);
        if (!m) return false;
        const [, not, name, op, rhs] = m;
        const value = facts[name];
        if (!op) {
            if ((value !== undefined && value !== 0) === (not === "!")) return false;
            continue;
        }
        const other = /^-?\d/.test(rhs)
            ? rhs.endsWith("%")
                ? Number(rhs.slice(0, -1)) / 100
                : Number(rhs)
            : facts[rhs];
        if (value === undefined || other === undefined) return false;
        const ok =
            op === ">="
                ? value >= other
                : op === "<="
                  ? value <= other
                  : op === ">"
                    ? value > other
                    : op === "<"
                      ? value < other
                      : op === "="
                        ? value === other
                        : value !== other;
        if (!ok) return false;
    }
    return true;
}

/** The numbers a line's condition may test, from a story's params. */
function factsOf(params: Record<string, DispatchParam>): Record<string, number> {
    const facts: Record<string, number> = {};
    for (const [name, p] of Object.entries(params)) {
        switch (p.type) {
            case "number":
            case "percent":
                facts[name] = p.value;
                break;
            case "duration":
                facts[name] = p.seconds;
                break;
            case "date":
            case "month":
                facts[name] = p.unixS;
                break;
            case "grade":
                facts[name] = GRADE_ORDER.length - GRADE_ORDER.indexOf(p.letter);
                break;
            case "rank":
                facts[name] = step(p.badge);
                break;
            case "hero":
                facts[name] = 1;
                break;
            case "player":
                facts[name] = p.name ? 1 : 0;
                break;
        }
    }
    return facts;
}

/**
 * The line to print from a cell, as its 1-based number. Lines alternate between the editions of a chain: an even
 * edition takes even lines and an odd one odd lines, so a story never prints the line its previous edition printed,
 * whatever shape or position each edition gave it. Within that half the pick is seeded among the lines whose
 * condition holds.
 */
function pickLine(cell: string, facts: Record<string, number>, seeds: readonly string[]): number {
    const conds = cellConditions(cell);
    const parity = (seeds.length + 1) % 2;
    const ok = conds.flatMap((c, i) => (lineHolds(c, facts) ? [i] : []));
    const half = ok.filter((i) => i % 2 === parity);
    const pool = half.length ? half : ok.length ? ok : [0];
    return pool[variantHash(seeds[seeds.length - 1] ?? "", cell) % pool.length] + 1;
}

export interface CopyContext {
    edition: Edition;
    /** `copySeed` of every earlier edition of this kind, oldest first, then this one. */
    seeds: readonly string[];
    signals: readonly Signal[];
    /** The same kind's previous edition, for "up from 4 last week". */
    previous?: Pick<Edition, "stats" | "longestWin"> | null;
}

/**
 * One story's printable parts as locale keys. `phrases` maps a placeholder to a locale key whose text fills it;
 * `versus` is a sentence comparing with the previous edition, printed after the deck.
 */
export interface StoryCopy {
    core: DispatchText;
    shape: HeadlineShape;
    angle: SignalId | null;
    params: Record<string, DispatchParam>;
    /** What the line conditions were checked against, less each line's own `count`. */
    facts: Record<string, number>;
    phrases: Record<string, string>;
    deck: DispatchText;
    versus: DispatchText | null;
}

/** The signals that give a story its own angle, first match wins. */
const ANGLES: Partial<Record<DispatchStoryKind, readonly SignalId[]>> = {
    best_streak: ["streak"],
    top_hero: ["one_trick"],
    played_with: ["duo"],
    nemesis: ["nemesis"],
    record: ["losing_then_winning"],
    best_game: ["big_game"],
    longest_session: ["marathon"],
    new_hero: ["debut", "explorer"],
    rank_move: ["climb", "slide"],
    season_climb: ["bounce_back"],
    days_played: ["grinder"],
    night_owl: ["night_owl"],
    mvp_count: ["mvp"],
    heroes_tried: ["explorer"],
};

/** Signals that pull a story up the page without changing its words. */
const PULLS: Partial<Record<SignalId, readonly DispatchStoryKind[]>> = {
    winning: ["record"],
    losing: ["record"],
    vs_last: ["record", "hours"],
    swing_month: ["busiest_month"],
    weekender: ["busiest_day"],
    dry_spell: ["days_played"],
};

interface Angle {
    count?: number;
    params?: Record<string, DispatchParam>;
}

function angleOf(story: DispatchStory, part: string, signal: Signal): Angle | null {
    switch (signal.id) {
        case "streak":
            return { count: signal.facts.wins };
        case "one_trick":
            return { params: { share: percent(signal.facts.share), games: number(signal.facts.games) } };
        case "duo":
            return { params: { share: percent(signal.facts.share) } };
        case "nemesis":
            return { count: signal.facts.losses };
        case "losing_then_winning": {
            const f = signal.facts;
            return { count: f.losses, params: { wins: number(f.wins), of: number(f.of) } };
        }
        case "big_game": {
            const g = signal.facts.game;
            return g.matchId === story.matchId && g.letter
                ? { params: { letter: { type: "grade", letter: g.letter } } }
                : null;
        }
        case "marathon":
            return { count: signal.facts.matches };
        case "debut":
            return { params: { hero: hero(signal.facts.heroId), games: number(signal.facts.games) } };
        case "explorer":
            return { count: signal.facts.heroes };
        case "climb":
            return part === "headline_up" ? { count: Math.abs(signal.facts.steps) } : null;
        case "slide":
            return part === "headline_down" ? { count: Math.abs(signal.facts.steps) } : null;
        case "bounce_back":
            return { params: { low: rank(signal.facts.lowBadge) } };
        case "grinder":
        case "night_owl":
            return { params: { share: percent(signal.facts.share) } };
        case "mvp":
            return { count: signal.facts.placements };
        default:
            return null;
    }
}

/** Numbers a same-kind previous edition can be compared on, as "up from 4 last week". */
const VERSUS: Partial<Record<DispatchStoryKind, (e: Pick<Edition, "stats" | "longestWin">) => number>> = {
    record: (e) => e.stats.matches,
    hours: (e) => Math.floor(e.stats.playtimeS / HOUR_S),
    best_streak: (e) => e.longestWin,
};

const hourFormat = new Map<string, Intl.DateTimeFormat>();
function partOfDay(unixS: number, tz: string): "night" | "morning" | "afternoon" | "evening" {
    let f = hourFormat.get(tz);
    if (!f) {
        f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" });
        hourFormat.set(tz, f);
    }
    const hour = Number(f.format(unixS * 1000)) % 24;
    return hour < 6 ? "night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}

const partOf = (t: DispatchText) => {
    const part = t.key.slice(t.key.lastIndexOf(".") + 1);
    return part === "headline_year" ? "headline" : part;
};

function line(key: string, count: number | undefined): DispatchText {
    return count === undefined ? { key } : { key, count };
}

function shapeOrder(seed: string, prev: readonly HeadlineShape[] | null): HeadlineShape[] {
    const n = HEADLINE_SHAPES.length;
    const avoid = prev ? HEADLINE_SHAPES.indexOf(prev[0]) + 1 : undefined;
    const lead = HEADLINE_SHAPES[pickVariant(seed, "page.lead_shape", n, avoid) - 1];
    const order = [lead, ...HEADLINE_SHAPES.filter((s) => s !== lead)];
    for (let i = n - 1; i > 1; i--) {
        const j = 1 + (variantHash(seed, `page.shape.${i}`) % i);
        [order[i], order[j]] = [order[j], order[i]];
    }
    if (!prev) return order;
    // Stories keep roughly their place from one edition to the next, so a position never repeats its last shape.
    for (let i = 1; i < n; i++) {
        if (order[i] !== prev[i]) continue;
        const j = order.findIndex((s, k) => k > 0 && k !== i && s !== prev[i] && order[i] !== prev[k]);
        if (j > 0) [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
}

/**
 * The headline shape for each page position, `length` long. Every edition of the chain (oldest first) is laid out in
 * turn, so the lead never takes the previous edition's lead shape and no position repeats the shape it had there;
 * the first `HEADLINE_SHAPES.length` positions all differ. Longer pages start the order again.
 */
export function pageShapes(seeds: readonly string[], length: number): HeadlineShape[] {
    let order: HeadlineShape[] | null = null;
    for (const seed of seeds) order = shapeOrder(seed, order);
    const page = order ?? [...HEADLINE_SHAPES];
    return Array.from({ length }, (_, i) => page[i % page.length]);
}

interface CopyBasis {
    base: string;
    /** The headline cell without its shape: `<story>.<kind>.<part or angle>`. */
    head: string;
    angle: SignalId | null;
    coreCount: number | undefined;
    params: Record<string, DispatchParam>;
    facts: Record<string, number>;
    measure: { before: number; now: number } | null;
}

function copyBasis(story: DispatchStory, ctx: CopyContext): CopyBasis {
    const { edition } = ctx;
    const base = `${story.kind}.${edition.window.kind}`;
    const part = partOf(story.headline);

    let angle: SignalId | null = null;
    let found: Angle | null = null;
    for (const id of ANGLES[story.kind] ?? []) {
        const signal = ctx.signals.find((s) => s.id === id);
        found = signal ? angleOf(story, part, signal) : null;
        if (found) {
            angle = id;
            break;
        }
    }

    const params: Record<string, DispatchParam> = { ...story.params, ...found?.params };
    if (story.kind === "record") {
        const w = story.params.wins;
        const l = story.params.losses;
        if (w?.type === "number" && l?.type === "number") params.margin = number(Math.abs(w.value - l.value));
    }
    const deckCount = story.deck.count;
    if (deckCount !== undefined) {
        if (story.kind === "played_with") params.together = number(deckCount);
        if (story.kind === "new_hero") params.fresh = number(deckCount);
        if (GAMES_FROM_DECK.includes(story.kind) && !params.games) params.games = number(deckCount);
    }
    params.played = number(edition.stats.matches);
    params.me = { type: "player", accountId: edition.accountId, name: edition.playerName ?? null };

    const versus = VERSUS[story.kind];
    const measure = versus ? { before: ctx.previous ? versus(ctx.previous) : 0, now: versus(edition) } : null;
    const facts = factsOf(params);
    if (measure) {
        facts.now = measure.now;
        if (measure.before > 0) facts.prev = measure.before;
    }
    return {
        base,
        head: angle ? `${base}.angle_${angle}` : `${base}.${part}`,
        angle,
        coreCount: angle ? found?.count : story.headline.count,
        params,
        facts,
        measure,
    };
}

/** Stories whose deck count is also worth printing in the headline, as `{games}`. */
const GAMES_FROM_DECK: readonly DispatchStoryKind[] = ["top_hero", "damage", "night_owl"];

const withCount = (facts: Record<string, number>, count: number | undefined) =>
    count === undefined ? facts : { ...facts, count };

/** Whether `story` has a line it may print in `shape` for this edition. */
export function canPrint(story: DispatchStory, shape: HeadlineShape, ctx: CopyContext): boolean {
    const b = copyBasis(story, ctx);
    const facts = withCount(b.facts, b.coreCount);
    return cellConditions(`${b.head}_${shape}`).some((c) => lineHolds(c, facts));
}

/**
 * `shapes` (from `pageShapes`) with a story that has no line in its shape swapped onto one it has: a cell can need a
 * fact the edition lacks, such as the reader's name. Swaps stay inside each run of `HEADLINE_SHAPES.length` positions,
 * so the shapes in a run stay distinct; a story no swap fits takes a shape its run does not use yet, if it can print
 * one.
 */
export function fitShapes(
    stories: readonly DispatchStory[],
    shapes: readonly HeadlineShape[],
    ctx: CopyContext,
): HeadlineShape[] {
    const out = [...shapes];
    const fits = (i: number, shape: HeadlineShape) => canPrint(stories[i], shape, ctx);
    const n = HEADLINE_SHAPES.length;
    for (let i = 0; i < out.length; i++) {
        if (fits(i, out[i])) continue;
        const start = i - (i % n);
        const run = out.slice(start, start + n);
        const j = run.findIndex((s, k) => start + k !== i && s !== out[i] && fits(i, s) && fits(start + k, out[i]));
        if (j >= 0) {
            [out[i], out[start + j]] = [out[start + j], out[i]];
            continue;
        }
        const free = HEADLINE_SHAPES.find((s) => !run.includes(s) && fits(i, s));
        if (free) out[i] = free;
    }
    return out;
}

/**
 * The words for `story` printed in `shape` (from `pageShapes`, through `fitShapes`). A line is only printed when its
 * condition holds for the story's numbers, and picks follow `ctx.seeds`, so they are stable for a frozen edition and
 * neither headline nor deck repeats the previous same-kind edition's line for that story.
 */
export function storyCopy(story: DispatchStory, shape: HeadlineShape, ctx: CopyContext): StoryCopy {
    const { edition, seeds } = ctx;
    const { base, head, angle, coreCount, params, facts, measure } = copyBasis(story, ctx);
    const phrases: Record<string, string> = {};
    const when = story.params.date;
    if (when?.type === "date" && (story.kind === "best_game" || story.kind === "longest_session")) {
        phrases.when = `${STORY_NS}.when.${partOfDay(when.unixS, edition.window.tz)}`;
    }

    const coreCell = `${head}_${shape}`;
    const core = line(`${STORY_NS}.${coreCell}_${pickLine(coreCell, withCount(facts, coreCount), seeds)}`, coreCount);
    const deckCell = `${base}.${partOf(story.deck)}`;
    const deck = line(
        `${STORY_NS}.${deckCell}_${pickLine(deckCell, withCount(facts, story.deck.count), seeds)}`,
        story.deck.count,
    );

    let versus: DispatchText | null = null;
    if (measure && measure.before > 0 && measure.now !== measure.before) {
        const dir = measure.now > measure.before ? "up" : "down";
        const n = pickAlong(seeds, `${base}.versus_${dir}`, STORY_COPY.versus);
        versus = line(`${STORY_NS}.${base}.versus_${dir}_${n}`, measure.before);
    }

    return { core, shape, angle, params, facts, phrases, deck, versus };
}

const PULL = 20;
const JITTER = 9;

/**
 * The page order for one edition: the frozen scores, plus a pull for each story a fired signal speaks to, plus a
 * seeded nudge, so two players' (and two weeks') front pages differ in structure. A special edition's lead kinds
 * keep `LEAD_BOOST`, which outweighs both.
 */
export function arrangeStories(
    stories: readonly DispatchStory[],
    signals: readonly Signal[],
    seed: string,
): DispatchStory[] {
    const pull = (kind: DispatchStoryKind) =>
        signals.reduce((best, s) => {
            const speaks = ANGLES[kind]?.includes(s.id) || PULLS[s.id]?.includes(kind);
            return speaks ? Math.max(best, s.strength) : best;
        }, 0);
    const score = new Map(
        stories.map((s) => [
            s,
            s.score + Math.round(PULL * pull(s.kind)) + (variantHash(seed, `order.${s.kind}`) % JITTER),
        ]),
    );
    return [...stories].sort(
        (a, b) => score.get(b)! - score.get(a)! || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
    );
}
