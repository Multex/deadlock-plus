import { coverBackdrop, heroPortrait } from "../../art";

export interface CoverArt {
    /** The 280x380 card cutout; drawn at no more than 1.5x so it stays sharp. */
    card: string | null;
    backdrop: string | null;
}

export async function coverArt(heroId: number): Promise<CoverArt> {
    const [card, backdrop] = await Promise.all([heroPortrait(heroId), coverBackdrop(heroId)]);
    return { card, backdrop };
}
