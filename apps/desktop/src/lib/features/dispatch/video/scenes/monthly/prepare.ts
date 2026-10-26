import { i18n, t } from "$lib/core/i18n.svelte";
import { loadHeroes } from "$lib/features/heroes/heroes";
import { loadRankTiers } from "$lib/features/ranks/ranks";
import { SITE_URL } from "@deadlock-plus/links";
import { coverBackdrop, heroPortrait } from "../../../art";
import { dispatch } from "../../../dispatch.svelte";
import type { EditionView } from "../../../edition-view";
import { sampleArtColour } from "../../../kinds/monthly/cover-colour.svelte";
import { magazineDeps } from "../../../kinds/monthly/deps";
import { buildMagazine } from "../../../kinds/monthly/magazine";
import type { ScenePrep } from "../../scene";
import { monthlyVideo, rankImages } from "./legacy/data";

/** The frozen edition behind the view, built into the same magazine the reader opens. */
export async function prepareScene(view: EditionView): Promise<ScenePrep> {
    const [edition, heroes, tiers] = await Promise.all([dispatch.open(view.id), loadHeroes(), loadRankTiers()]);
    if (!edition) throw new Error(`edition ${view.id} is not in the archive`);
    // The cover takes its colour from the backdrop sample; an export started outside the reader has none yet.
    const coverHero = [...edition.heroes].sort(
        (a, b) => b.games - a.games || b.playtimeS - a.playtimeS || a.heroId - b.heroId,
    )[0];
    if (coverHero) await sampleArtColour(coverHero.heroId);
    const mag = buildMagazine(edition, view, magazineDeps(heroes, tiers));
    const data = monthlyVideo(edition, mag, { t, locale: i18n.locale, site: new URL(SITE_URL).host });

    const star = data.cover.star?.heroId;
    const best = data.best?.heroId;
    const shown = new Set(view.heroes.map((h) => h.id));
    const [backdrop, bestPortrait] = await Promise.all([
        star === undefined ? null : coverBackdrop(star),
        best === undefined || shown.has(best) ? null : heroPortrait(best),
    ]);
    const images: ScenePrep["images"] = { backdrop, ...rankImages(data) };
    if (best !== undefined && bestPortrait) images[`hero:${best}`] = bestPortrait;
    return { data, images };
}
