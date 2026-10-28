import { coverBackdrop, heroPortrait } from "../../art";
import { sampleArtColour } from "./cover-colour.svelte";

export interface CoverArt {
    /** The 280x380 card cutout; drawn at no more than 1.5x so it stays sharp. */
    card: string | null;
    backdrop: string | null;
}

/** Resolves once the backdrop's colour is sampled too, so a cover waiting on its art never shows the wrong colour. */
export async function coverArt(heroId: number): Promise<CoverArt> {
    const [card, backdrop] = await Promise.all([heroPortrait(heroId), coverBackdrop(heroId)]);
    await sampleArtColour(heroId, backdrop);
    return { card, backdrop };
}
