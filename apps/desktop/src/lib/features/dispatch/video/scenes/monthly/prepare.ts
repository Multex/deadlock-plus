import { i18n, t, tn } from "$lib/core/i18n.svelte";
import { loadHeroes } from "$lib/features/heroes/heroes";
import { loadRankTiers } from "$lib/features/ranks/ranks";
import { SITE_URL } from "@deadlock-plus/links";
import { badgeParts } from "@deadlock-plus/stats/rank";
import { coverBackdrop, heroMood, heroPortrait } from "../../../art";
import { copyContext } from "../../../copy-chain";
import { dispatch } from "../../../dispatch.svelte";
import type { EditionView } from "../../../edition-view";
import { sampleArtColour } from "../../../kinds/monthly/cover-colour.svelte";
import { magazineDeps } from "../../../kinds/monthly/deps";
import { buildMagazine } from "../../../kinds/monthly/magazine";
import type { ScenePrep } from "../../scene";
import { imageKeys, monthlyLines, type MonthlyDraw } from "./beats/studio";
import { monthlySfx, monthlyVideoData, takeFrames, type MonthlyVideoDeps } from "./data";

/** The frozen edition behind the view, its words translated and its art named for the cover shoot's beats. */
export async function prepareScene(view: EditionView): Promise<ScenePrep> {
    const [edition, heroes, tiers] = await Promise.all([dispatch.open(view.id), loadHeroes(), loadRankTiers()]);
    if (!edition) throw new Error(`edition ${view.id} is not in the archive`);
    // The cover takes its colour from the backdrop sample; an export started outside the reader has none yet.
    const coverHero = [...edition.heroes].sort(
        (a, b) => b.games - a.games || b.playtimeS - a.playtimeS || a.heroId - b.heroId,
    )[0];
    if (coverHero) await sampleArtColour(coverHero.heroId);
    const magDeps = magazineDeps(heroes, tiers);
    const mag = buildMagazine(edition, view, magDeps);

    const prevId = copyContext(edition, dispatch.shelf, {}).chain?.at(-1);
    const previous = prevId ? await dispatch.open(prevId).catch(() => null) : null;
    const deps: MonthlyVideoDeps = {
        hero: (id) => heroes[id]?.name ?? "",
        rank: (badge) => magDeps.rank(badge).name,
        number: magDeps.number,
        percent: magDeps.percent,
        date: magDeps.date,
        duration: magDeps.duration,
    };
    const video = monthlyVideoData(edition, deps, previous);
    const shown = edition.heroes.map((h) => h.heroId);
    const data: MonthlyDraw = {
        video,
        palette: mag.palette,
        lines: monthlyLines(
            video,
            (c) => (c.count === undefined ? t(c.key, c.params) : tn(c.key, c.count, c.params)),
            deps.number,
        ),
        locale: i18n.locale,
        heroes: Object.fromEntries(
            shown.flatMap((id) =>
                heroes[id] ? [[id, { name: heroes[id].name, colour: heroes[id].colour ?? null }]] : [],
            ),
        ),
        print: {
            brand: t("dispatch.monthly.brand"),
            masthead: t("dispatch.monthly.masthead"),
            issueLine: mag.issueLine,
            barcode: mag.barcode,
            site: new URL(SITE_URL).host,
        },
    };

    const b = video.beats;
    const star = b.m_flash.heroId;
    const shot = b.m_shot?.heroId;
    const inView = new Set(view.heroes.slice(0, 8).map((h) => h.id));
    // Portraits the export does not load itself: every hero on the contact sheet, the rail and the feature.
    const portraits = new Set([
        ...takeFrames(edition).flatMap((f) => (f.heroId === null ? [] : [f.heroId])),
        ...(b.m_wardrobe?.swatches.map((s) => s.heroId) ?? []),
        ...(b.m_feature?.heroId != null ? [b.m_feature.heroId] : []),
        ...(shot !== undefined ? [shot] : []),
    ]);
    const extra = [...portraits].filter((id) => !inView.has(id));
    const moods = [
        ...new Set([star, shot, b.m_wardrobe?.lead, b.m_feature?.heroId].filter((id): id is number => id != null)),
    ];
    const badges = b.m_feature?.badges ? [b.m_feature.badges.start, b.m_feature.badges.end] : [];
    const [backdrop, shotBackdrop, portraitArt, moodArt] = await Promise.all([
        star === null ? null : coverBackdrop(star),
        shot === undefined ? null : coverBackdrop(shot),
        Promise.all(extra.map((id) => heroPortrait(id))),
        Promise.all(moods.map((id) => heroMood(id, "gloat"))),
    ]);
    const images: ScenePrep["images"] = { [imageKeys.backdrop]: backdrop };
    if (shot !== undefined) images[imageKeys.heroBackdrop(shot)] = shotBackdrop;
    extra.forEach((id, i) => (images[imageKeys.hero(id)] = portraitArt[i] ?? null));
    moods.forEach((id, i) => (images[imageKeys.gloat(id)] = moodArt[i] ?? null));
    for (const badge of badges) {
        const tier = badgeParts(badge)?.tier;
        images[imageKeys.rank(badge)] = tiers.find((r) => r.tier === tier)?.image ?? null;
    }
    return { data, images, sfx: (timing) => monthlySfx(video, timing) };
}
