import { describe, expect, it } from "vitest";
import type { Edition } from "@deadlock-plus/stats/dispatch/types";
import SectionCard from "./components/section-card.svelte";
import { CARD_SIZES, type CardAspect, type EditionView } from "./edition-view";
import { exportFile, exportSections, type ExportModel } from "./export-plan";
import ClimbPage from "./kinds/collectors/climb-page.svelte";
import CollectorsFront from "./kinds/collectors/collectors-front.svelte";
import PeakPage from "./kinds/collectors/peak-page.svelte";
import type { CollectorsView } from "./kinds/collectors/view";
import Book from "./kinds/monthly/book.svelte";
import type { Magazine } from "./kinds/monthly/magazine";
import MonthlyFront from "./kinds/monthly/monthly-front.svelte";
import PageBest from "./kinds/monthly/page-best.svelte";
import PageHeroes from "./kinds/monthly/page-heroes.svelte";
import PageNumbers from "./kinds/monthly/page-numbers.svelte";
import PagePeople from "./kinds/monthly/page-people.svelte";
import WeeklyCover from "./kinds/weekly/weekly-cover.svelte";
import YearEndFront from "./kinds/year_end/year-end-front.svelte";
import YearEndPoster from "./kinds/year_end/year-end-poster.svelte";
import type { YearEndPoster as Poster } from "./kinds/year_end/year-end-view";

const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}${JSON.stringify(params)}` : key);

const view = (kind: EditionView["kind"]): EditionView => ({
    id: `${kind}-2026-10-05`,
    label: "Deadlock+ Dispatch",
    kind,
    live: false,
    titles: {
        front: "Deadlock+ Dispatch",
        stories: "Also inside",
        numbers: "By the numbers",
        best_game: "Game of the week",
        heroes: "Hero report",
        people: "The company you keep",
    },
    masthead: { name: "Deadlock+ Dispatch", edition: "Weekly Edition", issue: "No. 4", date: "Oct 5 to 11" },
    banner: { id: "record-0", kind: "record", headline: "Winning ways: 9-5", deck: "14 matches played." },
    columns: [],
    briefs: [],
    numbers: [{ id: "matches", label: "Matches", value: "14" }],
    bestGame: { matchId: 77, hero: "Haze", art: null, kda: "15/2/11", netWorth: "41.2K", grade: "A+", date: "Oct 8" },
    heroes: [],
});

const edition = (kind: EditionView["kind"]) =>
    ({ id: `${kind}-2026-10-05`, window: { kind }, stats: { matches: 14 }, matches: [] }) as unknown as Edition;

const mag = {
    sections: { numbers: "By the numbers", coverStory: "Cover story", best: "Game of the month", people: "People" },
} as Magazine;
const art = { card: null, backdrop: null };
const v = { season: "Season 3" } as CollectorsView;
const poster = (over: Partial<Poster> = {}) =>
    ({
        numbersTitle: "The year in numbers",
        heroesTitle: "Top 5 heroes",
        heroes: [{ id: 1 }],
        streak: { value: "7", title: "Best streak", line: "wins in a row" },
        bestGame: { title: "Game of the year" },
        mates: null,
        nemesis: null,
        inside: { kicker: "", title: "The year in review", span: "" },
        ...over,
    }) as unknown as Poster;

const plan = (kind: EditionView["kind"], model: ExportModel | null, aspect: CardAspect = "9:16") =>
    exportSections(edition(kind), view(kind), { model, aspect, t });
const sizes = (s: ReturnType<typeof plan>) => s.map((x) => [x.id, x.size.width, x.size.height]);

describe("exportFile", () => {
    it("names the front page by edition", () => {
        expect(exportFile("weekly-2026-10-05", "front_page", null)).toBe(
            "deadlock-plus-dispatch-weekly-2026-10-05-front-page.png",
        );
    });

    it("names a section by edition, section and aspect", () => {
        expect(exportFile("monthly-2026-09", "best_game", "9:16")).toBe(
            "deadlock-plus-dispatch-monthly-2026-09-best-game-9x16.png",
        );
    });
});

describe("exportSections: Weekly", () => {
    it("offers its cover, then a tabloid card for each section with content, at the picked shape", () => {
        const sections = plan("weekly", { kind: "weekly" }, "1:1");
        expect(sections.map((s) => s.id)).toEqual(["front_page", "front", "numbers", "best_game"]);
        expect(sections[0].component).toBe(WeeklyCover);
        expect(sections[0].size).toEqual({ width: 720, height: 1080 });
        for (const s of sections.slice(1)) {
            expect(s.component).toBe(SectionCard);
            expect(s.card).toBe(true);
            expect(s.size).toEqual({ width: CARD_SIZES["1:1"].width, height: CARD_SIZES["1:1"].height });
            expect(s.props).toMatchObject({ section: s.id, aspect: "1:1" });
        }
        expect(sections.map((s) => s.label)).toEqual([
            "dispatch.export.front_page",
            "dispatch.export.lead_story",
            "By the numbers",
            "Game of the week",
        ]);
    });
});

describe("exportSections: Monthly", () => {
    it("offers the cover, each magazine page and both open spreads, named as the magazine names them", () => {
        const sections = plan("monthly", { kind: "monthly", mag, art });
        expect(sizes(sections)).toEqual([
            ["front_page", 720, 936],
            ["numbers", 720, 936],
            ["cover_story", 720, 936],
            ["best_game", 720, 936],
            ["people", 720, 936],
            ["spread_1", 1440, 936],
            ["spread_2", 1440, 936],
        ]);
        expect(sections.map((s) => s.component)).toEqual([
            MonthlyFront,
            PageNumbers,
            PageHeroes,
            PageBest,
            PagePeople,
            Book,
            Book,
        ]);
        expect(sections.slice(1, 5).map((s) => s.label)).toEqual([
            "By the numbers",
            "Cover story",
            "Game of the month",
            "People",
        ]);
        expect(sections[5].label).toBe('dispatch.export.spread{"left":"By the numbers","right":"Cover story"}');
        expect(sections[5].props).toMatchObject({ a1: -180, a2: 0 });
        expect(sections[6].props).toMatchObject({ a1: -180, a2: -180 });
    });

    it("offers only the cover until the magazine is built", () => {
        expect(plan("monthly", null).map((s) => s.id)).toEqual(["front_page"]);
    });
});

describe("exportSections: Collector's Copy", () => {
    it("offers the cover, each inside page and the open spread", () => {
        const sections = plan("collectors", { kind: "collectors", v });
        expect(sizes(sections)).toEqual([
            ["front_page", 720, 1080],
            ["climb", 720, 1080],
            ["peak", 720, 1080],
            ["inside", 1440, 1080],
        ]);
        expect(sections.map((s) => s.component)).toEqual([CollectorsFront, ClimbPage, PeakPage, ClimbPage]);
        expect(sections[3].facing?.component).toBe(PeakPage);
        expect(sections.map((s) => s.label)).toEqual([
            "dispatch.export.front_page",
            "dispatch.collectors.climb_title",
            "dispatch.collectors.peak_label",
            'dispatch.export.spread{"left":"dispatch.collectors.climb_title","right":"dispatch.collectors.peak_label"}',
        ]);
    });
});

describe("exportSections: Year-End", () => {
    it("offers the cover, the whole poster and each fold panel under the headline band", () => {
        const sections = plan("year_end", { kind: "year_end", poster: poster() });
        expect(sizes(sections)).toEqual([
            ["front_page", 600, 900],
            ["poster", 1800, 900],
            ["panel_numbers", 600, 760],
            ["panel_heroes", 600, 760],
            ["panel_highlights", 600, 760],
        ]);
        expect(sections.map((s) => s.component)).toEqual([
            YearEndFront,
            YearEndPoster,
            YearEndPoster,
            YearEndPoster,
            YearEndPoster,
        ]);
        expect(sections.slice(2).map((s) => s.offset)).toEqual([
            { x: 0, y: 140 },
            { x: 600, y: 140 },
            { x: 1200, y: 140 },
        ]);
        expect(sections.map((s) => s.label)).toEqual([
            "dispatch.export.front_page",
            "The year in review",
            "The year in numbers",
            "Top 5 heroes",
            "Best streak",
        ]);
    });

    it("names the right panel by its first heading and drops the panels with nothing on them", () => {
        const bare = poster({ heroes: [], streak: null, bestGame: null });
        expect(plan("year_end", { kind: "year_end", poster: bare }).map((s) => s.id)).toEqual([
            "front_page",
            "poster",
            "panel_numbers",
        ]);
        const noStreak = plan("year_end", { kind: "year_end", poster: poster({ streak: null }) });
        expect(noStreak.at(-1)?.label).toBe("Game of the year");
    });
});

describe("exportSections: every kind", () => {
    const models: Record<EditionView["kind"], ExportModel> = {
        weekly: { kind: "weekly" },
        monthly: { kind: "monthly", mag, art },
        collectors: { kind: "collectors", v },
        year_end: { kind: "year_end", poster: poster() },
    };

    it.each(["monthly", "collectors", "year_end"] as const)("never draws %s as a tabloid card", (kind) => {
        for (const s of plan(kind, models[kind])) {
            expect(s.component).not.toBe(SectionCard);
            expect(s.card).toBeFalsy();
        }
    });

    it.each(Object.keys(models) as EditionView["kind"][])("gives every %s option its own file name", (kind) => {
        const sections = plan(kind, models[kind]);
        const names = sections.map((s) => exportFile(`${kind}-x`, s.id, s.card ? "9:16" : null));
        expect(new Set(names).size).toBe(sections.length);
    });
});
