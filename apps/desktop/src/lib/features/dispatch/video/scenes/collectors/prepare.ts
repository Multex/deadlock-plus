import { formatNumber, i18n, t, tn } from "$lib/core/i18n.svelte";
import { loadHeroes } from "$lib/features/heroes/heroes";
import { loadRankTiers } from "$lib/features/ranks/ranks";
import { SITE_URL } from "@deadlock-plus/links";
import { dispatch } from "../../../dispatch.svelte";
import type { EditionView } from "../../../edition-view";
import { collectorsView, type CollectorsDeps } from "../../../kinds/collectors/view";
import type { ScenePrep } from "../../scene";
import { collectorsSceneData } from "./legacy-data";
import { dateRange } from "../../../date-range";
import { heroMood } from "../../../art";
import { topHeroes } from "../../../kinds/collectors/model";
import { badgeParts } from "@deadlock-plus/stats/rank";
import { moodKey, tierKey } from "./beats/faces";

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
            dateRange(
                dates(tz, { month: "short", day: "numeric", year: "numeric" }),
                a * 1000,
                b * 1000,
                t("dispatch.range_join"),
            ),
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
    // The cards' art: each hero a card can show in the mood it would get, and each tier a badge on a card is in.
    const shown = [
        topHeroes(edition.heroes, 1)[0],
        ...edition.heroes.filter((h) => edition.newHeroes.includes(h.heroId)),
    ];
    const moods = await Promise.all(
        shown
            .filter((h) => h && h.games > 0)
            .map(async (h) => {
                const mood = h.wins * 2 >= h.games ? "gloat" : "critical";
                return [moodKey(h.heroId, mood), await heroMood(h.heroId, mood)] as const;
            }),
    );
    const badges = [
        edition.rank?.startBadge,
        edition.rank?.endBadge,
        edition.rank?.peakBadge,
        ...(edition.rankSeries ?? []).map((p) => p.badge),
    ];
    const tierArt = new Set(badges.map((b) => badgeParts(b ?? null)?.tier).filter((t) => t !== undefined));
    const images: ScenePrep["images"] = { ...data.art, ...Object.fromEntries(moods) };
    for (const tier of tierArt) images[tierKey(tier)] ??= tiers.find((x) => x.tier === tier)?.image ?? null;
    return { data, images };
}
