import type { Beat } from "../beats";
import type { Scene } from "../scene";
import type { BeatDraw, Deck } from "./collectors/beats/card";
import { CARD_DRAWS } from "./collectors/beats/cards";
import { draw as chase } from "./collectors/beats/chase";
import { draw as fan } from "./collectors/beats/fan";
import { draw as pack } from "./collectors/beats/pack";
import { draw as slab } from "./collectors/beats/slab";
import { draw as tear } from "./collectors/beats/tear";
import { collectorsPlan, type CollectorsBeatId } from "./collectors/plan";

const DRAWS: Record<CollectorsBeatId, BeatDraw> = {
    c_pack: pack,
    c_tear: tear,
    ...CARD_DRAWS,
    c_chase: chase,
    c_slab: slab,
    c_fan: fan,
};

/** The beat playing at `t` and the seconds into it. Past the end, the last beat holds its final frame. */
export function beatAt(
    plan: readonly Beat<CollectorsBeatId>[],
    t: number,
    bar: number,
): { id: CollectorsBeatId; local: number; span: number } {
    for (const b of plan) {
        const end = (b.bar + b.bars) * bar;
        if (t < end) return { id: b.id, local: Math.max(0, t - b.bar * bar), span: b.bars * bar };
    }
    const last = plan[plan.length - 1];
    const span = last.bars * bar;
    return { id: last.id, local: span - 1e-3, span };
}

/**
 * The Pack Opening: each beat draws on its own clock and cuts to the next on a bar line. The beats hand over
 * where they stand (the stack, the pile, the held chase card, the slab), so a cut never jumps.
 */
export const collectorsScene: Scene = (ctx, t, size, assets) => {
    const deck = assets.data as Deck | undefined;
    if (!deck?.video) {
        ctx.fillStyle = "#07060a";
        ctx.fillRect(0, 0, size.w, size.h);
        return;
    }
    const bar = assets.timing.barSeconds;
    const at = beatAt(collectorsPlan(deck.video.casting, assets.timing.bars), t, bar);
    ctx.save();
    DRAWS[at.id](ctx, at.local, at.span, size, deck, assets);
    ctx.restore();
};
