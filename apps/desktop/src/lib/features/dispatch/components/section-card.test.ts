import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import { CARD_SIZES, type CardAspect, type EditionView } from "../edition-view";
import EditionPaper from "./edition-paper.svelte";
import SectionCard, { SECTION_IDS } from "./section-card.svelte";

const text = (html: string) =>
    html
        .replace(/<!--.*?-->/gs, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const view: EditionView = {
    id: "weekly-2026-10-05",
    label: "Deadlock+ Dispatch, Weekly Edition, Oct 5 – 11, 2026",
    kind: "weekly",
    live: false,
    titles: {
        front: "Deadlock+ Dispatch",
        stories: "Also inside",
        numbers: "By the numbers",
        best_game: "Game of the week",
        heroes: "Hero report",
        people: "The company you keep",
    },
    masthead: { name: "Deadlock+ Dispatch", edition: "Weekly Edition", issue: "Vol. 2026 · No. 4", date: "Oct 5 – 11" },
    banner: { id: "record-0", kind: "record", headline: "Winning ways: 9-5", deck: "14 matches played, 64% won." },
    columns: [{ id: "hours-1", kind: "hours", headline: "7 hours on the clock", deck: "7h 20m spent in matches." }],
    briefs: [{ id: "night_owl-5", headline: "Burning the midnight oil", body: "4 matches after midnight." }],
    photo: { src: "art/2.png", alt: "Haze", caption: "Haze, 8 games this edition" },
    numbers: [{ id: "matches", label: "Matches", value: "14" }],
    bestGame: {
        matchId: 77,
        hero: "Haze",
        art: "art/2.png",
        kda: "15/2/11",
        netWorth: "41.2K",
        grade: "A+",
        date: "Thu, Oct 8",
    },
    heroes: [{ id: 2, hero: "Haze", games: "8", wins: "6", playtime: "4h 0m" }],
    people: {
        mates: [{ id: 501, name: "Rook", line: "6 matches together, 4 won" }],
        nemesis: { id: 900, name: "Grim", line: "Beat you 3 times in 4" },
    },
};

describe("EditionPaper", () => {
    it("prints every section of the edition on one page", () => {
        const page = text(render(EditionPaper, { props: { view } }).body);
        for (const part of [
            "Deadlock+ Dispatch",
            "Vol. 2026 · No. 4",
            "Winning ways: 9-5",
            "7 hours on the clock",
            "Burning the midnight oil",
            "15/2/11",
            "Hero report",
            "Rook",
            "Grim",
        ]) {
            expect(page).toContain(part);
        }
    });

    it("stamps only a live edition", () => {
        const stamp = (live: boolean) => render(EditionPaper, { props: { view: { ...view, live } } }).body;
        expect(stamp(true)).toContain('class="stamp');
        expect(stamp(false)).not.toContain('class="stamp');
    });
});

describe("SectionCard", () => {
    const aspects = Object.keys(CARD_SIZES) as CardAspect[];

    it("draws each section at the exact size of its aspect, with the export footer", () => {
        for (const aspect of aspects) {
            const { width, height } = CARD_SIZES[aspect];
            for (const section of SECTION_IDS) {
                const body = render(SectionCard, { props: { view, section, aspect } }).body;
                expect(body).toContain(`width: ${width}px; height: ${height}px;`);
                expect(body).toContain('class="footer');
                expect(text(body)).toContain(view.titles[section]);
            }
        }
    });

    it("keeps to its own section", () => {
        const people = text(render(SectionCard, { props: { view, section: "people", aspect: "9:16" } }).body);
        expect(people).toContain("Grim");
        expect(people).not.toContain("Winning ways");
        const numbers = text(render(SectionCard, { props: { view, section: "numbers", aspect: "1:1" } }).body);
        expect(numbers).toContain("Matches");
        expect(numbers).not.toContain("Rook");
    });
});

describe("special editions", () => {
    const collectors: EditionView = {
        ...view,
        kind: "collectors",
        titles: { ...view.titles, best_game: "Game of the season" },
        masthead: { ...view.masthead, edition: "Beta Season 1 · Collector's Copy" },
        seal: { title: "Collector's Copy", season: "Beta Season 1" },
    };
    const yearEnd: EditionView = {
        ...view,
        kind: "year_end",
        titles: { ...view.titles, best_game: "Game of the year" },
        masthead: { ...view.masthead, edition: "Year-End Special" },
    };

    it("puts the Collector's Copy foil seal on the paper and on every card", () => {
        const paper = render(EditionPaper, { props: { view: collectors } }).body;
        expect(paper).toContain('class="seal');
        expect(text(paper)).toContain("Beta Season 1 · Collector's Copy");
        expect(text(paper)).toContain("Game of the season");
        for (const section of SECTION_IDS) {
            const card = render(SectionCard, { props: { view: collectors, section, aspect: "1:1" } }).body;
            expect(card).toContain('class="seal');
            expect(card).toContain("kind-collectors");
        }
    });

    it("prints the Year-End Special in black and gold, without the seal", () => {
        const paper = render(EditionPaper, { props: { view: yearEnd } }).body;
        expect(paper).toContain("kind-year_end");
        expect(paper).not.toContain('class="seal');
        expect(text(paper)).toContain("Game of the year");
        const card = render(SectionCard, { props: { view: yearEnd, section: "best_game", aspect: "9:16" } }).body;
        expect(card).toContain("kind-year_end");
    });

    it("leaves a weekly edition in its own red", () => {
        const paper = render(EditionPaper, { props: { view } }).body;
        expect(paper).toContain("kind-weekly");
        expect(paper).not.toContain('class="seal');
        expect(paper).not.toContain("--dp-rule");
    });
});
