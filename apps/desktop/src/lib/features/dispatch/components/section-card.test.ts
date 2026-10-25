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
