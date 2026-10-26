import type { Edition } from "@deadlock-plus/stats/dispatch/types";
import type { CalendarDay, Fact, Magazine } from "../../../../kinds/monthly/magazine";
import { PAGE_TOKENS, type MonthPalette } from "../../../../kinds/monthly/palette";
import type { SectionId } from "./plan";

type Params = Record<string, string | number>;

export interface MonthlyVideoDeps {
    t: (key: string, params?: Params) => string;
    locale: string;
    /** The site's host, printed on the barcode and the back cover. */
    site: string;
}

export interface RankEndView {
    name: string;
    caption: string;
    image: string | null;
}

export interface MonthlyVideo {
    locale: string;
    palette: MonthPalette;
    paper: typeof PAGE_TOKENS;
    folio: string;
    cover: {
        brand: string;
        masthead: string;
        issueLine: string;
        star: { heroId: number; name: string; line: string; kicker: string } | null;
        lead: { kicker: string; headline: string; deck: string } | null;
        lines: { kicker: string; headline: string; pageRef: string | null }[];
        sticker: Magazine["sticker"];
        barcode: Magazine["barcode"];
        site: string;
    };
    /** The magazine page each section is printed on, for the folio. */
    pages: Record<SectionId, number>;
    numbers: {
        kicker: string;
        title: string;
        matches: number;
        matchesLabel: string;
        won: { share: number; label: string; record: string } | null;
        facts: Fact[];
    };
    calendar: {
        title: string;
        legendWon: string;
        legendLost: string;
        weekdays: string[];
        lead: number;
        days: CalendarDay[];
    } | null;
    heroes: {
        kicker: string;
        heroId: number;
        name: string;
        title: string;
        deck: string;
        share: number;
        shareLabel: string;
        rotation: string;
        tried: string;
        cols: { games: string; record: string };
        rows: { id: number; name: string; games: string; record: string; bar: number }[];
    } | null;
    best: {
        kicker: string;
        headline: string;
        deck: string;
        heroId: number;
        hero: string;
        date: string;
        grade: string | null;
        kda: string;
        netWorth: string;
        counts: { kills: number; deaths: number; assists: number };
        labels: { kills: string; deaths: string; assists: string; netWorth: string; grade: string };
    } | null;
    people: {
        kicker: string;
        title: string;
        intro: string | null;
        mates: { name: string; line: string; initial: string }[];
        nemesis: { kicker: string; name: string; line: string; headline: string | null } | null;
    } | null;
    rank: { kicker: string; headline: string; start: RankEndView; end: RankEndView; peak: RankEndView } | null;
    end: { cta: string; url: string; nextLabel: string; next: string };
}

/** Pages the magazine prints each section on; the coverlines' "p. 4" points at the same pages. */
const PAGES: Record<SectionId, number> = { numbers: 2, calendar: 2, heroes: 3, best: 4, people: 5, rank: 5 };

/** The video's words and numbers, read off the same `Magazine` the reader opens, so both share text and colours. */
export function monthlyVideo(edition: Edition, mag: Magazine, deps: MonthlyVideoDeps): MonthlyVideo {
    const { t } = deps;
    const { stats } = edition;
    const top = mag.coverHero && edition.heroes.find((h) => h.heroId === mag.coverHero!.heroId);
    const g = edition.bestGame;

    return {
        locale: deps.locale,
        palette: mag.palette,
        paper: PAGE_TOKENS,
        folio: mag.folio,
        cover: {
            brand: t("dispatch.monthly.brand"),
            masthead: t("dispatch.monthly.masthead"),
            issueLine: mag.issueLine,
            star: mag.coverHero && {
                heroId: mag.coverHero.heroId,
                name: mag.coverHero.name,
                line: mag.coverHero.line,
                kicker: t("dispatch.monthly.kicker.top_hero"),
            },
            lead: mag.lead && { kicker: mag.lead.kicker, headline: mag.lead.headline, deck: mag.lead.deck },
            lines: mag.coverlines.map((c) => ({ kicker: c.kicker, headline: c.headline, pageRef: c.pageRef })),
            sticker: mag.sticker,
            barcode: mag.barcode,
            site: deps.site,
        },
        pages: PAGES,
        numbers: {
            kicker: mag.sections.numbers,
            title: mag.numbers.title,
            matches: stats.matches,
            matchesLabel: mag.numbers.matchesLabel,
            won: mag.numbers.won && {
                share: mag.numbers.won.share,
                label: mag.numbers.won.label,
                record: mag.numbers.won.record,
            },
            facts: mag.facts,
        },
        calendar: mag.calendar && {
            title: mag.calendar.title,
            legendWon: mag.calendar.legendWon,
            legendLost: mag.calendar.legendLost,
            weekdays: mag.calendar.weekdays,
            lead: mag.calendar.lead,
            days: mag.calendar.days,
        },
        heroes:
            mag.feature && mag.coverHero
                ? {
                      kicker: mag.sections.coverStory,
                      heroId: mag.coverHero.heroId,
                      name: mag.feature.name,
                      title: mag.feature.title,
                      deck: mag.feature.deck,
                      share: top && stats.matches > 0 ? top.games / stats.matches : 0,
                      shareLabel: mag.feature.shareLabel,
                      rotation: mag.rotation.title,
                      tried: mag.rotation.tried,
                      cols: { games: mag.rotation.games, record: mag.rotation.record },
                      rows: mag.heroes.map(({ id, name, games, record, bar }) => ({ id, name, games, record, bar })),
                  }
                : null,
        best:
            mag.best && g
                ? {
                      kicker: mag.best.kicker,
                      headline: mag.best.headline,
                      deck: mag.best.deck,
                      heroId: g.heroId,
                      hero: mag.best.hero,
                      date: mag.best.date,
                      grade: mag.best.grade,
                      kda: mag.best.kda,
                      netWorth: mag.best.netWorth,
                      counts: { kills: g.kills, deaths: g.deaths, assists: g.assists },
                      labels: mag.best.labels,
                  }
                : null,
        people:
            mag.people.mates.length > 0 || mag.people.nemesis
                ? {
                      kicker: mag.sections.people,
                      title: mag.people.title,
                      intro: mag.people.intro,
                      mates: mag.people.mates.map(({ name, line, initial }) => ({ name, line, initial })),
                      nemesis: mag.people.nemesis,
                  }
                : null,
        rank: mag.rank && {
            kicker: mag.rank.kicker,
            headline: mag.rank.headline ?? mag.rank.end.name,
            start: mag.rank.start,
            end: mag.rank.end,
            peak: mag.rank.peak,
        },
        end: { cta: t("dispatch.video.monthly.cta"), url: deps.site, nextLabel: mag.nextLabel, next: mag.next },
    };
}

export function presentSections(v: MonthlyVideo): SectionId[] {
    const has: Record<SectionId, boolean> = {
        numbers: true,
        calendar: v.calendar !== null,
        heroes: v.heroes !== null,
        best: v.best !== null,
        people: v.people !== null,
        rank: v.rank !== null,
    };
    return (Object.keys(has) as SectionId[]).filter((id) => has[id]);
}

/** The rank badge art, under the keys the scene draws them from. */
export function rankImages(v: MonthlyVideo): Record<string, string> {
    const out: Record<string, string> = {};
    if (v.rank?.start.image) out["rank:start"] = v.rank.start.image;
    if (v.rank?.end.image) out["rank:end"] = v.rank.end.image;
    return out;
}
