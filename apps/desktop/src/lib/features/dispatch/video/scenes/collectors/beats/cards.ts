import { flashAt } from "../../../kit/beat";
import { clamp01, easeOutCubic, lerp } from "../../../kit/ease";
import { shake } from "../../../kit/motion";
import { seeded } from "../../../kit/rng";
import type { Ctx } from "../../../kit/types";
import type { SceneAssets } from "../../../scene";
import type { CardBeatId } from "../plan";
import {
    cardStage,
    dealPose,
    drawCard,
    drawCardBack,
    drawCardFace,
    drawStack,
    flipPose,
    holdSway,
    pileSlot,
    rarityOf,
    restPose,
    stackDepth,
    type BeatDraw,
    type CardPose,
    type CardStage,
    type Deck,
} from "./card";
import { drawRays, drawSparkle, drawTable } from "./table";

/** The flip on the beat's downbeat, and the card leaving for the pile at its end, in seconds. */
export const FLIP_S = 0.45;
export const EXIT_S = 0.42;

/** Pixels per card unit for a card on the pile. */
export const pileScale = (st: CardStage) => st.scale * (st.aspect === "tall" ? 0.3 : 0.36);

/** Where dealt card `i` rests on the pile, in pixels. */
export function pilePose(st: CardStage, i: number): CardPose {
    const s = pileSlot(i, st.aspect);
    return { x: st.pile.x + s.x * st.u, y: st.pile.y + s.y * st.u, rot: s.rot, scale: pileScale(st), alpha: 1 };
}

/** The cards dealt before card `upTo`, face up on the pile. */
export function drawPile(ctx: Ctx, st: CardStage, deck: Deck, assets: SceneAssets, upTo: number): void {
    const n = deck.video.cards.length + (deck.video.chase ? 1 : 0);
    for (let i = 0; i < upTo; i++) {
        const card = deck.video.cards[i];
        if (!card) continue;
        drawCard(
            ctx,
            pilePose(st, i),
            flipPose(1, 0, 1),
            () => drawCardFace(ctx, card, deck, assets, { since: 10, tilt: 0.2, index: i + 1, of: n }),
            () => undefined,
            0.7,
        );
    }
}

/**
 * One dealt card's beat: the top card of the stack turns over on the downbeat and lifts to the camera, its
 * rarity lands as light (rays, a shake, sparkles on the rarer ones), it sways in the light while the face reads,
 * then it leaves for the pile and the next card waits face down.
 */
export function cardBeat(id: CardBeatId): BeatDraw {
    return (ctx, local, span, size, deck, assets) => {
        const st = cardStage(size);
        const cards = deck.video.cards;
        const index = cards.findIndex((c) => c.beat === id);
        if (index < 0) {
            drawTable(ctx, st, local);
            return;
        }
        const card = cards[index];
        const style = rarityOf(card.rarity);
        const n = cards.length + (deck.video.chase ? 1 : 0);
        const exitAt = Math.max(FLIP_S + 0.6, span - EXIT_S);
        const landed = flashAt(local, FLIP_S);
        const glow = style.shine * (landed + 0.35 * clamp01((local - FLIP_S) / 0.4));
        drawTable(ctx, st, local + index * 3.1, glow);

        drawPile(ctx, st, deck, assets, index);

        const rest = restPose(st);
        const sway = holdSway(local, index * 1.7);
        const exitK = easeOutCubic((local - exitAt) / EXIT_S);
        drawStack(
            ctx,
            { ...rest, x: rest.x - 7 * rest.scale * exitK, y: rest.y - 9 * rest.scale * exitK },
            stackDepth(index, cards.length, !!deck.video.chase),
            deck,
            assets,
            sway.tilt * 0.3,
        );

        const [sx, sy] = shake(local - FLIP_S, 12 * st.u * Math.max(0, style.shine - 0.3), index + 1);
        const lift = easeOutCubic(local / FLIP_S);
        const push = 1 + 0.03 * clamp01((local - FLIP_S) / Math.max(0.1, exitAt - FLIP_S));
        const held = clamp01((local - FLIP_S) / 0.5);
        const hold: CardPose = {
            x: lerp(rest.x, st.card.x, lift) + sx,
            y: lerp(rest.y, st.card.y, lift) + sy + sway.bob * st.u * held,
            rot: lerp(rest.rot, 0, lift) + sway.rot * held,
            scale: lerp(rest.scale, st.scale, lift) * push,
            alpha: 1,
        };
        const pose = local < exitAt ? hold : dealPose(local, exitAt, EXIT_S, hold, pilePose(st, index));

        if (local >= FLIP_S * 0.5 && local < exitAt + 0.1) {
            const k = clamp01(1 - (local - exitAt) / 0.1);
            drawRays(ctx, pose.x, pose.y, 900 * st.scale, glow * k, local * 0.25 + index, `${style.accent}88`);
        }

        const sweep = clamp01((local - FLIP_S) / 0.7);
        const tilt = lerp(-1.1, sway.tilt, easeOutCubic(sweep));
        drawCard(
            ctx,
            pose,
            flipPose(local, 0, FLIP_S),
            () =>
                drawCardFace(ctx, card, deck, assets, {
                    since: local - FLIP_S * 0.6,
                    tilt,
                    index: index + 1,
                    of: n,
                }),
            () => drawCardBack(ctx, deck, assets, sway.tilt * 0.3),
        );

        if (style.shine >= 0.6 && local > FLIP_S && local < exitAt) {
            const rng = seeded(index * 101 + 9);
            const hw = (400 * pose.scale) | 0;
            const hh = (560 * pose.scale) | 0;
            for (let i = 0; i < 10; i++) {
                const x = pose.x + (rng() * 2 - 1) * hw * 1.05;
                const y = pose.y + (rng() * 2 - 1) * hh * 1.05;
                const phase = rng() * 6;
                const tw = Math.max(0, Math.sin((local - FLIP_S) * 3.2 + phase));
                drawSparkle(ctx, x, y, (30 + 40 * rng()) * st.u * tw, tw * style.shine);
            }
        }
    };
}

export const CARD_DRAWS: Record<CardBeatId, BeatDraw> = {
    c_grind: cardBeat("c_grind"),
    c_main: cardBeat("c_main"),
    c_climb: cardBeat("c_climb"),
    c_pull: cardBeat("c_pull"),
    c_insert: cardBeat("c_insert"),
};
