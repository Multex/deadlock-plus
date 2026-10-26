import { SITE_URL } from "@deadlock-plus/links";
import { copySeed, pickVariant } from "@deadlock-plus/stats/dispatch/copy";
import { editionSignals, type Signal, type SignalFacts, type SignalId } from "@deadlock-plus/stats/dispatch/signals";
import type { Companion, Edition } from "@deadlock-plus/stats/dispatch/types";
import { SESSION_GAP_S } from "@deadlock-plus/stats/sessions";
import { VIDEO_VARIANTS, videoCopyKey } from "../../beats";
import type { SceneTiming } from "../../scene";
import type { SfxCue } from "../../sfx";
import {
    awardsPlan,
    awardsSfx,
    pickLineup,
    type AwardCandidate,
    type AwardId,
    type CategoryId,
    type Lineup,
} from "./plan";

/** Formatting from the main thread; the worker gets finished strings. */
export interface AwardsDeps {
    hero: (id: number) => string | undefined;
    number: (n: number) => string;
    /** A share from 0 to 1. */
    percent: (share: number) => string;
    /** Unix seconds as a short calendar date in `tz`. */
    day: (unixS: number, tz: string) => string;
    /** Unix seconds as the month's name alone, in `tz`. */
    monthName: (unixS: number, tz: string) => string;
}

/** A line to translate: `t(key, params)`, or `tn(key, count, params)` when `count` is set. */
export interface CopyRef {
    key: string;
    params: Record<string, string>;
    count?: number;
}

/** A number on screen and the edition field it comes from. */
export interface Figure {
    value: number;
    source: string;
}

export interface Nominee {
    /** The hero, mate, rival, month or date nominated; null when only the count is known. */
    label: string | null;
    /** Whose art the card shows: the winner's in gloat. */
    heroId: number | null;
    line: CopyRef;
    figures: Figure[];
    /** Performance of the Year only: the graded letter, null when ungraded. */
    grade?: string | null;
}

export interface Award {
    id: AwardId;
    signal: SignalId | null;
    /** The night's last and biggest award. */
    lead: boolean;
    title: CopyRef;
    /** The winner first. */
    nominees: Nominee[];
    ceremony: { nominees: CopyRef; envelope: CopyRef; goesTo: CopyRef };
    accept: CopyRef;
}

export interface CreditRow {
    text: CopyRef;
    names: string[];
    figure?: Figure;
}

export interface YearEndAwards {
    year: string;
    player: string | null;
    lineup: Lineup;
    preshow: { marquee: CopyRef; hook: CopyRef | null; figures: Figure[] };
    welcome: { line: CopyRef };
    /** In show order, the lead last. */
    awards: Award[];
    credits: { title: CopyRef; rows: CreditRow[] };
    end: { cta: CopyRef; url: string };
}

type Slots = Record<string, { counted: boolean }>;
const plain = { counted: false } as const;
const counted = { counted: true } as const;

/** Every copy slot the data can ask for, each with `VIDEO_VARIANTS` lines (and `_one`/`_other` when counted). */
export const YEAR_END_SLOTS = {
    y_preshow: { marquee: plain, hook: counted },
    y_welcome: { named: plain, plain },
    /** Shared by every award; each award in one night reads a different variant. */
    y_ceremony: { nominees: plain, envelope: plain, goes_to: plain },
    y_hero: { title: plain, nominee: counted, accept: counted, accept_one_trick: counted, accept_explorer: counted },
    y_month: {
        title: plain,
        title_comeback: plain,
        nominee: counted,
        nominee_comeback: counted,
        accept: counted,
        accept_comeback: counted,
    },
    y_performance: { title: plain, nominee: plain, accept: plain },
    y_supporting: { title: plain, nominee: counted, accept: counted, accept_duo: counted },
    y_breakthrough: { title: plain, nominee: counted, accept: counted },
    y_longest_run: { title: plain, nominee: counted, accept: counted },
    y_endurance: { title: plain, nominee: counted, accept: counted },
    y_villain: { title: plain, nominee: counted, accept: counted },
    y_credits: {
        title: plain,
        starring: plain,
        featuring: plain,
        with: plain,
        villain: plain,
        matches: counted,
        hours: counted,
        days: counted,
        heroes: counted,
    },
    y_end: { cta: plain },
} as const satisfies Record<string, Slots>;

type SlotBeat = keyof typeof YEAR_END_SLOTS;
type SlotOf<B extends SlotBeat> = keyof (typeof YEAR_END_SLOTS)[B] & string;

/** The signals each award can spend, strongest first when two fire. */
export const AWARD_SIGNALS: Readonly<Record<AwardId, readonly SignalId[]>> = {
    y_hero: ["one_trick", "explorer"],
    y_month: ["swing_month"],
    y_performance: ["big_game"],
    y_supporting: ["duo"],
    y_breakthrough: ["debut"],
    y_longest_run: ["streak"],
    y_endurance: ["marathon"],
    y_villain: ["nemesis"],
};

/** A category with data but no signal still competes, below any signal (signals score 0.5 and up). */
const FALLBACK: Readonly<Record<CategoryId, number>> = {
    y_performance: 0.3,
    y_longest_run: 0.25,
    y_supporting: 0.2,
    y_endurance: 0.15,
    y_breakthrough: 0.1,
    y_villain: 0.05,
};

const NOMINEES = 3;
const MIN_RUN = 3;
const MIN_SESSION = 3;
const MIN_MATE_GAMES = 3;
const MIN_DEBUT_GAMES = 2;
const MIN_RIVAL_LOSSES = 2;
const SITE_HOST = new URL(SITE_URL).host;

interface Ctx {
    e: Edition;
    deps: AwardsDeps;
    tz: string;
    seed: string;
    n: (v: number) => string;
}

function ref<B extends SlotBeat>(
    c: Ctx,
    beat: B,
    slot: SlotOf<B>,
    params: Record<string, string> = {},
    count?: number,
): CopyRef {
    const key = videoCopyKey(c.e.accountId, c.e.id, "year_end", beat, slot);
    return count === undefined ? { key, params } : { key, params, count };
}

/** The `i`-th award's ceremony line: one pick per night, stepped so no two awards read the same words. */
function ceremony(c: Ctx, slot: SlotOf<"y_ceremony">, i: number): CopyRef {
    const first = pickVariant(c.seed, `video.year_end.y_ceremony.${slot}`, VIDEO_VARIANTS);
    const n = ((first - 1 + i) % VIDEO_VARIANTS) + 1;
    return { key: `dispatch.video.year_end.y_ceremony.${slot}_${n}`, params: {} };
}

/**
 * A main line's variant number fixes its shape: 1 number-led, 2 name-, date- or year-led, 3 plain sentence,
 * 4 question, 5 exclamation. The hook and each award's acceptance step through them from one pick per night, so
 * no two beats of one video speak in the same shape.
 */
export const MAIN_SHAPES = ["number", "name", "plain", "question", "shout"] as const;

/** Slots whose variants follow `MAIN_SHAPES`. */
export const MAIN_SLOTS: readonly string[] = [
    "y_preshow.hook",
    "y_hero.accept",
    "y_hero.accept_one_trick",
    "y_hero.accept_explorer",
    "y_month.accept",
    "y_month.accept_comeback",
    "y_performance.accept",
    "y_supporting.accept",
    "y_supporting.accept_duo",
    "y_breakthrough.accept",
    "y_longest_run.accept",
    "y_endurance.accept",
    "y_villain.accept",
];

function mainLine(c: Ctx, line: CopyRef, i: number): CopyRef {
    const first = pickVariant(c.seed, "video.year_end.main", VIDEO_VARIANTS);
    const n = ((first - 1 + i) % VIDEO_VARIANTS) + 1;
    return { ...line, key: line.key.replace(/_\d+$/, `_${n}`) };
}

type Built = { nominees: Nominee[]; accept: (signal: Signal | null) => CopyRef; title?: CopyRef };

function heroAward(c: Ctx): Built | null {
    const rows = c.e.heroes
        .map((h, i) => ({ h, i, name: c.deps.hero(h.heroId) }))
        .filter((r): r is typeof r & { name: string } => r.h.games > 0 && r.name !== undefined)
        .sort((a, b) => b.h.games - a.h.games || b.h.playtimeS - a.h.playtimeS)
        .slice(0, NOMINEES);
    if (!rows.length) return null;
    const win = rows[0];
    return {
        nominees: rows.map(({ h, i, name }) => ({
            label: name,
            heroId: h.heroId,
            line: ref(c, "y_hero", "nominee", {}, h.games),
            figures: [{ value: h.games, source: `heroes[${i}].games` }],
        })),
        accept: (s) =>
            s?.id === "one_trick"
                ? ref(
                      c,
                      "y_hero",
                      "accept_one_trick",
                      { hero: win.name, share: c.deps.percent(s.facts.share) },
                      win.h.games,
                  )
                : s?.id === "explorer"
                  ? ref(c, "y_hero", "accept_explorer", { hero: win.name }, s.facts.heroes)
                  : ref(c, "y_hero", "accept", { hero: win.name }, win.h.games),
    };
}

function monthAward(c: Ctx, swing: SignalFacts["swing_month"] | null): Built | null {
    const months = (c.e.months ?? []).map((m, i) => ({ m, i })).filter(({ m }) => m.matches > 0);
    if (months.length < 2) return null;
    const name = (s: number) => c.deps.monthName(s, c.tz);
    if (swing) {
        const all = c.e.months!;
        const gains = all
            .flatMap((m, i) => {
                const before = all[i - 1];
                if (!before || !m.matches || !before.matches) return [];
                const points = Math.round(100 * (m.wins / m.matches - before.wins / before.matches));
                return points > 0 ? [{ m, i, points }] : [];
            })
            .sort((a, b) => Number(b.m === swing.month) - Number(a.m === swing.month) || b.points - a.points)
            .slice(0, NOMINEES);
        if (gains.length && gains[0].m === swing.month) {
            return {
                title: ref(c, "y_month", "title_comeback", { year: String(c.e.volume) }),
                nominees: gains.map(({ m, i, points }) => ({
                    label: name(m.monthStartS),
                    heroId: null,
                    line: ref(c, "y_month", "nominee_comeback", {}, points),
                    figures: [{ value: points, source: `months[${i}].wins/months[${i - 1}].wins` }],
                })),
                accept: () =>
                    ref(
                        c,
                        "y_month",
                        "accept_comeback",
                        { month: name(swing.month.monthStartS), before: name(swing.before.monthStartS) },
                        swing.points,
                    ),
            };
        }
    }
    const rows = months
        .filter(({ m }) => m.wins > 0)
        .sort((a, b) => b.m.wins - a.m.wins || b.m.matches - a.m.matches)
        .slice(0, NOMINEES);
    if (rows.length < 2) return null;
    const win = rows[0].m;
    return {
        nominees: rows.map(({ m, i }) => ({
            label: name(m.monthStartS),
            heroId: null,
            line: ref(c, "y_month", "nominee", { matches: c.n(m.matches) }, m.wins),
            figures: [
                { value: m.wins, source: `months[${i}].wins` },
                { value: m.matches, source: `months[${i}].matches` },
            ],
        })),
        accept: () =>
            ref(c, "y_month", "accept", { month: name(win.monthStartS), matches: c.n(win.matches) }, win.wins),
    };
}

function performanceAward(c: Ctx): Built | null {
    const best = c.e.bestGame;
    if (!best) return null;
    const pool = c.e.nominees?.some((g) => g.matchId === best.matchId) ? c.e.nominees : [best];
    const games = pool
        .map((g, i) => ({
            g,
            source: pool === c.e.nominees ? `nominees[${i}]` : "bestGame",
            hero: c.deps.hero(g.heroId),
        }))
        .filter((r): r is typeof r & { hero: string } => r.hero !== undefined && r.g.kills + r.g.assists > 0)
        .sort((a, b) => Number(b.g.matchId === best.matchId) - Number(a.g.matchId === best.matchId))
        .slice(0, NOMINEES);
    if (!games.length || games[0].g.matchId !== best.matchId) return null;
    const kda = (g: typeof best) => `${c.n(g.kills)}/${c.n(g.deaths)}/${c.n(g.assists)}`;
    const win = games[0];
    return {
        nominees: games.map(({ g, source, hero }) => ({
            label: hero,
            heroId: g.heroId,
            line: ref(c, "y_performance", "nominee", { hero, kda: kda(g), date: c.deps.day(g.startTime, c.tz) }),
            figures: [
                { value: g.kills, source: `${source}.kills` },
                { value: g.deaths, source: `${source}.deaths` },
                { value: g.assists, source: `${source}.assists` },
            ],
            grade: g.letter,
        })),
        accept: () =>
            ref(c, "y_performance", "accept", {
                hero: win.hero,
                kda: kda(win.g),
                date: c.deps.day(win.g.startTime, c.tz),
            }),
    };
}

const named = (p: Companion): p is Companion & { name: string } => !!p.name;

function supportingAward(c: Ctx): Built | null {
    const mates = c.e.mates
        .map((m, i) => ({ m, i }))
        .filter((r): r is { m: Companion & { name: string }; i: number } => named(r.m) && r.m.matches >= MIN_MATE_GAMES)
        .sort((a, b) => b.m.matches - a.m.matches)
        .slice(0, NOMINEES);
    if (!mates.length) return null;
    const win = mates[0].m;
    return {
        nominees: mates.map(({ m, i }) => ({
            label: m.name,
            heroId: null,
            line: ref(c, "y_supporting", "nominee", {}, m.matches),
            figures: [{ value: m.matches, source: `mates[${i}].matches` }],
        })),
        accept: (s) =>
            s?.id === "duo"
                ? ref(
                      c,
                      "y_supporting",
                      "accept_duo",
                      { name: win.name, share: c.deps.percent(s.facts.share) },
                      win.matches,
                  )
                : ref(c, "y_supporting", "accept", { name: win.name }, win.matches),
    };
}

function breakthroughAward(c: Ctx): Built | null {
    const fresh = new Set(c.e.newHeroes);
    const rows = c.e.heroes
        .map((h, i) => ({ h, i, name: c.deps.hero(h.heroId) }))
        .filter(
            (r): r is typeof r & { name: string } =>
                fresh.has(r.h.heroId) && r.h.games >= MIN_DEBUT_GAMES && r.name !== undefined,
        )
        .sort((a, b) => b.h.games - a.h.games)
        .slice(0, NOMINEES);
    if (!rows.length) return null;
    const win = rows[0];
    return {
        nominees: rows.map(({ h, i, name }) => ({
            label: name,
            heroId: h.heroId,
            line: ref(c, "y_breakthrough", "nominee", {}, h.games),
            figures: [{ value: h.games, source: `heroes[${i}].games` }],
        })),
        accept: () => ref(c, "y_breakthrough", "accept", { hero: win.name, year: String(c.e.volume) }, win.h.games),
    };
}

/** Win runs on the tape, longest first; an unscored match neither extends nor breaks one. */
function winRuns(c: Ctx): { length: number; startS: number }[] {
    const runs: { length: number; startS: number }[] = [];
    let cur: { length: number; startS: number } | null = null;
    for (const [startS, , outcome] of c.e.tape ?? []) {
        if (outcome === "unscored") continue;
        if (outcome === "win") {
            cur ??= { length: 0, startS };
            cur.length++;
        } else {
            if (cur) runs.push(cur);
            cur = null;
        }
    }
    if (cur) runs.push(cur);
    return runs.sort((a, b) => b.length - a.length || a.startS - b.startS);
}

function longestRunAward(c: Ctx): Built | null {
    const fromTape = winRuns(c).filter((r) => r.length >= MIN_RUN);
    const runs = c.e.tape
        ? fromTape.slice(0, NOMINEES).map((r) => ({ ...r, label: c.deps.day(r.startS, c.tz), source: "tape" }))
        : c.e.longestWin >= MIN_RUN
          ? [{ length: c.e.longestWin, label: null, source: "longestWin" }]
          : [];
    if (!runs.length) return null;
    return {
        nominees: runs.map((r) => ({
            label: r.label,
            heroId: null,
            line: ref(c, "y_longest_run", "nominee", {}, r.length),
            figures: [{ value: r.length, source: r.source }],
        })),
        accept: () => ref(c, "y_longest_run", "accept", { year: String(c.e.volume) }, runs[0].length),
    };
}

/** Sittings on the tape, as the stats group them: a gap of at most `SESSION_GAP_S` between matches. */
function sittings(c: Ctx): { matches: number; startS: number; durationS: number }[] {
    const out: { matches: number; startS: number; durationS: number; endS: number }[] = [];
    for (const [startS, , , , , , , durationS] of c.e.tape ?? []) {
        const cur = out.at(-1);
        if (cur && startS - cur.endS <= SESSION_GAP_S) {
            cur.matches++;
            cur.endS = Math.max(cur.endS, startS + durationS);
            cur.durationS = cur.endS - cur.startS;
        } else out.push({ matches: 1, startS, durationS, endS: startS + durationS });
    }
    return out.sort((a, b) => b.matches - a.matches || b.durationS - a.durationS);
}

function enduranceAward(c: Ctx): Built | null {
    const longest = c.e.stats.longestSession;
    const rows = c.e.tape
        ? sittings(c)
              .filter((s) => s.matches >= MIN_SESSION)
              .slice(0, NOMINEES)
              .map((s) => ({ ...s, source: "tape" }))
        : longest && longest.matches >= MIN_SESSION
          ? [{ ...longest, source: "stats.longestSession.matches" }]
          : [];
    if (!rows.length) return null;
    const win = rows[0];
    return {
        nominees: rows.map((s) => ({
            label: c.deps.day(s.startS, c.tz),
            heroId: null,
            line: ref(c, "y_endurance", "nominee", {}, s.matches),
            figures: [{ value: s.matches, source: s.source }],
        })),
        accept: () => ref(c, "y_endurance", "accept", { date: c.deps.day(win.startS, c.tz) }, win.matches),
    };
}

function villainAward(c: Ctx): Built | null {
    const pool = c.e.rivals?.length ? c.e.rivals : c.e.nemesis ? [c.e.nemesis] : [];
    const field = c.e.rivals?.length ? "rivals" : "nemesis";
    const rows = pool
        .map((r, i) => ({ r, losses: r.matches - r.wins, source: field === "rivals" ? `rivals[${i}]` : "nemesis" }))
        .filter((x): x is typeof x & { r: Companion & { name: string } } => named(x.r) && x.losses >= MIN_RIVAL_LOSSES)
        .sort((a, b) => b.losses - a.losses)
        .slice(0, NOMINEES);
    if (!rows.length) return null;
    const win = rows[0];
    return {
        nominees: rows.map(({ r, losses, source }) => ({
            label: r.name,
            heroId: null,
            line: ref(c, "y_villain", "nominee", { matches: c.n(r.matches) }, losses),
            figures: [
                { value: losses, source: `${source}.matches-wins` },
                { value: r.matches, source: `${source}.matches` },
            ],
        })),
        accept: () => ref(c, "y_villain", "accept", { name: win.r.name, matches: c.n(win.r.matches) }, win.losses),
    };
}

function credits(c: Ctx, played: ReadonlySet<AwardId>): YearEndAwards["credits"] {
    const { e } = c;
    const rows: CreditRow[] = [];
    const player = e.playerName?.trim();
    if (player) rows.push({ text: ref(c, "y_credits", "starring"), names: [player] });
    const total = (slot: "matches" | "hours" | "days" | "heroes", value: number, source: string) => {
        if (value > 0) rows.push({ text: ref(c, "y_credits", slot, {}, value), names: [], figure: { value, source } });
    };
    total("matches", e.stats.matches, "stats.matches");
    total("hours", Math.round(e.stats.playtimeS / 3600), "stats.playtimeS");
    total("days", e.stats.daysPlayed, "stats.daysPlayed");
    if (e.heroes.length > 1) total("heroes", e.heroes.length, "heroes.length");
    const featuring = [...e.heroes]
        .sort((a, b) => b.games - a.games)
        .flatMap((h) => c.deps.hero(h.heroId) ?? [])
        .slice(0, NOMINEES);
    if (featuring.length) rows.push({ text: ref(c, "y_credits", "featuring"), names: featuring });
    // A person a category already crowned is not credited again.
    if (!played.has("y_supporting")) {
        const mates = e.mates.filter((m) => named(m) && m.matches >= MIN_MATE_GAMES).map((m) => m.name!);
        if (mates.length) rows.push({ text: ref(c, "y_credits", "with"), names: mates.slice(0, 2) });
    }
    if (!played.has("y_villain") && e.nemesis?.name && e.nemesis.matches > e.nemesis.wins)
        rows.push({ text: ref(c, "y_credits", "villain"), names: [e.nemesis.name] });
    return { title: ref(c, "y_credits", "title", { year: String(e.volume) }), rows };
}

const BUILDERS: Record<CategoryId, (c: Ctx) => Built | null> = {
    y_performance: performanceAward,
    y_supporting: supportingAward,
    y_breakthrough: breakthroughAward,
    y_longest_run: longestRunAward,
    y_endurance: enduranceAward,
    y_villain: villainAward,
};

/**
 * The Awards Night for a Year-End edition: which awards play, in what order, with whose names and numbers, and
 * the copy keys to say it in. The strongest signal an award can carry decides the closing award; each signal is
 * spent on one award at most; an award without data is not handed out.
 */
export function yearEndAwards(
    edition: Edition,
    deps: AwardsDeps,
    signals: readonly Signal[] = editionSignals(edition),
): YearEndAwards {
    const c: Ctx = {
        e: edition,
        deps,
        tz: edition.window.tz,
        seed: copySeed(edition.accountId, edition.id),
        n: deps.number,
    };
    const signalFor = (id: AwardId): Signal | null => signals.find((s) => AWARD_SIGNALS[id].includes(s.id)) ?? null;

    const built = new Map<AwardId, Built>();
    const candidates: AwardCandidate[] = [];
    const offer = (id: AwardId, b: Built | null, signal: Signal | null, fallback: number) => {
        if (!b) return;
        built.set(id, b);
        candidates.push(signal ? { id, strength: signal.strength, signal: signal.id } : { id, strength: fallback });
    };
    offer("y_hero", heroAward(c), signalFor("y_hero"), 0);
    const swing = signalFor("y_month");
    const month = monthAward(c, swing?.id === "swing_month" ? swing.facts : null);
    // Only a comeback title spends the swing; a plain Month of the Year carries no signal.
    offer("y_month", month, month?.title ? swing : null, 0);
    for (const id of Object.keys(BUILDERS) as CategoryId[]) {
        const s = signalFor(id);
        offer(id, BUILDERS[id](c), s, FALLBACK[id]);
    }

    const lineup = pickLineup(candidates);
    const year = String(edition.volume);
    const awards = lineup.awards.map((a, i): Award => {
        const b = built.get(a.id)!;
        const signal = a.signal ? signals.find((s) => s.id === a.signal)! : null;
        return {
            id: a.id,
            signal: a.signal ?? null,
            lead: a.id === lineup.lead,
            title: b.title ?? ref(c, a.id, "title", { year }),
            nominees: b.nominees,
            ceremony: {
                nominees: ceremony(c, "nominees", i),
                envelope: ceremony(c, "envelope", i),
                goesTo: ceremony(c, "goes_to", i),
            },
            accept: mainLine(c, b.accept(signal), i + 1),
        };
    });

    const player = edition.playerName?.trim() || null;
    const matches = edition.stats.matches;
    return {
        year,
        player,
        lineup,
        preshow: {
            marquee: ref(c, "y_preshow", "marquee", { year }),
            hook: matches > 0 ? mainLine(c, ref(c, "y_preshow", "hook", { year }, matches), 0) : null,
            figures: matches > 0 ? [{ value: matches, source: "stats.matches" }] : [],
        },
        welcome: {
            line: player ? ref(c, "y_welcome", "named", { player, year }) : ref(c, "y_welcome", "plain", { year }),
        },
        awards,
        credits: credits(c, new Set(lineup.awards.map((a) => a.id))),
        end: { cta: ref(c, "y_end", "cta"), url: SITE_HOST },
    };
}

/** The night's sound effects on the export's bar grid, for `ScenePrep.sfx`. */
export function yearEndSfx(data: Pick<YearEndAwards, "lineup">): (timing: SceneTiming) => SfxCue[] {
    return (timing) => awardsSfx(awardsPlan(timing.bars, data.lineup), timing.barSeconds);
}
