import { i18n } from "$lib/core/i18n.svelte";
import { loadHeroes } from "$lib/features/heroes/heroes";
import { heroBackdrop, heroPortrait } from "../../../art";
import { dispatchViewDeps } from "../../../components/view-deps";
import { dispatch } from "../../../dispatch.svelte";
import type { EditionView } from "../../../edition-view";
import type { ScenePrep } from "../../scene";
import { yearEndVideo } from "./data";

/** The frozen edition behind the view, read again for its months and name, set in the same words as the poster. */
export async function prepareScene(view: EditionView): Promise<ScenePrep> {
    const [edition, heroes] = await Promise.all([dispatch.open(view.id), loadHeroes()]);
    if (!edition) throw new Error(`edition ${view.id} is not in the archive`);
    const data = yearEndVideo(edition, view, {
        ...dispatchViewDeps(heroes, []),
        monthShort: (s, tz) => new Intl.DateTimeFormat(i18n.locale, { month: "short", timeZone: tz }).format(s * 1000),
        locale: i18n.locale,
    });
    const star = data.cover.star?.heroId;
    const goty = data.bestGame?.heroId;
    const shown = new Set(view.heroes.map((h) => h.id));
    const [backdrop, gotyPortrait] = await Promise.all([
        star === undefined ? null : heroBackdrop(star),
        goty === undefined || shown.has(goty) ? null : heroPortrait(goty),
    ]);
    const images: ScenePrep["images"] = { backdrop };
    if (goty !== undefined && gotyPortrait) images[`hero:${goty}`] = gotyPortrait;
    return { data, images };
}
