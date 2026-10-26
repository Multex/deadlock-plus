import type { Edition } from "@deadlock-plus/stats/dispatch/types";
import type { EditionView } from "../../edition-view";
import type { ExportSection, Translate } from "../../export-plan";
import { PANEL, YEAR_END_COVER } from "./reveal";
import YearEndFront from "./year-end-front.svelte";
import YearEndPoster from "./year-end-poster.svelte";
import type { YearEndPoster as Poster } from "./year-end-view";

/**
 * The poster's black headline band, gold rule included. The headline runs across all three panels, so a panel on its
 * own starts under the band rather than showing a third of the title.
 */
const BAND = 140;

export function yearEndSections(
    edition: Edition,
    view: EditionView,
    poster: Poster | null,
    t: Translate,
): ExportSection[] {
    const front: ExportSection = {
        id: "front_page",
        label: t("dispatch.export.front_page"),
        size: { width: YEAR_END_COVER.width, height: YEAR_END_COVER.height },
        component: YearEndFront,
        props: { edition, view },
    };
    if (!poster) return [front];
    const highlights = poster.streak?.title ?? poster.bestGame?.title ?? poster.mates?.title ?? poster.nemesis?.title;
    const panels: [string, string | undefined][] = [
        ["panel_numbers", poster.numbersTitle],
        ["panel_heroes", poster.heroes.length > 0 ? poster.heroesTitle : undefined],
        ["panel_highlights", highlights],
    ];
    return [
        front,
        {
            id: "poster",
            label: poster.inside.title,
            size: { width: PANEL.w * 3, height: PANEL.h },
            component: YearEndPoster,
            props: { poster },
        },
        ...panels.flatMap(([id, label], i): ExportSection[] =>
            label === undefined
                ? []
                : [
                      {
                          id,
                          label,
                          size: { width: PANEL.w, height: PANEL.h - BAND },
                          component: YearEndPoster,
                          props: { poster },
                          offset: { x: PANEL.w * i, y: BAND },
                      },
                  ],
        ),
    ];
}
