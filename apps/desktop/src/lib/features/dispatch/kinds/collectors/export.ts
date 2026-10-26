import type { Edition } from "@deadlock-plus/stats/dispatch/types";
import type { ExportSection, Translate } from "../../export-plan";
import ClimbPage from "./climb-page.svelte";
import CollectorsFront from "./collectors-front.svelte";
import { COVER, PAGE, SPREAD } from "./layout";
import PeakPage from "./peak-page.svelte";
import type { CollectorsView } from "./view";

export function collectorsSections(edition: Edition, v: CollectorsView | null, t: Translate): ExportSection[] {
    const front: ExportSection = {
        id: "front_page",
        label: t("dispatch.export.front_page"),
        size: { ...COVER },
        component: CollectorsFront,
        props: { edition },
    };
    if (!v) return [front];
    const climb = t("dispatch.collectors.climb_title");
    const peak = t("dispatch.collectors.peak_label");
    return [
        front,
        { id: "climb", label: climb, size: { ...PAGE }, component: ClimbPage, props: { v } },
        { id: "peak", label: peak, size: { ...PAGE }, component: PeakPage, props: { v } },
        {
            id: "inside",
            label: t("dispatch.export.spread", { left: climb, right: peak }),
            size: { ...SPREAD },
            component: ClimbPage,
            props: { v },
            facing: { component: PeakPage, props: { v } },
        },
    ];
}
