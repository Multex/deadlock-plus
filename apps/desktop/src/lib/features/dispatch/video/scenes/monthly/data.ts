import { copySeed, pickVariant } from "@deadlock-plus/stats/dispatch/copy";
import { editionSignals, type Signal, type SignalFacts, type SignalId } from "@deadlock-plus/stats/dispatch/signals";
import type { Edition } from "@deadlock-plus/stats/dispatch/types";
import { videoCopyKey, type Beat } from "../../beats";
import type { SceneTiming } from "../../scene";
import type { SfxCue } from "../../sfx";
import { interviewTopic, monthlyPlan, type MonthlyBeatId, type MonthlyCast, monthlyCast } from "./plan";
import { isCounted, type CoverLine, type FeatureAngle, type InterviewTopic } from "./slots";

type Params = Record<string, string | number>;

export interface MonthlyVideoDeps {
    hero: (heroId: number) => string;
    rank: (badge: number) => string;
    number: (n: number) => string;
    percent: (share: number) => string;
    date: (unixS: number, tz: string, options: Intl.DateTimeFormatOptions) => string;
    duration: (seconds: number) => string;
}

/** A line to translate: `t(key, params)`, or `tn(key, count, params)` when `count` is set. */
export interface Copy {
    key: string;
    params: Params;
    count?: number;
}

/** A number drawn on screen, with the edition field it comes from. Never 0: a beat without it is dropped. */
export interface Stat {
    value: number;
    source: string;
}

/** The shot's line; a deathless game keeps its 0. */
export interface Kda {
    kills: number;
    deaths: number;
    assists: number;
}

/** One day of the month on the contact sheet; `heroId` is the hero played most that day, when the tape says. */
export interface TakeFrame {
    day: number;
    matches: number;
    wins: number;
    heroId: number | null;
}

export interface FlashData {
    slate: Copy;
    hook: Copy;
    matches: Stat;
    /** The studio backdrop: the month's most played hero. */
    heroId: number | null;
}

export interface TakesData {
    title: Copy;
    caption: Copy;
    frames: TakeFrame[];
    /** The frame the loupe glides to. */
    loupe: number;
    signal: SignalId | null;
}

export interface ShotData {
    label: Copy;
    caption: Copy;
    heroId: number;
    grade: string | null;
    kda: Kda;
    netWorth: Stat | null;
    /** The contact-sheet frame the grease pencil circles; null when the game is not on the sheet. */
    frame: number | null;
}

export interface Swatch {
    heroId: number;
    games: Stat;
    /** Of the month's matches, 0-1: the swatch's width. */
    share: number;
    debut: boolean;
}

export interface WardrobeData {
    title: Copy;
    caption: Copy;
    debutTag: Copy | null;
    swatches: Swatch[];
    /** The hero pulled forward off the rail. */
    lead: number;
}

export interface InterviewData {
    title: Copy;
    qa: { topic: InterviewTopic; q: Copy; a: Copy }[];
}

export interface FeatureData {
    angle: FeatureAngle;
    kicker: Copy;
    headline: Copy;
    deck: Copy;
    stats: Stat[];
    /** Before and after, for a climb or a slide. */
    badges: { start: number; end: number } | null;
    heroId: number | null;
}

export interface CoverData {
    title: Copy;
    heroId: number | null;
    lines: { line: CoverLine; copy: Copy; page: number }[];
}

export interface StandData {
    tag: Copy;
    price: Copy;
    serial: string;
}

export interface MonthlyBeats {
    m_flash: FlashData;
    m_takes?: TakesData;
    m_shot?: ShotData;
    m_wardrobe?: WardrobeData;
    m_interview?: InterviewData;
    m_feature?: FeatureData;
    m_cover: CoverData;
    m_stand: StandData;
    m_end: { cta: Copy };
}

export interface MonthlyVideoData {
    cast: MonthlyCast;
    beats: MonthlyBeats;
}

const DAY_S = 86400;
const SWATCHES = 6;
const HERO_TITLE_SHARE = 0.25;

const byPlay = (a: Edition["heroes"][number], b: Edition["heroes"][number]) =>
    b.games - a.games || b.playtimeS - a.playtimeS || a.heroId - b.heroId;

const localParts = new Map<string, Intl.DateTimeFormat>();
/** The local calendar date of `unixS` in `tz`. */
function civil(unixS: number, tz: string): { y: number; m: number; d: number } {
    let f = localParts.get(tz);
    if (!f) {
        f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
        localParts.set(tz, f);
    }
    const [y, m, d] = f.format(unixS * 1000).split("-").map(Number);
    return { y: y!, m: m!, d: d! };
}

/** One frame per day of the month: from `days` when frozen, else counted off the tape. */
export function takeFrames(e: Edition): TakeFrame[] {
    const { tz, startS } = e.window;
    const first = civil(startS, tz);
    const length = e.days?.length ?? new Date(Date.UTC(first.y, first.m, 0)).getUTCDate();
    const frames: TakeFrame[] = Array.from({ length }, (_, i) => ({
        day: i + 1,
        matches: e.days?.[i]?.matches ?? 0,
        wins: e.days?.[i]?.wins ?? 0,
        heroId: null,
    }));
    const heroGames = frames.map(() => new Map<number, number>());
    for (const [s, heroId, outcome] of e.tape ?? []) {
        const c = civil(s, tz);
        if (c.y !== first.y || c.m !== first.m) continue;
        const i = c.d - 1;
        if (!frames[i]) continue;
        if (!e.days) {
            frames[i].matches++;
            if (outcome === "win") frames[i].wins++;
        }
        heroGames[i]!.set(heroId, (heroGames[i]!.get(heroId) ?? 0) + 1);
    }
    heroGames.forEach((games, i) => {
        const top = [...games].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
        if (top) frames[i]!.heroId = top[0];
    });
    return frames;
}

function frameOf(e: Edition, frames: TakeFrame[], unixS: number): number | null {
    const first = civil(e.window.startS, e.window.tz);
    const c = civil(unixS, e.window.tz);
    return c.y === first.y && c.m === first.m && c.d <= frames.length ? c.d - 1 : null;
}

/** The busiest day on the sheet: the frozen busiest day when it is there, else the frame with the most matches. */
function busiestFrame(e: Edition, frames: TakeFrame[]): number {
    const frozen = e.stats.busiestDay && frameOf(e, frames, e.stats.busiestDay.dayStartS);
    if (frozen !== null && frozen !== undefined && frames[frozen]!.matches > 0) return frozen;
    return frames.reduce((best, f, i) => (f.matches > frames[best]!.matches ? i : best), 0);
}

const stat = (value: number, source: string): Stat => ({ value, source });

/** The video's words and numbers for one frozen edition: copy as keys, numbers with their source. */
export function monthlyVideoData(
    e: Edition,
    deps: MonthlyVideoDeps,
    previous?: Edition | null,
): MonthlyVideoData {
    const signals = editionSignals(e, previous);
    const cast = monthlyCast(e, signals);
    const { tz } = e.window;
    const seed = copySeed(e.accountId, e.id);
    const n = deps.number;
    const day = (s: number) => deps.date(s, tz, { day: "numeric", month: "long" });
    const month = deps.date(e.window.startS, tz, { month: "long" });
    const heroes = [...e.heroes].filter((h) => h.games > 0).sort(byPlay);
    const top = heroes[0];
    const matches = e.stats.matches;

    const copy = (beat: MonthlyBeatId, slot: string, params: Params = {}, count?: number): Copy => {
        if (isCounted(beat, slot) !== (count !== undefined)) throw new Error(`${beat}.${slot}: count mismatch`);
        const key = videoCopyKey(e.accountId, e.id, "monthly", beat, slot);
        return count === undefined ? { key, params } : { key, params, count };
    };

    /** Params and the main count each signal's lines take. */
    const told = (s: Signal): { params: Params; count?: number; stats: Stat[] } => {
        const f = s.facts as SignalFacts[typeof s.id];
        switch (s.id) {
            case "climb":
            case "slide": {
                const r = f as SignalFacts["climb"];
                return {
                    params: { start: deps.rank(r.startBadge), end: deps.rank(r.endBadge) },
                    stats: [],
                };
            }
            case "streak":
                return { params: { wins: n(e.longestWin) }, count: e.longestWin, stats: [stat(e.longestWin, "longestWin")] };
            case "losing_then_winning": {
                const r = f as SignalFacts["losing_then_winning"];
                return {
                    params: { losses: n(r.losses), wins: n(r.wins), of: n(r.of) },
                    stats: [stat(r.losses, "tape"), stat(r.wins, "tape"), stat(r.of, "tape")],
                };
            }
            case "marathon": {
                const r = f as SignalFacts["marathon"];
                return {
                    params: { matches: n(r.matches), duration: deps.duration(r.durationS), date: day(r.startS) },
                    count: r.matches,
                    stats: [stat(r.matches, "stats.longestSession.matches")],
                };
            }
            case "duo": {
                const r = f as SignalFacts["duo"];
                return {
                    params: { mate: r.mate.name!, share: deps.percent(r.share) },
                    count: r.mate.matches,
                    stats: [stat(r.mate.matches, "mates[0].matches")],
                };
            }
            case "nemesis": {
                const r = f as SignalFacts["nemesis"];
                return {
                    params: { rival: r.rival.name!, matches: n(r.rival.matches) },
                    count: r.losses,
                    stats: [stat(r.losses, "nemesis"), stat(r.rival.matches, "nemesis.matches")],
                };
            }
            case "one_trick": {
                const r = f as SignalFacts["one_trick"];
                return {
                    params: { hero: deps.hero(r.heroId), share: deps.percent(r.share) },
                    count: r.games,
                    stats: [stat(r.games, "heroes[0].games")],
                };
            }
            case "explorer": {
                const r = f as SignalFacts["explorer"];
                return { params: { heroes: n(r.heroes) }, count: r.heroes, stats: [stat(r.heroes, "heroes")] };
            }
            case "debut": {
                const r = f as SignalFacts["debut"];
                return { params: { hero: deps.hero(r.heroId) }, count: r.games, stats: [stat(r.games, "heroes.games")] };
            }
            case "night_owl":
            case "weekender": {
                const r = f as SignalFacts["night_owl"];
                return { params: { share: deps.percent(r.share) }, stats: [] };
            }
            case "grinder": {
                const r = f as SignalFacts["grinder"];
                return {
                    params: { days: n(r.windowDays) },
                    count: r.daysPlayed,
                    stats: [stat(r.daysPlayed, "stats.daysPlayed")],
                };
            }
            case "dry_spell": {
                const r = f as SignalFacts["dry_spell"];
                return {
                    params: { start: day(r.startS), end: day(r.endS - DAY_S) },
                    count: r.length,
                    stats: [stat(r.length, "days")],
                };
            }
            case "winning":
            case "losing": {
                const r = f as SignalFacts["winning"];
                const count = s.id === "winning" ? r.wins : r.losses;
                return { params: { rate: deps.percent(r.winrate) }, count, stats: [stat(count, `stats.${s.id === "winning" ? "wins" : "losses"}`)] };
            }
            case "vs_last": {
                const r = f as SignalFacts["vs_last"];
                return {
                    params: { matches: n(r.matches), prev: n(r.prevMatches) },
                    stats: [stat(r.matches, "stats.matches"), stat(r.prevMatches, "previous.stats.matches")],
                };
            }
            case "mvp": {
                const r = f as SignalFacts["mvp"];
                return { params: {}, count: r.placements, stats: [stat(r.placements, "combat.mvpRankCounts")] };
            }
            case "big_game": {
                const g = (f as SignalFacts["big_game"]).game;
                return { params: { hero: deps.hero(g.heroId), grade: g.letter ?? "" }, stats: [] };
            }
            default:
                return { params: {}, stats: [] };
        }
    };
    const variant = (s: Signal): string => (s.id === "vs_last" ? interviewTopic(s) : s.id);
    const castOf = (id: MonthlyBeatId) => cast.beats.find((b) => b.id === id);
    const counted = (beat: MonthlyBeatId, slot: string, params: Params, count: number | undefined) =>
        copy(beat, slot, params, isCounted(beat, slot) ? count : undefined);

    const beats: MonthlyBeats = {
        m_flash: {
            slate: e.playerName
                ? copy("m_flash", "slate", { month, player: e.playerName })
                : copy("m_flash", "slate_anon", { month }),
            hook: copy("m_flash", "hook", { month }, matches),
            matches: stat(matches, "stats.matches"),
            heroId: top?.heroId ?? null,
        },
        m_cover: { title: copy("m_cover", "title_month", { month }), heroId: top?.heroId ?? null, lines: [] },
        m_stand: standOf(),
        m_end: { cta: copy("m_end", "cta") },
    };

    const frames = takeFrames(e);
    const takesCast = castOf("m_takes");
    if (takesCast) {
        const loupe = busiestFrame(e, frames);
        const s = takesCast.signals[0];
        const t = s && told(s);
        const first = civil(e.window.startS, tz);
        const loupeDay = deps.date(Date.UTC(first.y, first.m - 1, loupe + 1, 12) / 1000, "UTC", {
            day: "numeric",
            month: "long",
        });
        beats.m_takes = {
            title: copy("m_takes", "title", { month }),
            caption: s
                ? counted("m_takes", `caption_${s.id}`, t!.params, t!.count)
                : copy("m_takes", "caption_busiest", { date: loupeDay }, frames[loupe]!.matches),
            frames,
            loupe,
            signal: s?.id ?? null,
        };
    }

    const shotCast = castOf("m_shot");
    if (shotCast && e.bestGame) {
        const g = e.bestGame;
        const kda = `${n(g.kills)}/${n(g.deaths)}/${n(g.assists)}`;
        const big = shotCast.signals[0]?.id === "big_game" && g.letter;
        beats.m_shot = {
            label: copy("m_shot", "label"),
            caption: big
                ? copy("m_shot", "caption_big_game", { hero: deps.hero(g.heroId), kda, grade: g.letter!, date: day(g.startTime) })
                : copy("m_shot", "caption_plain", { hero: deps.hero(g.heroId), kda, date: day(g.startTime) }),
            heroId: g.heroId,
            grade: g.letter ?? null,
            kda: { kills: g.kills, deaths: g.deaths, assists: g.assists },
            netWorth: g.netWorth > 0 ? stat(g.netWorth, "bestGame.netWorth") : null,
            frame: takesCast ? frameOf(e, frames, g.startTime) : null,
        };
    }

    const wardrobeCast = castOf("m_wardrobe");
    if (wardrobeCast && top) {
        const fresh = new Set(e.newHeroes);
        const s = wardrobeCast.signals[0];
        const lead = s?.id === "debut" ? (s.facts as SignalFacts["debut"]).heroId : top.heroId;
        const swatches = heroes.slice(0, SWATCHES);
        if (!swatches.some((h) => h.heroId === lead)) swatches[swatches.length - 1] = heroes.find((h) => h.heroId === lead)!;
        const t = s && told(s);
        beats.m_wardrobe = {
            title: copy("m_wardrobe", "title", { month }),
            caption: s
                ? counted("m_wardrobe", `caption_${s.id}`, t!.params, t!.count)
                : copy("m_wardrobe", "caption_plain", { hero: deps.hero(top.heroId) }, top.games),
            debutTag: swatches.some((h) => fresh.has(h.heroId)) ? copy("m_wardrobe", "debut_tag") : null,
            swatches: swatches.map((h) => ({
                heroId: h.heroId,
                games: stat(h.games, "heroes.games"),
                share: matches > 0 ? h.games / matches : 0,
                debut: fresh.has(h.heroId),
            })),
            lead,
        };
    }

    const interviewCast = castOf("m_interview");
    if (interviewCast?.topics) {
        const bySignal = new Map(interviewCast.signals.map((s) => [interviewTopic(s), s]));
        beats.m_interview = {
            title: copy("m_interview", "title"),
            qa: interviewCast.topics.map((topic) => {
                const s = bySignal.get(topic);
                let a: Copy;
                if (s) {
                    const t = told(s);
                    a = counted("m_interview", `${topic}_a`, t.params, t.count);
                } else if (topic === "busiest") {
                    const b = e.stats.busiestDay!;
                    a = copy("m_interview", "busiest_a", { date: day(b.dayStartS) }, b.matches);
                } else if (topic === "mate") {
                    const m = e.mates[0]!;
                    a = copy("m_interview", "mate_a", { mate: m.name! }, m.matches);
                } else {
                    a = copy("m_interview", "hours_a", { hours: deps.duration(e.stats.playtimeS) });
                }
                return { topic, q: copy("m_interview", `${topic}_q`, { month }), a };
            }),
        };
    }

    const featureCast = castOf("m_feature");
    const fs = featureCast?.signals[0];
    if (fs) {
        const angle = variant(fs) as FeatureAngle;
        const t = told(fs);
        const params = { ...t.params, month };
        const r = fs.id === "climb" || fs.id === "slide" ? (fs.facts as SignalFacts["climb"]) : null;
        const heroOf =
            fs.id === "one_trick" ? (fs.facts as SignalFacts["one_trick"]).heroId : (top?.heroId ?? null);
        beats.m_feature = {
            angle,
            kicker: copy("m_feature", "kicker", { month }),
            headline: copy("m_feature", `headline_${angle}`, params),
            deck: counted("m_feature", `deck_${angle}`, params, t.count),
            stats: t.stats,
            badges: r && { start: r.startBadge, end: r.endBadge },
            heroId: heroOf,
        };
    }

    const coverCast = castOf("m_cover")!;
    const topShare = top && matches > 0 ? top.games / matches : 0;
    beats.m_cover = {
        title:
            top && topShare >= HERO_TITLE_SHARE
                ? copy("m_cover", "title_hero", { hero: deps.hero(top.heroId) })
                : copy("m_cover", "title_month", { month }),
        heroId: top?.heroId ?? null,
        lines: [
            ...coverCast.signals.map((s): { line: CoverLine; params: Params; count?: number } => {
                const t = told(s);
                return { line: variant(s) as CoverLine, params: t.params, count: t.count };
            }),
            ...coverCast.facts.map((f): { line: CoverLine; params: Params; count?: number } => {
                const s = e.stats;
                if (f === "record") return { line: "record" as const, params: { wins: n(s.wins), losses: n(s.losses) }, count: undefined };
                if (f === "hours") return { line: "hours" as const, params: { hours: deps.duration(s.playtimeS) }, count: undefined };
                return { line: "days" as const, params: {}, count: s.daysPlayed };
            }),
        ].map((l, i) => {
            const page = 2 + 2 * i + pickVariant(seed, `video.monthly.m_cover.page_${i}`, 2) - 1;
            return { line: l.line, copy: counted("m_cover", `line_${l.line}`, { ...l.params, page: n(page) }, l.count), page };
        }),
    };

    return { cast, beats };

    function standOf(): StandData {
        const end = civil(e.window.endS, tz);
        const next = Date.UTC(end.y, end.m - 1, 15, 12) / 1000;
        const out = Date.UTC(end.y, end.m, 1, 12) / 1000;
        return {
            tag: copy("m_stand", "tag", {
                month: deps.date(next, "UTC", { month: "long" }),
                date: deps.date(out, "UTC", { day: "numeric", month: "long" }),
            }),
            price: copy("m_stand", "price"),
            serial: String(e.accountId).padStart(9, "0"),
        };
    }
}

/** Every line the video can draw, for translating up front and for the copy tests. */
export function allCopy(data: MonthlyVideoData): Copy[] {
    const b = data.beats;
    return [
        b.m_flash.slate,
        b.m_flash.hook,
        ...(b.m_takes ? [b.m_takes.title, b.m_takes.caption] : []),
        ...(b.m_shot ? [b.m_shot.label, b.m_shot.caption] : []),
        ...(b.m_wardrobe ? [b.m_wardrobe.title, b.m_wardrobe.caption, ...(b.m_wardrobe.debutTag ? [b.m_wardrobe.debutTag] : [])] : []),
        ...(b.m_interview ? [b.m_interview.title, ...b.m_interview.qa.flatMap((x) => [x.q, x.a])] : []),
        ...(b.m_feature ? [b.m_feature.kicker, b.m_feature.headline, b.m_feature.deck] : []),
        b.m_cover.title,
        ...b.m_cover.lines.map((l) => l.copy),
        b.m_stand.tag,
        b.m_stand.price,
        b.m_end.cta,
    ];
}

/** Every number the video draws. */
export function allStats(data: MonthlyVideoData): Stat[] {
    const b = data.beats;
    return [
        b.m_flash.matches,
        ...(b.m_shot?.netWorth ? [b.m_shot.netWorth] : []),
        ...(b.m_wardrobe?.swatches.map((s) => s.games) ?? []),
        ...(b.m_feature?.stats ?? []),
    ];
}

/** When the interview's `i`th of `n` questions and its answer land, in seconds. */
export function interviewMoments(beat: Beat, i: number, n: number, barSeconds: number) {
    const span = (beat.bars * barSeconds) / n;
    const question = beat.bar * barSeconds + i * span;
    return { question, answer: question + barSeconds / 2 };
}

/** The cover's beats: the shutter on the downbeat, the masthead on beat 3, coverlines a half bar apart from bar 2. */
export function coverMoments(beat: Beat, lines: number, barSeconds: number) {
    const start = beat.bar * barSeconds;
    return {
        shutter: start,
        masthead: start + barSeconds / 2,
        lines: Array.from({ length: lines }, (_, i) => start + barSeconds * (1 + i / 2)),
    };
}

/** The game sounds the Monthly's beats land on, on the export's bar grid. */
export function monthlySfx(data: MonthlyVideoData, timing: Pick<SceneTiming, "bars" | "barSeconds">): SfxCue[] {
    const { barSeconds } = timing;
    const cues: SfxCue[] = [];
    for (const beat of monthlyPlan(data.cast, timing.bars)) {
        const at = beat.bar * barSeconds;
        switch (beat.id) {
            case "m_flash":
                cues.push({ cue: "shutter", atSeconds: at }, { cue: "flash", atSeconds: at });
                break;
            case "m_takes":
            case "m_wardrobe":
                cues.push({ cue: "page", atSeconds: at });
                break;
            case "m_shot":
                cues.push(
                    { cue: "grease_pencil", atSeconds: at },
                    { cue: "shutter", atSeconds: at + barSeconds },
                    { cue: "flash", atSeconds: at + barSeconds },
                );
                break;
            case "m_interview": {
                const n = data.beats.m_interview?.qa.length ?? 0;
                for (let i = 0; i < n; i++) {
                    const m = interviewMoments(beat, i, n, barSeconds);
                    cues.push({ cue: "type_tick", atSeconds: m.question }, { cue: "type_tick", atSeconds: m.answer });
                }
                break;
            }
            case "m_feature":
                cues.push({ cue: "slam", atSeconds: at });
                break;
            case "m_cover": {
                const m = coverMoments(beat, data.beats.m_cover.lines.length, barSeconds);
                cues.push({ cue: "shutter", atSeconds: m.shutter }, { cue: "flash", atSeconds: m.shutter });
                cues.push({ cue: "slam", atSeconds: m.masthead });
                for (const t of m.lines) cues.push({ cue: "slam", atSeconds: t, gain: 0.7 });
                break;
            }
            case "m_stand":
                cues.push({ cue: "stand_drop", atSeconds: at });
                break;
            case "m_end":
                break;
        }
    }
    return cues.sort((a, b) => a.atSeconds - b.atSeconds);
}
