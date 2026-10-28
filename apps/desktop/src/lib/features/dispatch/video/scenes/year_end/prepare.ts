import { i18n, t, tn } from "$lib/core/i18n.svelte";
import { loadHeroes } from "$lib/features/heroes/heroes";
import { heroMood, heroPortrait } from "../../../art";
import { dispatchViewDeps } from "../../../components/view-deps";
import { dispatch } from "../../../dispatch.svelte";
import type { EditionView } from "../../../edition-view";
import type { ScenePrep } from "../../scene";
import { awardImages } from "./beats/award";
import { stageOf } from "./compose";
import { yearEndAwards, yearEndSfx } from "./data";

/** The frozen edition behind the view, read again for the night's awards, every line translated for the worker. */
export async function prepareScene(view: EditionView): Promise<ScenePrep> {
    const [edition, heroes] = await Promise.all([dispatch.open(view.id), loadHeroes()]);
    if (!edition) throw new Error(`edition ${view.id} is not in the archive`);
    const viewDeps = dispatchViewDeps(heroes, []);
    const night = yearEndAwards(edition, {
        hero: (id) => viewDeps.hero(id)?.name,
        number: viewDeps.number,
        percent: viewDeps.percent,
        day: viewDeps.day,
        monthName: (s, tz) => new Intl.DateTimeFormat(i18n.locale, { month: "long", timeZone: tz }).format(s * 1000),
    });
    // The award beats' hero cards: `hero:<id>` and the mood faces `mood:<id>:gloat|critical`.
    const images: ScenePrep["images"] = {};
    const faces = await Promise.all(
        awardImages(night).map(
            async (i) => [i.key, i.mood ? await heroMood(i.heroId, i.mood) : await heroPortrait(i.heroId)] as const,
        ),
    );
    for (const [key, src] of faces) if (src) images[key] = src;
    return { data: stageOf(night, { t, tn }), images, sfx: yearEndSfx(night) };
}
