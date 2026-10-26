import type { Edition } from "@deadlock-plus/stats/dispatch/types";
import type { EditionView } from "../../edition-view";
import type { ExportSection, Translate } from "../../export-plan";
import type { CoverArt } from "./art";
import Book from "./book.svelte";
import { PAGE } from "./layout";
import type { Magazine } from "./magazine";
import MonthlyFront from "./monthly-front.svelte";
import PageBest from "./page-best.svelte";
import PageHeroes from "./page-heroes.svelte";
import PageNumbers from "./page-numbers.svelte";
import PagePeople from "./page-people.svelte";

const page = { width: PAGE.width, height: PAGE.height };
const spread = { width: PAGE.width * 2, height: PAGE.height };
/** Leaf angles that lay the book flat open at a spread, with no turn in progress. */
const OPEN_AT = { 1: { a1: -180, a2: 0 }, 2: { a1: -180, a2: -180 } } as const;

export function monthlySections(
    edition: Edition,
    view: EditionView,
    model: { mag: Magazine; art: CoverArt } | null,
    t: Translate,
): ExportSection[] {
    const front: ExportSection = {
        id: "front_page",
        label: t("dispatch.export.front_page"),
        size: page,
        component: MonthlyFront,
        props: { edition, view },
    };
    if (!model) return [front];
    const { mag, art } = model;
    const names = mag.sections;
    const book = (n: 1 | 2, left: string, right: string): ExportSection => ({
        id: `spread_${n}`,
        label: t("dispatch.export.spread", { left, right }),
        size: spread,
        component: Book,
        props: { mag, art, ...OPEN_AT[n], glare: 0, sticker: 1 },
    });
    return [
        front,
        { id: "numbers", label: names.numbers, size: page, component: PageNumbers, props: { mag } },
        { id: "cover_story", label: names.coverStory, size: page, component: PageHeroes, props: { mag, art } },
        { id: "best_game", label: names.best, size: page, component: PageBest, props: { mag } },
        { id: "people", label: names.people, size: page, component: PagePeople, props: { mag } },
        book(1, names.numbers, names.coverStory),
        book(2, names.best, names.people),
    ];
}
