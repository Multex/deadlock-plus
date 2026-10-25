import { describe, expect, it } from "vitest";
import { CARD_SIZES, DISPATCH_PAPER, type EditionView } from "./edition-view";
import { EXPORT_ASPECTS, exportFile, exportPicks, exportTarget, exportTargets } from "./export-plan";

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
    columns: [],
    briefs: [],
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
    heroes: [],
};

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
        expect(exportFile("monthly-2026-09", "front", "16:9")).toBe(
            "deadlock-plus-dispatch-monthly-2026-09-front-16x9.png",
        );
    });
});

describe("exportPicks", () => {
    it("offers the front page, then only the sections with content", () => {
        expect(exportPicks(view)).toEqual(["front_page", "front", "numbers", "best_game"]);
    });
});

describe("exportTarget", () => {
    it("sizes the front page as the paper, whatever the aspect", () => {
        expect(exportTarget(view, "front_page", "16:9")).toEqual({
            pick: "front_page",
            aspect: null,
            width: DISPATCH_PAPER.width,
            height: DISPATCH_PAPER.height,
            fileName: "deadlock-plus-dispatch-weekly-2026-10-05-front-page.png",
        });
    });

    it("sizes a section card by its aspect", () => {
        expect(exportTarget(view, "numbers", "1:1")).toEqual({
            pick: "numbers",
            aspect: "1:1",
            width: CARD_SIZES["1:1"].width,
            height: CARD_SIZES["1:1"].height,
            fileName: "deadlock-plus-dispatch-weekly-2026-10-05-numbers-1x1.png",
        });
    });
});

describe("exportTargets", () => {
    it("lists the front page once and every section in every aspect", () => {
        const targets = exportTargets(view);
        expect(targets).toHaveLength(1 + 3 * EXPORT_ASPECTS.length);
        expect(targets[0].pick).toBe("front_page");
        expect(targets.filter((t) => t.pick === "best_game").map((t) => t.aspect)).toEqual(["9:16", "1:1", "16:9"]);
        expect(new Set(targets.map((t) => t.fileName)).size).toBe(targets.length);
    });
});
