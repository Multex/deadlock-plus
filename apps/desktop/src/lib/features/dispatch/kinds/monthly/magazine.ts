import type { DispatchStoryKind, Edition } from "@deadlock-plus/stats/dispatch/types";
import { COLUMN_MAX, HERO_ROWS, type BestGameView, type EditionView } from "../../edition-view";
import { coverPalette, monthPalette, type MonthPalette } from "./palette";

type Params = Record<string, string | number>;

export interface MagazineDeps {
    t: (key: string, params?: Params) => string;
    tn: (key: string, count: number, params?: Params) => string;
    number: (n: number) => string;
    /** A share from 0 to 1. */
    percent: (share: number) => string;
    /** The same, in order, with the sign marked so it can be set smaller than the digits. */
    percentParts: (share: number) => { value: string; sign: boolean }[];
    duration: (seconds: number) => string;
    date: (unixS: number, tz: string, options: Intl.DateTimeFormatOptions) => string;
    /**
     * `artColour` is the colour sampled off the hero's backdrop art and `colour` the hero's own; the cover takes the
     * first it has so it shares a hue with the art behind the hero.
     */
    hero: (
        id: number,
    ) =>
        | { name: string; icon: string | null; art: string | null; colour?: string | null; artColour?: string | null }
        | undefined;
    rank: (badge: number) => { name: string; image: string | null };
}

export interface Coverline {
    id: string;
    kind: DispatchStoryKind;
    kicker: string;
    headline: string;
    deck: string;
    /** "p. 4": where the story is told inside, or `null` when only the cover has it. */
    pageRef: string | null;
    page: number | null;
}

export interface CalendarDay {
    day: string;
    matches: number;
    wins: number;
    /** More wins than losses. */
    won: boolean;
    /** Mark diameter in px; 0 on a day without a match. */
    size: number;
    label: string;
}

export interface Fact {
    id: string;
    label: string;
    value: string;
    note: string;
}

export interface HeroRow {
    id: number;
    name: string;
    icon: string | null;
    games: string;
    record: string;
    playtime: string;
    /** This hero's games against the most-played hero's, 0 to 1. */
    bar: number;
}

export interface RankEnd {
    name: string;
    image: string | null;
    caption: string;
}

export interface Magazine {
    id: string;
    palette: MonthPalette;
    nextPalette: MonthPalette;
    /** "September" */
    monthName: string;
    issueLine: string;
    folio: string;
    sections: { numbers: string; coverStory: string; best: string; people: string };
    coverHero: { heroId: number; name: string; art: string | null; line: string } | null;
    lead: Coverline | null;
    coverlines: Coverline[];
    sticker: { top: string; big: string; bottom: string; long: boolean } | null;
    barcode: { bars: number[]; digits: string };
    numbers: {
        title: string;
        matches: string;
        matchesLabel: string;
        won: { share: number; text: string; label: string; record: string } | null;
    };
    facts: Fact[];
    calendar: {
        title: string;
        legendWon: string;
        legendLost: string;
        weekdays: string[];
        /** Empty cells before the 1st, Monday first. */
        lead: number;
        days: CalendarDay[];
    } | null;
    feature: {
        title: string;
        deck: string;
        art: string | null;
        name: string;
        share: { value: string; sign: boolean }[];
        shareLabel: string;
    } | null;
    rotation: { title: string; tried: string; games: string; record: string; played: string };
    heroes: HeroRow[];
    asides: Coverline[];
    best:
        | (BestGameView & {
              kicker: string;
              headline: string;
              deck: string;
              kills: string;
              deaths: string;
              assists: string;
              labels: { kills: string; deaths: string; assists: string; netWorth: string; grade: string };
          })
        | null;
    also: { title: string; stories: Coverline[] };
    people: {
        title: string;
        intro: string | null;
        mates: { id: number; name: string; line: string; initial: string }[];
        nemesis: { kicker: string; name: string; line: string; headline: string | null } | null;
    };
    rank: { kicker: string; headline: string | null; start: RankEnd; end: RankEnd; peak: RankEnd } | null;
    next: string;
    nextLabel: string;
}

/** Where each story is told inside, for the "p. 4" on its coverline. */
const PAGE_OF: Partial<Record<DispatchStoryKind, number>> = {
    record: 2,
    hours: 2,
    longest_session: 2,
    busiest_day: 2,
    longest_match: 2,
    night_owl: 2,
    days_played: 2,
    top_hero: 3,
    new_hero: 3,
    heroes_tried: 3,
    damage: 3,
    best_game: 4,
    best_streak: 4,
    mvp_count: 4,
    rank_move: 5,
    played_with: 5,
    nemesis: 5,
};

const COVERLINES = 3;
const FACTS = 6;
const ASIDES = 2;
const ALSO = 3;
/** Calendar marks grow with the square root of the day's matches, so area tracks the count. */
const MARK_MIN = 10;
const MARK_GROW = 16;

/** Civil date parts in `tz`; read in a fixed locale so the numbers parse. */
function civil(unixS: number, tz: string) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "numeric",
        day: "numeric",
        weekday: "short",
    }).formatToParts(unixS * 1000);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday"));
    return { year: Number(get("year")), month: Number(get("month")), day: Number(get("day")), weekday };
}

/** Noon UTC on a civil date, for naming a month or day without a time zone shifting it. */
const civilNoon = (year: number, month: number, day: number) => Date.UTC(year, month - 1, day, 12) / 1000;
/** A Monday, for the weekday initials. */
const A_MONDAY = civilNoon(2026, 10, 5);

function hash(text: string): number {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return h >>> 0;
}

/** A decorative bar pattern from the edition id; not a scannable code. */
function barcode(seed: string): Magazine["barcode"] {
    let h = hash(seed);
    const digits: string[] = [];
    const bars: number[] = [];
    for (let i = 0; i < 12; i++) {
        h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
        const d = h % 10;
        digits.push(String(d));
        bars.push(1 + (d % 3), 1 + ((d >> 1) % 2), (d * 7) % 4 === 0 ? 3 : 1, 1);
    }
    return { bars, digits: `${digits[0]} ${digits.slice(1, 6).join("")} ${digits.slice(6).join("")}` };
}

export function buildMagazine(edition: Edition, view: EditionView, deps: MagazineDeps): Magazine {
    const { t, tn } = deps;
    const { tz, startS } = edition.window;
    const first = civil(startS, tz);
    const daysInMonth = new Date(Date.UTC(first.year, first.month, 0)).getUTCDate();
    const monthName = deps.date(civilNoon(first.year, first.month, 1), "UTC", { month: "long" });
    const monthLabel = view.masthead.date;
    const heroName = (id: number) => deps.hero(id)?.name ?? t("stats.hero_fallback", { id });

    const coverline = (id: string, kind: DispatchStoryKind, headline: string, deck: string): Coverline => {
        const page = PAGE_OF[kind] ?? null;
        return {
            id,
            kind,
            kicker: t(`dispatch.monthly.kicker.${kind}`),
            headline,
            deck,
            page,
            pageRef: page === null ? null : t("dispatch.monthly.page_ref", { page: deps.number(page) }),
        };
    };
    const stories: Coverline[] = edition.stories.flatMap((s, i) => {
        if (i === 0)
            return view.banner ? [coverline(view.banner.id, s.kind, view.banner.headline, view.banner.deck)] : [];
        if (i <= COLUMN_MAX) {
            const c = view.columns[i - 1];
            return c ? [coverline(c.id, s.kind, c.headline, c.deck)] : [];
        }
        const b = view.briefs[i - 1 - COLUMN_MAX];
        return b ? [coverline(String(b.id), s.kind, b.headline, b.body)] : [];
    });
    const find = (kind: DispatchStoryKind) => stories.find((s) => s.kind === kind);

    const sorted = [...edition.heroes].sort(
        (a, b) => b.games - a.games || b.playtimeS - a.playtimeS || a.heroId - b.heroId,
    );
    const total = edition.stats.matches || 1;
    const top = sorted[0];
    const topShare = top ? top.games / total : 0;
    const coverHero = top
        ? {
              heroId: top.heroId,
              name: heroName(top.heroId),
              art: deps.hero(top.heroId)?.art ?? null,
              line: tn("dispatch.monthly.cover_star_line", top.games, {
                  share: deps.percent(topShare),
                  month: monthName,
              }),
          }
        : null;

    // The edition freezes the cover hero, not its colour: the colour follows the hero's art, which is not frozen either.
    const coverDep = top ? deps.hero(top.heroId) : undefined;

    // The cover star already carries the top-hero story, so it does not repeat as a coverline.
    const [lead, ...rest] = stories.filter((s) => s.kind !== "top_hero");

    const g = edition.bestGame;
    const bestView = view.bestGame;
    const sticker =
        g && bestView
            ? {
                  top: t("dispatch.monthly.sticker.top"),
                  big: bestView.grade ?? bestView.kda,
                  bottom: bestView.grade ? t("dispatch.monthly.sticker.grade") : t("dispatch.monthly.sticker.kda"),
                  long: (bestView.grade ?? bestView.kda).length > 3,
              }
            : null;

    const stats = edition.stats;
    const day = (s: number) => deps.date(s, tz, { weekday: "short", month: "short", day: "numeric" });
    const numberLine = (id: string) => view.numbers.find((n) => n.id === id)?.value;
    const facts: Fact[] = [];
    const fact = (id: string, value: string, note: string) =>
        facts.push({ id, label: t(`dispatch.monthly.fact.${id}`), value, note });
    const playtime = numberLine("playtime");
    if (playtime) {
        const days = Math.round(stats.playtimeS / 8640) / 10;
        fact("playtime", playtime, tn("dispatch.monthly.fact.playtime_note", days, { days: deps.number(days) }));
    }
    const kda = numberLine("kda");
    if (kda) fact("kda", kda, tn("dispatch.monthly.fact.kda_note", stats.kills, { kills: deps.number(stats.kills) }));
    if (stats.longestMatchS > 0) {
        const minutes = Math.round(stats.longestMatchS / 60);
        fact(
            "longest_match",
            tn("dispatch.monthly.fact.longest_match_value", minutes, { minutes: deps.number(minutes) }),
            t("dispatch.monthly.fact.longest_match_note"),
        );
    }
    if (stats.longestSession) {
        const s = stats.longestSession;
        fact(
            "longest_session",
            tn("dispatch.monthly.fact.longest_session_value", s.matches, { matches: deps.number(s.matches) }),
            t("dispatch.monthly.fact.longest_session_note", {
                duration: deps.duration(s.durationS),
                date: day(s.startS),
            }),
        );
    }
    if (stats.busiestDay) {
        const b = stats.busiestDay;
        fact(
            "busiest_day",
            day(b.dayStartS),
            tn("dispatch.monthly.fact.busiest_day_note", b.matches, { matches: deps.number(b.matches) }),
        );
    }
    fact(
        "days_played",
        deps.number(stats.daysPlayed),
        tn("dispatch.monthly.fact.days_played_note", daysInMonth, { days: deps.number(daysInMonth) }),
    );
    if (stats.nightShare !== null) {
        fact("night", deps.percent(stats.nightShare), t("dispatch.monthly.fact.night_note"));
    }

    const most = Math.max(1, ...(edition.days ?? []).map((d) => d.matches));
    const calendar: Magazine["calendar"] = edition.days
        ? {
              title: t("dispatch.monthly.calendar.title", { month: monthName }),
              legendWon: t("dispatch.monthly.calendar.legend_won"),
              legendLost: t("dispatch.monthly.calendar.legend_lost"),
              weekdays: Array.from({ length: 7 }, (_, i) =>
                  deps.date(A_MONDAY + i * 86400, "UTC", { weekday: "narrow" }),
              ),
              lead: Math.max(0, civil(edition.days[0]?.dayStartS ?? startS, tz).weekday),
              days: edition.days.map((d) => {
                  const date = deps.date(d.dayStartS, tz, { month: "long", day: "numeric" });
                  return {
                      day: deps.number(civil(d.dayStartS, tz).day),
                      matches: d.matches,
                      wins: d.wins,
                      won: d.wins * 2 > d.matches,
                      size: d.matches === 0 ? 0 : MARK_MIN + MARK_GROW * Math.sqrt(d.matches / most),
                      label:
                          d.matches === 0
                              ? t("dispatch.monthly.calendar.day_empty", { date })
                              : tn("dispatch.monthly.calendar.day", d.matches, { date, wins: deps.number(d.wins) }),
                  };
              }),
          }
        : null;

    const topStory = find("top_hero");
    const feature: Magazine["feature"] = top
        ? {
              title: topStory?.headline ?? heroName(top.heroId),
              deck:
                  topStory?.deck ??
                  tn("dispatch.monthly.heroes.fallback_deck", top.games, {
                      wins: deps.number(top.wins),
                      month: monthName,
                  }),
              art: deps.hero(top.heroId)?.art ?? null,
              name: heroName(top.heroId),
              share: deps.percentParts(topShare),
              shareLabel: t("dispatch.monthly.heroes.share_label", { hero: heroName(top.heroId) }),
          }
        : null;
    const mostGames = Math.max(1, top?.games ?? 1);
    const heroes: HeroRow[] = sorted.slice(0, HERO_ROWS).map((h) => ({
        id: h.heroId,
        name: heroName(h.heroId),
        icon: deps.hero(h.heroId)?.icon ?? null,
        games: deps.number(h.games),
        record: t("dispatch.monthly.heroes.record", {
            wins: deps.number(h.wins),
            losses: deps.number(h.games - h.wins),
        }),
        playtime: view.heroes.find((v) => v.id === h.heroId)?.playtime ?? deps.duration(h.playtimeS),
        bar: h.games / mostGames,
    }));

    const best: Magazine["best"] =
        g && bestView
            ? {
                  ...bestView,
                  kicker: t("dispatch.monthly.section.best_game"),
                  headline:
                      find("best_game")?.headline ??
                      t("dispatch.monthly.best.fallback_headline", { hero: bestView.hero, kda: bestView.kda }),
                  deck: find("best_game")?.deck ?? "",
                  kills: deps.number(g.kills),
                  deaths: deps.number(g.deaths),
                  assists: deps.number(g.assists),
                  labels: {
                      kills: t("dispatch.monthly.best.kills"),
                      deaths: t("dispatch.monthly.best.deaths"),
                      assists: t("dispatch.monthly.best.assists"),
                      netWorth: t("dispatch.monthly.best.net_worth"),
                      grade: t("dispatch.monthly.best.grade"),
                  },
              }
            : null;

    const nemesisView = view.people?.nemesis;
    const people: Magazine["people"] = {
        title: t("dispatch.monthly.people.title"),
        intro: find("played_with")?.deck ?? null,
        mates: (view.people?.mates ?? []).map((m) => ({
            ...m,
            initial: [...m.name.trim()][0]?.toLocaleUpperCase() ?? "?",
        })),
        nemesis: nemesisView
            ? {
                  kicker: t("dispatch.monthly.people.most_wanted"),
                  name: nemesisView.name,
                  line: nemesisView.line,
                  headline: find("nemesis")?.headline ?? null,
              }
            : null,
    };

    const rankEnd = (badge: number, caption: string): RankEnd => ({ ...deps.rank(badge), caption });
    const rank: Magazine["rank"] = edition.rank
        ? {
              kicker: t("dispatch.monthly.kicker.rank_move"),
              headline: find("rank_move")?.headline ?? null,
              start: rankEnd(edition.rank.startBadge, t("dispatch.monthly.rank.start", { month: monthName })),
              end: rankEnd(edition.rank.endBadge, t("dispatch.monthly.rank.end", { month: monthName })),
              peak: rankEnd(edition.rank.peakBadge, t("dispatch.monthly.rank.peak")),
          }
        : null;

    const nextMonth = new Date(Date.UTC(first.year, first.month, 1));
    const nextIssue = new Date(Date.UTC(first.year, first.month + 1, 1));
    const next = t("dispatch.monthly.next_line", {
        month: deps.date(civilNoon(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, 1), "UTC", {
            month: "long",
            year: "numeric",
        }),
        date: deps.date(civilNoon(nextIssue.getUTCFullYear(), nextIssue.getUTCMonth() + 1, 1), "UTC", {
            month: "long",
            day: "numeric",
        }),
    });

    return {
        id: edition.id,
        palette: coverPalette(coverDep?.artColour, coverDep?.colour, first.month),
        nextPalette: monthPalette(first.month + 1),
        monthName,
        issueLine:
            edition.number === null
                ? t("dispatch.monthly.cover_line_preview", { month: monthLabel })
                : t("dispatch.monthly.cover_line", { month: monthLabel, number: deps.number(edition.number) }),
        folio: t("dispatch.monthly.folio", { name: view.masthead.name, month: monthLabel }),
        sections: {
            numbers: t("dispatch.monthly.section.numbers"),
            coverStory: t("dispatch.monthly.section.cover_story"),
            best: t("dispatch.monthly.section.best_game"),
            people: t("dispatch.monthly.section.people"),
        },
        coverHero,
        lead: lead ?? null,
        coverlines: rest.slice(0, COVERLINES),
        sticker,
        barcode: barcode(edition.id),
        numbers: {
            title: t("dispatch.monthly.numbers.title"),
            matches: deps.number(stats.matches),
            matchesLabel: tn("dispatch.monthly.numbers.matches_label", stats.matches, { month: monthName }),
            won:
                stats.winrate === null
                    ? null
                    : {
                          share: stats.winrate,
                          text: deps.percent(stats.winrate),
                          label: t("dispatch.monthly.numbers.won"),
                          record: t("dispatch.monthly.numbers.record", {
                              wins: deps.number(stats.wins),
                              losses: deps.number(stats.losses),
                          }),
                      },
        },
        facts: facts.slice(0, FACTS),
        calendar,
        feature,
        rotation: {
            title: t("dispatch.monthly.heroes.rotation"),
            tried: tn("dispatch.monthly.heroes.tried", edition.heroes.length, { month: monthName }),
            games: t("dispatch.monthly.heroes.col_games"),
            record: t("dispatch.monthly.heroes.col_record"),
            played: t("dispatch.monthly.heroes.col_played"),
        },
        heroes,
        asides: stories
            .filter((s) => s.kind === "new_hero" || s.kind === "heroes_tried" || s.kind === "damage")
            .slice(0, ASIDES),
        best,
        also: {
            title: t("dispatch.monthly.best.also"),
            stories: stories
                .filter((s) => s.page === 2 || s.kind === "best_streak" || s.kind === "mvp_count")
                .slice(0, ALSO),
        },
        people,
        rank,
        next,
        nextLabel: t("dispatch.monthly.next_label"),
    };
}
