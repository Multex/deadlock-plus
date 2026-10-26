import type { Edition } from "@deadlock-plus/stats/dispatch/types";
import type { EditionView, PersonLine } from "../../../edition-view";
import { SITE_URL } from "@deadlock-plus/links";
import { yearEndView, type TitleParts, type YearEndDeps } from "../../../kinds/year_end/year-end-view";
import type { SectionId } from "./plan";

export interface YearEndVideoDeps extends YearEndDeps {
    locale: string;
}

export interface CountTile {
    id: string;
    label: string;
    value: string;
    count: { template: string; values: number[]; percent: boolean } | null;
}

export interface YearEndVideo {
    locale: string;
    year: string;
    cover: {
        name: string;
        issue: string;
        edition: string;
        span: string;
        title: string;
        player: string | null;
        star: { heroId: number; line: string } | null;
        flap: string;
    };
    inside: { kicker: string; title: string; span: string };
    kicker: { name: string; issue: string; span: string };
    title: TitleParts;
    numbers: { title: string; tiles: CountTile[]; kda: { label: string; value: string } | null };
    heroes: { title: string; tag: string; list: { id: number; name: string; games: string; record?: string }[] };
    streak: { count: number; value: string; title: string; line: string } | null;
    bestGame: { title: string; heroId: number; hero: string; kda: string; grade: string | null; date: string } | null;
    people: { mates: { title: string; rows: PersonLine[] } | null; nemesis: { title: string; row: PersonLine } | null };
    end: { cta: string; url: string };
}

const SITE_HOST = new URL(SITE_URL).host;

export function yearEndVideo(edition: Edition, view: EditionView, deps: YearEndVideoDeps): YearEndVideo {
    const { cover, poster } = yearEndView(edition, view, deps);
    const { stats } = edition;
    const counted: Record<string, CountTile["count"]> = {
        matches: { template: "{0}", values: [stats.matches], percent: false },
        hours: { template: "{0}", values: [Math.round(stats.playtimeS / 3600)], percent: false },
        days: { template: "{0}", values: [stats.daysPlayed], percent: false },
        heroes: { template: "{0}", values: [edition.heroes.length], percent: false },
        record: {
            template: deps.t("dispatch.numbers.record_value", { wins: "{0}", losses: "{1}" }),
            values: [stats.wins, stats.losses],
            percent: false,
        },
    };
    if (stats.winrate !== null) counted.winrate = { template: "{0}", values: [stats.winrate], percent: true };

    return {
        locale: deps.locale,
        year: cover.year,
        cover: {
            name: cover.name,
            issue: cover.issue,
            edition: cover.edition,
            span: cover.span,
            title: cover.title,
            player: cover.player,
            star: cover.star,
            flap: cover.flap,
        },
        inside: poster.inside,
        kicker: poster.kicker,
        title: poster.title,
        numbers: {
            title: poster.numbersTitle,
            tiles: poster.cells.map((c) => ({ ...c, count: counted[c.id] ?? null })),
            kda: poster.kda && { label: poster.kda.label, value: poster.kda.value },
        },
        heroes: {
            title: poster.heroesTitle,
            tag: poster.heroTag,
            list: poster.heroes.map(({ id, name, games, record }) =>
                record ? { id, name, games, record } : { id, name, games },
            ),
        },
        streak: poster.streak && { count: edition.longestWin, ...poster.streak },
        bestGame: poster.bestGame && {
            title: poster.bestGame.title,
            heroId: poster.bestGame.heroId,
            hero: poster.bestGame.hero,
            kda: poster.bestGame.kda,
            grade: poster.bestGame.grade,
            date: poster.bestGame.date,
        },
        people: {
            mates: poster.mates,
            nemesis: poster.nemesis && { title: deps.t("dispatch.people.nemesis"), row: poster.nemesis.row },
        },
        end: { cta: deps.t("dispatch.video.year_end.cta"), url: SITE_HOST },
    };
}

export function presentSections(v: YearEndVideo): SectionId[] {
    const has: Record<SectionId, boolean> = {
        numbers: v.numbers.tiles.length > 0,
        heroes: v.heroes.list.length > 0,
        highlights: v.streak !== null || v.bestGame !== null,
        people: v.people.mates !== null || v.people.nemesis !== null,
    };
    return (Object.keys(has) as SectionId[]).filter((id) => has[id]);
}

/** Puts each value, formatted, in for its `{i}` placeholder. */
export function fillCount(template: string, values: number[], format: (n: number) => string): string {
    return template.replace(/\{(\d+)\}/g, (whole, i: string) => {
        const v = values[Number(i)];
        return v === undefined ? whole : format(v);
    });
}
