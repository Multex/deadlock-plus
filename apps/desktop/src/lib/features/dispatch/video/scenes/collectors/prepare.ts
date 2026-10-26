import { formatNumber, i18n, t, tn } from "$lib/core/i18n.svelte";
import { loadHeroes } from "$lib/features/heroes/heroes";
import { loadRankTiers } from "$lib/features/ranks/ranks";
import { SITE_URL } from "@deadlock-plus/links";
import { dispatch } from "../../../dispatch.svelte";
import type { EditionView } from "../../../edition-view";
import { collectorsView, type CollectorsDeps } from "../../../kinds/collectors/view";
import type { ScenePrep } from "../../scene";
import { collectorsSceneData } from "./data";

const dates = (tz: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(i18n.locale, { ...options, timeZone: tz });

/** The frozen edition behind the view, read again for the rank series, and the same text the cover prints. */
export async function prepareScene(view: EditionView): Promise<ScenePrep> {
    const [edition, tiers, heroes] = await Promise.all([dispatch.open(view.id), loadRankTiers(), loadHeroes()]);
    if (!edition) throw new Error(`edition ${view.id} is not in the archive`);
    const deps: CollectorsDeps = {
        t,
        tn,
        number: (n) => formatNumber(n),
        percent: (v) => formatNumber(v, { style: "percent", maximumFractionDigits: 0 }),
        dayRange: (a, b, tz) =>
            dates(tz, { month: "short", day: "numeric", year: "numeric" }).formatRange(a * 1000, b * 1000),
        day: (s, tz) => dates(tz, { weekday: "short", month: "short", day: "numeric" }).format(s * 1000),
        month: (s) => dates("UTC", { month: "short" }).format(s * 1000),
        tiers,
        hero: (id) => (heroes[id] ? { name: heroes[id].name, art: heroes[id].portrait } : undefined),
    };
    const data = collectorsSceneData(edition, collectorsView(edition, deps), {
        t,
        locale: i18n.locale,
        site: new URL(SITE_URL).host,
    });
    return { data, images: data.art };
}
