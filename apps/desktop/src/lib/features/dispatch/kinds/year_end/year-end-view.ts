import type { Edition, EditionMonth } from "@deadlock-plus/stats/dispatch/types";
import type { DispatchViewDeps, EditionView, PersonLine } from "../../edition-view";

export interface YearEndDeps extends DispatchViewDeps {
    /** A local month as its short name, "Jan". */
    monthShort: (unixS: number, tz: string) => string;
}

/** The busiest month's bar, in poster px. */
export const BAR_MAX = 88;
const TOP_HEROES = 5;

export interface MonthBar {
    id: number;
    label: string;
    count: string;
    height: number;
    busiest: boolean;
    /** The month this issue comes out in: no matches counted yet. */
    issue: boolean;
}

export interface Line {
    id: string;
    label: string;
    value: string;
}

export interface YearEndCover {
    name: string;
    edition: string;
    issue: string;
    year: string;
    span: string;
    title: string;
    /** `null` on editions frozen without a name: the cover leaves the name line out. */
    player: string | null;
    star: { heroId: number; line: string } | null;
    lines: Line[];
    flap: string;
}

export interface TitleParts {
    before: string;
    player: string;
    after: string;
}

export interface PosterHero {
    id: number;
    name: string;
    art: string | null;
    games: string;
    /** Wins and hours, for the hero of the year only. */
    record?: string;
}

export interface YearEndPoster {
    kicker: { name: string; issue: string; span: string };
    title: TitleParts;
    numbersTitle: string;
    cells: Line[];
    kda: Line | null;
    heroesTitle: string;
    heroTag: string;
    heroes: PosterHero[];
    streak: { value: string; title: string; line: string } | null;
    bestGame: {
        title: string;
        heroId: number;
        hero: string;
        art: string | null;
        kda: string;
        grade: string | null;
        date: string;
    } | null;
    mates: { title: string; rows: PersonLine[] } | null;
    nemesis: { title: string; row: PersonLine } | null;
    months: { title: string; sub: string; issue: string; bars: MonthBar[] } | null;
    /** The back of the inside flap, seen between the cover swinging away and the flap opening. */
    inside: { kicker: string; title: string; span: string };
}

export interface YearEndView {
    cover: YearEndCover;
    poster: YearEndPoster;
}

/**
 * One bar per month, scaled from zero against the busiest month so heights compare honestly. While the window
 * stops short of a full year, the month the issue comes out in closes the strip as an empty "this issue" slot.
 */
export function monthBars(months: EditionMonth[], endS: number, tz: string, deps: YearEndDeps): MonthBar[] {
    const peak = Math.max(0, ...months.map((m) => m.matches));
    const busiest = peak > 0 ? months.findIndex((m) => m.matches === peak) : -1;
    const bars = months.map((m, i): MonthBar => ({
        id: m.monthStartS,
        label: deps.monthShort(m.monthStartS, tz),
        count:
            i === busiest
                ? deps.t("dispatch.year_end.month.busiest", { count: deps.number(m.matches) })
                : deps.number(m.matches),
        height: peak > 0 ? (m.matches / peak) * BAR_MAX : 0,
        busiest: i === busiest,
        issue: false,
    }));
    if (months.length > 0 && months.length < 12) {
        bars.push({ id: endS, label: deps.monthShort(endS, tz), count: "", height: 0, busiest: false, issue: true });
    }
    return bars;
}

/** Cuts a translated title around `{player}` so the name can be set in its own ink. */
export function splitTitle(template: string, year: string, player: string): TitleParts {
    const [before, ...rest] = template.replaceAll("{year}", year).split("{player}");
    return rest.length > 0 ? { before, player, after: rest.join(player) } : { before, player: "", after: "" };
}

export function yearEndView(edition: Edition, view: EditionView, deps: YearEndDeps): YearEndView {
    const { t, tn, number } = deps;
    const { stats, window: win } = edition;
    const year = String(edition.volume);
    const hours = Math.round(stats.playtimeS / 3600);
    const player = edition.playerName?.trim() || null;
    const heroName = (id: number) => deps.hero(id)?.name ?? t("stats.hero_fallback", { id });

    const byId = new Map(edition.heroes.map((h) => [h.heroId, h]));
    const top = view.heroes.slice(0, TOP_HEROES).flatMap((line) => {
        const h = byId.get(line.id);
        return h ? [h] : [];
    });
    const star = top[0];

    const third: Line =
        edition.longestWin > 0
            ? {
                  id: "streak",
                  value: number(edition.longestWin),
                  label: tn("dispatch.year_end.streak_line", edition.longestWin),
              }
            : {
                  id: "days",
                  value: number(stats.daysPlayed),
                  label: tn("dispatch.year_end.cover.days", stats.daysPlayed),
              };

    const cover: YearEndCover = {
        name: view.masthead.name,
        edition: view.masthead.edition,
        issue: view.masthead.issue,
        year,
        span: view.masthead.date,
        title: t("dispatch.year_end.player_of_the_year"),
        player,
        star: star
            ? {
                  heroId: star.heroId,
                  line: tn("dispatch.year_end.cover.star", star.games, { hero: heroName(star.heroId) }),
              }
            : null,
        lines: [
            {
                id: "matches",
                value: number(stats.matches),
                label: tn("dispatch.year_end.cover.matches", stats.matches),
            },
            { id: "hours", value: number(hours), label: tn("dispatch.year_end.cover.hours", hours) },
            third,
        ],
        flap: t("dispatch.year_end.flap"),
    };

    const cells: Line[] = [
        { id: "matches", label: t("dispatch.numbers.matches"), value: number(stats.matches) },
        { id: "hours", label: t("dispatch.year_end.numbers.hours"), value: number(hours) },
        { id: "days", label: t("dispatch.year_end.numbers.days"), value: number(stats.daysPlayed) },
        { id: "heroes", label: t("dispatch.year_end.numbers.heroes"), value: number(edition.heroes.length) },
        {
            id: "record",
            label: t("dispatch.numbers.record"),
            value: t("dispatch.numbers.record_value", { wins: number(stats.wins), losses: number(stats.losses) }),
        },
    ];
    if (stats.winrate !== null) {
        cells.push({ id: "winrate", label: t("dispatch.numbers.winrate"), value: deps.percent(stats.winrate) });
    }
    if (stats.longestMatchS > 0) {
        cells.push({
            id: "longest_match",
            label: t("dispatch.year_end.numbers.longest_match"),
            value: deps.duration(stats.longestMatchS),
        });
    }
    if (stats.longestSession) {
        cells.push({
            id: "session",
            label: t("dispatch.year_end.numbers.longest_session"),
            value: tn("dispatch.year_end.numbers.session_value", stats.longestSession.matches),
        });
    }

    const perGame = (total: number) => number(Math.round((total / stats.matches) * 10) / 10);
    const kda: Line | null =
        stats.matches > 0
            ? {
                  id: "kda",
                  label: t("dispatch.numbers.kda"),
                  value: `${perGame(stats.kills)} / ${perGame(stats.deaths)} / ${perGame(stats.assists)}`,
              }
            : null;

    const heroes = top.map((h, i): PosterHero => {
        const hero: PosterHero = {
            id: h.heroId,
            name: heroName(h.heroId),
            art: deps.hero(h.heroId)?.art ?? null,
            games: tn("dispatch.year_end.hero_games", h.games),
        };
        if (i === 0) {
            const heroHours = Math.round(h.playtimeS / 3600);
            hero.record = `${tn("dispatch.year_end.hero_wins", h.wins)} · ${tn("dispatch.year_end.hero_hours", heroHours)}`;
        }
        return hero;
    });

    const g = edition.bestGame;
    const months = edition.months ?? null;

    const poster: YearEndPoster = {
        kicker: {
            name: view.masthead.name,
            issue: t("dispatch.year_end.band_issue", { edition: view.masthead.edition, issue: view.masthead.issue }),
            span: view.masthead.date,
        },
        title: player
            ? splitTitle(t("dispatch.year_end.title", { year, player: "{player}" }), year, player)
            : { before: t("dispatch.year_end.title_anonymous", { year }), player: "", after: "" },
        numbersTitle: t("dispatch.year_end.numbers.title"),
        cells,
        kda,
        heroesTitle: tn("dispatch.year_end.top_heroes", heroes.length),
        heroTag: t("dispatch.year_end.hero_of_the_year"),
        heroes,
        streak:
            edition.longestWin > 0
                ? {
                      value: number(edition.longestWin),
                      title: t("dispatch.year_end.streak"),
                      line: tn("dispatch.year_end.streak_line", edition.longestWin),
                  }
                : null,
        bestGame: g
            ? {
                  title: view.titles.best_game,
                  heroId: g.heroId,
                  hero: heroName(g.heroId),
                  art: deps.hero(g.heroId)?.art ?? null,
                  kda: `${g.kills}/${g.deaths}/${g.assists}`,
                  grade: g.letter ? t("dispatch.year_end.grade", { grade: g.letter }) : null,
                  date: deps.day(g.startTime, win.tz),
              }
            : null,
        mates:
            view.people && view.people.mates.length > 0
                ? { title: t("dispatch.year_end.ran_with"), rows: view.people.mates }
                : null,
        nemesis: view.people?.nemesis ? { title: t("dispatch.year_end.nemesis"), row: view.people.nemesis } : null,
        months:
            months && months.length > 0
                ? {
                      title: t("dispatch.year_end.month.title"),
                      sub: t("dispatch.year_end.month.sub"),
                      issue: t("dispatch.year_end.month.issue"),
                      bars: monthBars(months, win.endS, win.tz, deps),
                  }
                : null,
        inside: {
            kicker: t("dispatch.year_end.inside.kicker"),
            title: t("dispatch.year_end.inside.title"),
            span: view.masthead.date,
        },
    };
    return { cover, poster };
}
