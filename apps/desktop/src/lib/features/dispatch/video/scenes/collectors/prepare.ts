import { formatNumber, i18n, t, tn } from "$lib/core/i18n.svelte";
import { loadHeroes } from "$lib/features/heroes/heroes";
import { loadRankTiers } from "$lib/features/ranks/ranks";
import { SITE_URL } from "@deadlock-plus/links";
import { editionSignals } from "@deadlock-plus/stats/dispatch/signals";
import { badgeParts } from "@deadlock-plus/stats/rank";
import { heroMood } from "../../../art";
import { dispatch } from "../../../dispatch.svelte";
import type { EditionView } from "../../../edition-view";
import { serialOf, topHeroes } from "../../../kinds/collectors/model";
import type { ScenePrep } from "../../scene";
import { deckLines, type Deck } from "./beats/card";
import { moodKey, tierKey } from "./beats/faces";
import { collectorsSfx, collectorsVideoData, copyRefs, type CopyRef } from "./data";
import { collectorsPlan } from "./plan";

const translate = (ref: CopyRef): string =>
    ref.count === undefined ? t(ref.key, ref.params) : tn(ref.key, ref.count, ref.params);

/**
 * The Pack Opening's deck: the frozen edition's cards with every line translated here (the worker has no i18n),
 * the hero card art and rank badges the faces show, and the sounds on the export's bar grid.
 */
export async function prepareScene(view: EditionView): Promise<ScenePrep> {
    const [edition, tiers, heroes] = await Promise.all([dispatch.open(view.id), loadRankTiers(), loadHeroes()]);
    if (!edition) throw new Error(`edition ${view.id} is not in the archive`);
    const tz = edition.window.tz;
    const day = new Intl.DateTimeFormat(i18n.locale, { month: "short", day: "numeric", timeZone: tz });
    const video = collectorsVideoData(edition, editionSignals(edition), {
        hero: (id) => heroes[id]?.name ?? t("stats.hero_fallback", { id }),
        badge: (b) => {
            const p = badgeParts(b);
            if (!p) return t("dispatch.collectors.unranked");
            const name = tiers.find((x) => x.tier === p.tier)?.name ?? t("rank.tier_fallback", { tier: p.tier });
            return `${name} ${p.sub}`;
        },
        day: (s) => day.format(s * 1000),
        number: (n) => formatNumber(n),
        percent: (v) => formatNumber(v, { style: "percent", maximumFractionDigits: 0 }),
        season: edition.season?.name ?? t("dispatch.stamp.collectors"),
        serial: serialOf(edition.accountId, edition.season?.id ?? edition.window.id),
        site: new URL(SITE_URL).host,
    });
    const deck: Deck = { video, lines: deckLines(copyRefs(video), translate), locale: i18n.locale };

    // Each hero a card can show, in the mood it would get, and each tier a badge on a card is in.
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
    const tierArt = new Set(badges.map((b) => badgeParts(b ?? null)?.tier).filter((x) => x !== undefined));
    const images: ScenePrep["images"] = Object.fromEntries(moods);
    for (const tier of tierArt) images[tierKey(tier)] ??= tiers.find((x) => x.tier === tier)?.image ?? null;
    return {
        data: deck,
        images,
        sfx: (timing) => collectorsSfx(collectorsPlan(video.casting, timing.bars), timing.barSeconds),
    };
}
