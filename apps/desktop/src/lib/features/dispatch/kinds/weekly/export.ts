import type { Edition } from "@deadlock-plus/stats/dispatch/types";
import SectionCard from "../../components/section-card.svelte";
import { CARD_SIZES, DISPATCH_PAPER, sectionsFor, type CardAspect, type EditionView } from "../../edition-view";
import type { ExportSection, Translate } from "../../export-plan";
import { isHotWeek } from "./hot";
import WeeklyCover from "./weekly-cover.svelte";

export function weeklySections(edition: Edition, view: EditionView, aspect: CardAspect, t: Translate): ExportSection[] {
    const { width, height } = CARD_SIZES[aspect];
    return [
        {
            id: "front_page",
            label: t("dispatch.export.front_page"),
            size: { width: DISPATCH_PAPER.width, height: DISPATCH_PAPER.height },
            component: WeeklyCover,
            props: { view, hot: isHotWeek(edition) },
        },
        ...sectionsFor(view).map((section): ExportSection => ({
            id: section,
            label: section === "front" ? t("dispatch.export.lead_story") : view.titles[section],
            size: { width, height },
            component: SectionCard,
            props: { view, section, aspect },
            card: true,
        })),
    ];
}
