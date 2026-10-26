import type {
    Companion,
    DispatchParam,
    DispatchStory,
    DispatchStoryKind,
    DispatchText,
    Edition,
    EditionHero,
    EditionKind,
} from "@deadlock-plus/stats/dispatch/types";
import { copySeed } from "@deadlock-plus/stats/dispatch/copy";
import { editionSignals } from "@deadlock-plus/stats/dispatch/signals";
import { arrangeStories, storyCopy, type StoryCopy } from "@deadlock-plus/stats/dispatch/stories";
import type { ViewDeps } from "$lib/features/front-page/front-page-view";
import { PAPER_TOKENS } from "$lib/features/front-page/paper/tokens";
import type { Brief } from "$lib/features/front-page/paper/types";

type Params = Record<string, string | number>;

export interface DispatchViewDeps extends Pick<ViewDeps, "number" | "hero"> {
    t: (key: string, params?: Params) => string;
    tn: (key: string, count: number, params?: Params) => string;
    /** Unix seconds as a calendar date in `tz`. */
    day: (unixS: number, tz: string) => string;
    /** Both ends inclusive. */
    dayRange: (firstS: number, lastS: number, tz: string) => string;
    month: (unixS: number, tz: string) => string;
    /** A share from 0 to 1. */
    percent: (share: number) => string;
    duration: (seconds: number) => string;
    netWorth: (value: number) => string;
    rank: (badge: number) => string;
}

export const SECTION_IDS = ["front", "stories", "numbers", "best_game", "heroes", "people"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const DISPATCH_PAPER = { width: 720, height: 1080 } as const;

export type CardAspect = "9:16" | "1:1" | "16:9";

/** `footer` is the export footer's slot under the paper; `scale` sizes the section's type; `photo` its picture. */
export const CARD_SIZES: Record<
    CardAspect,
    { width: number; height: number; footer: number; scale: number; photo: number }
> = {
    "9:16": { width: 540, height: 960, footer: 56, scale: 1.7, photo: 360 },
    "1:1": { width: 720, height: 720, footer: 60, scale: 1.5, photo: 250 },
    "16:9": { width: 960, height: 540, footer: 72, scale: 1.35, photo: 270 },
};

/**
 * Ink overrides on the paper's `--fp-*` tokens, as a `style` value for the sheet's content. The specials print in
 * gold: their spot ink is the paper's own gold text ink, already held to 4.5:1, and `--dp-rule` is for lines only.
 */
const GOLD = `--fp-spot: ${PAPER_TOKENS["hk-ink"]}; --dp-rule: oklch(0.62 0.115 82)`;
export const KIND_INKS: Record<EditionKind, string> = { weekly: "", monthly: "", collectors: GOLD, year_end: GOLD };

export const COLUMN_MAX = 4;
export const HERO_ROWS = 5;
export const MATE_ROWS = 3;

export interface DispatchStoryView {
    id: string;
    kind: DispatchStoryKind;
    headline: string;
    deck: string;
    matchId?: number;
}

export type StoryRole = "banner" | "column" | "brief";

/**
 * Character caps for a headline in each role, sized to the narrowest layout that prints it (a Monthly coverline,
 * a Weekly column). Over the cap the tail goes first, then the kicker; the core line alone always fits.
 */
export const HEADLINE_CAPS: Record<StoryRole, number> = { banner: 72, column: 56, brief: 56 };

const LABEL_END = /:\s*$/;
const CLOSED = /[!?.\u2026]\s*$/;

export const roleAt = (position: number): StoryRole =>
    position === 0 ? "banner" : position <= COLUMN_MAX ? "column" : "brief";

/** What the view needs to vary its words: the same kind's earlier editions. */
export interface EditionCopyContext {
    /** Ids of every earlier edition of this kind, oldest first; without it only `previous` is avoided. */
    chain?: readonly string[];
    previous?: Edition | null;
}

export interface NumberLine {
    id: "matches" | "record" | "winrate" | "playtime" | "kda";
    label: string;
    value: string;
}

export interface HeroLine {
    id: number;
    hero: string;
    games: string;
    wins: string;
    playtime: string;
}

export interface PersonLine {
    id: number;
    name: string;
    line: string;
}

export interface BestGameView {
    matchId: number;
    hero: string;
    art: string | null;
    kda: string;
    netWorth: string;
    /** `null` when the game was not graded. */
    grade: string | null;
    date: string;
}

export interface EditionView {
    id: string;
    label: string;
    titles: Record<SectionId, string>;
    kind: Edition["window"]["kind"];
    /** "This week so far": not issued, still changing. */
    live: boolean;
    masthead: { name: string; edition: string; issue: string; date: string };
    /** The Collector's Copy foil seal. */
    seal?: { title: string; season?: string };
    banner?: DispatchStoryView;
    columns: DispatchStoryView[];
    briefs: Brief[];
    photo?: { src: string | null; alt: string; caption: string };
    /** Every story in page order: `banner`, then `columns`, then the briefs. Absent on hand-built views. */
    stories?: DispatchStoryView[];
    /** Empty when the edition has no matches. */
    numbers: NumberLine[];
    bestGame?: BestGameView;
    /** Most played first. */
    heroes: HeroLine[];
    people?: { mates: PersonLine[]; nemesis?: PersonLine };
}

const byPlay = (a: EditionHero, b: EditionHero) =>
    b.games - a.games || b.playtimeS - a.playtimeS || a.heroId - b.heroId;

/** One story's headline and deck in the words its copy plan picked, fitted to `role`. */
export function renderStory(
    copy: StoryCopy,
    role: StoryRole,
    resolve: (p: DispatchParam) => string,
    deps: Pick<DispatchViewDeps, "t" | "tn">,
): { headline: string; deck: string } {
    const { t, tn } = deps;
    const params: Params = Object.fromEntries(Object.entries(copy.params).map(([k, p]) => [k, resolve(p)]));
    for (const [k, key] of Object.entries(copy.phrases)) params[k] = t(key);
    const text = (s: DispatchText) => (s.count === undefined ? t(s.key, params) : tn(s.key, s.count, params));
    const core = text(copy.core);
    const label = copy.kicker && role !== "brief" ? t(copy.kicker) : null;
    // A "Label:" kicker before a line that has its own "Label:" reads as two labels.
    const kicker = label && !(LABEL_END.test(label) && core.includes(":")) ? label : null;
    const tail = copy.tail && role !== "brief" ? text(copy.tail) : null;
    const options: string[] = [];
    // A tail is its own sentence; a core that already closes with ! ? or … takes it without a full stop.
    const after = CLOSED.test(core) ? "_after" : "";
    if (role === "banner" && kicker && tail) {
        options.push(t(`dispatch.story.frame.both${after}`, { kicker, core, tail }));
    }
    if (kicker) options.push(t("dispatch.story.frame.kicker", { kicker, core }));
    if (tail && (role === "banner" || !kicker)) options.push(t(`dispatch.story.frame.tail${after}`, { core, tail }));
    const cap = HEADLINE_CAPS[role];
    return { headline: options.find((o) => o.length <= cap) ?? core, deck: text(copy.deck) };
}

export function editionView(edition: Edition, deps: DispatchViewDeps, context: EditionCopyContext = {}): EditionView {
    const { t, tn } = deps;
    const { window: win } = edition;
    const live = edition.number === null;
    const heroName = (id: number) => deps.hero(id)?.name ?? t("stats.hero_fallback", { id });
    const personName = (c: Pick<Companion, "name">) => c.name ?? t("dispatch.player_fallback");

    const param = (p: DispatchParam): string => {
        switch (p.type) {
            case "hero":
                return heroName(p.heroId);
            case "player":
                return personName(p);
            case "number":
                return deps.number(p.value);
            case "duration":
                return deps.duration(p.seconds);
            case "percent":
                return deps.percent(p.value);
            case "date":
                return deps.day(p.unixS, win.tz);
            case "month":
                return deps.month(p.unixS, win.tz);
            case "grade":
                return p.letter;
            case "rank":
                return deps.rank(p.badge);
        }
    };
    const previous = context.previous ?? null;
    const chain = context.chain ?? (previous ? [previous.id] : []);
    const seeds = [...chain, edition.id].map((id) => copySeed(edition.accountId, id));
    const signals = editionSignals(edition, previous);
    const arranged = arrangeStories(edition.stories, signals, seeds[seeds.length - 1]);
    const copyContext = { edition, seeds, signals, previous };
    const story = (s: DispatchStory, i: number): DispatchStoryView => {
        const words = renderStory(storyCopy(s, i, copyContext), roleAt(i), param, deps);
        const view: DispatchStoryView = { id: `${s.kind}-${i}`, kind: s.kind, ...words };
        if (s.matchId !== undefined) view.matchId = s.matchId;
        return view;
    };

    const issue = live
        ? t("dispatch.masthead.issue_live", { volume: String(edition.volume) })
        : t("dispatch.masthead.issue", { volume: String(edition.volume), number: deps.number(edition.number!) });
    const season = win.kind === "collectors" ? edition.season : null;
    const editionLine = () => {
        if (live) return t("dispatch.masthead.edition_live");
        if (win.kind !== "collectors") return t(`dispatch.masthead.edition_${win.kind}`);
        return season
            ? t("dispatch.masthead.edition_collectors", { season: season.name })
            : t("dispatch.stamp.collectors");
    };
    const masthead: EditionView["masthead"] = {
        name: t("dispatch.masthead.name"),
        edition: editionLine(),
        issue,
        date: win.kind === "monthly" ? deps.month(win.startS, win.tz) : deps.dayRange(win.startS, win.endS - 1, win.tz),
    };

    const stories = arranged.map(story);
    const [banner, ...rest] = stories;
    const columns = rest.slice(0, COLUMN_MAX);
    const briefs = rest.slice(COLUMN_MAX).map((s): Brief => ({ id: s.id, headline: s.headline, body: s.deck }));

    const heroes = [...edition.heroes].sort(byPlay);

    const view: EditionView = {
        id: edition.id,
        label: t("dispatch.paper_label", { name: masthead.name, edition: masthead.edition, date: masthead.date }),
        titles: {
            front: masthead.name,
            stories: t("dispatch.section.stories"),
            numbers: t("dispatch.section.numbers"),
            best_game: t(`dispatch.section.best_game_${win.kind}`),
            heroes: t("dispatch.section.heroes"),
            people: t("dispatch.section.people"),
        },
        kind: win.kind,
        live,
        masthead,
        columns,
        briefs,
        stories,
        numbers: numberLines(edition, deps),
        heroes: heroes.slice(0, HERO_ROWS).map((h) => ({
            id: h.heroId,
            hero: heroName(h.heroId),
            games: deps.number(h.games),
            wins: deps.number(h.wins),
            playtime: deps.duration(h.playtimeS),
        })),
    };
    if (banner) view.banner = banner;
    if (win.kind === "collectors") {
        view.seal = { title: t("dispatch.stamp.collectors") };
        if (season) view.seal.season = season.name;
    }

    const lead = arranged[0]?.params.hero;
    const photoHero = lead?.type === "hero" ? lead.heroId : heroes[0]?.heroId;
    if (photoHero !== undefined) {
        const name = heroName(photoHero);
        const games = heroes.find((h) => h.heroId === photoHero)?.games;
        view.photo = {
            src: deps.hero(photoHero)?.art ?? null,
            alt: name,
            caption: games === undefined ? name : tn("dispatch.photo_caption", games, { hero: name }),
        };
    }

    const g = edition.bestGame;
    if (g) {
        view.bestGame = {
            matchId: g.matchId,
            hero: heroName(g.heroId),
            art: deps.hero(g.heroId)?.art ?? null,
            kda: `${g.kills}/${g.deaths}/${g.assists}`,
            netWorth: deps.netWorth(g.netWorth),
            grade: g.letter,
            date: deps.day(g.startTime, win.tz),
        };
    }

    const mates = edition.mates.slice(0, MATE_ROWS).map((m): PersonLine => ({
        id: m.accountId,
        name: personName(m),
        line: tn("dispatch.people.mate_line", m.matches, { wins: deps.number(m.wins) }),
    }));
    const n = edition.nemesis;
    if (mates.length > 0 || n) {
        view.people = { mates };
        if (n) {
            view.people.nemesis = {
                id: n.accountId,
                name: personName(n),
                line: tn("dispatch.people.nemesis_line", n.matches - n.wins, { matches: deps.number(n.matches) }),
            };
        }
    }
    return view;
}

function numberLines(edition: Edition, deps: DispatchViewDeps): NumberLine[] {
    const { stats } = edition;
    if (stats.matches === 0) return [];
    const { t } = deps;
    const perGame = (total: number) => deps.number(Math.round((total / stats.matches) * 10) / 10);
    const lines: NumberLine[] = [
        { id: "matches", label: t("dispatch.numbers.matches"), value: deps.number(stats.matches) },
        {
            id: "record",
            label: t("dispatch.numbers.record"),
            value: t("dispatch.numbers.record_value", {
                wins: deps.number(stats.wins),
                losses: deps.number(stats.losses),
            }),
        },
    ];
    if (stats.winrate !== null) {
        lines.push({ id: "winrate", label: t("dispatch.numbers.winrate"), value: deps.percent(stats.winrate) });
    }
    lines.push(
        {
            id: "playtime",
            label: t("dispatch.numbers.playtime"),
            value: t("dispatch.numbers.playtime_value", { hours: deps.number(hoursShort(stats.playtimeS)) }),
        },
        {
            id: "kda",
            label: t("dispatch.numbers.kda"),
            value: `${perGame(stats.kills)}/${perGame(stats.deaths)}/${perGame(stats.assists)}`,
        },
    );
    return lines;
}

/** One decimal, dropped from 100 hours up: the numbers strip has room for about four digits. */
function hoursShort(seconds: number): number {
    const tenths = Math.round(seconds / 360) / 10;
    return tenths >= 100 ? Math.round(seconds / 3600) : tenths;
}

const HAS: Record<SectionId, (v: EditionView) => boolean> = {
    front: (v) => v.banner !== undefined,
    stories: (v) => v.columns.length + v.briefs.length > 0,
    numbers: (v) => v.numbers.length > 0,
    best_game: (v) => v.bestGame !== undefined,
    heroes: (v) => v.heroes.length > 0,
    people: (v) => v.people !== undefined,
};

/** The sections this edition has content for, in paper order. */
export function sectionsFor(view: EditionView): SectionId[] {
    return SECTION_IDS.filter((id) => HAS[id](view));
}
