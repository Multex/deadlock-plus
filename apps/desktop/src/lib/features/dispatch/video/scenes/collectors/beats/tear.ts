import { flashAt } from "../../../kit/beat";
import { clamp01, easeOutCubic } from "../../../kit/ease";
import { shake } from "../../../kit/motion";
import { seeded } from "../../../kit/rng";
import type { Ctx } from "../../../kit/types";
import {
    burstSlot,
    cardStage,
    dealPose,
    drawCard,
    drawCardBack,
    flipPose,
    restPose,
    say,
    type BeatDraw,
    type CardPose,
    type CardStage,
} from "./card";
import { drawPack, packPlace, PACK } from "./pack";
import { caption, drawCaption, drawRays, drawTable } from "./table";

/** When card `i` of `n` leaves the pack, and when the fan gathers back into the stack, in seconds into the beat. */
export function tearTimes(span: number, n: number): { rise: (i: number) => number; gather: number; settled: number } {
    const settled = Math.max(0.9, span - 0.12);
    const gather = Math.max(0.62, Math.min(settled - 0.45, span * 0.55));
    const spread = Math.min(0.06, 0.3 / Math.max(1, n));
    return { rise: (i) => 0.1 + i * spread, gather, settled };
}

const RISE = 0.34;

/** Foil flecks thrown off the tear line, `dt` seconds after the rip, in pack units. */
function flecks(ctx: Ctx, dt: number): void {
    if (dt < 0 || dt > 1) return;
    const rng = seeded(5150);
    for (let i = 0; i < 40; i++) {
        const x0 = (rng() - 0.5) * PACK.w;
        const vx = (rng() - 0.3) * 900;
        const vy = -300 - rng() * 700;
        const x = x0 + vx * dt;
        const y = -PACK.h / 2 + PACK.tearY + vy * dt + 1400 * dt * dt;
        const a = clamp01(1 - dt / (0.5 + rng() * 0.5));
        if (a <= 0) continue;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(x, y);
        ctx.rotate(dt * (rng() - 0.5) * 20);
        ctx.fillStyle = rng() > 0.6 ? `hsl(${Math.round(rng() * 360)} 90% 82%)` : "#f4f2ee";
        const s = 6 + rng() * 10;
        ctx.fillRect(-s, -s / 3, 2 * s, (2 * s) / 3);
        ctx.restore();
    }
}

/** The caption's spot: under the fan in 9:16 and 1:1, the hook's column in 16:9. */
function captionAt(ctx: Ctx, st: CardStage, text: string, fonts: Parameters<typeof caption>[4]) {
    const u = st.u;
    if (st.aspect !== "wide") {
        const c = caption(ctx, text, 96 * u, st.w - 120 * u, fonts);
        const bottom = st.aspect === "tall" ? st.safe.bottom : st.h - 30 * u;
        return { c, x: st.w / 2, y: bottom - c.lines.length * c.lead - 20 * u, center: true };
    }
    const c = caption(ctx, text, 96 * u, 0.4 * st.w, fonts);
    return { c, x: 0.06 * st.w, y: st.h / 2 - (c.lines.length * c.lead) / 2, center: false };
}

export const draw: BeatDraw = (ctx, local, span, size, deck, assets) => {
    const st = cardStage(size);
    const n = deck.video.cards.length + (deck.video.chase ? 1 : 0);
    const times = tearTimes(span, n);
    const flash = flashAt(local, 0.02);
    drawTable(ctx, st, local + 4, flash * 0.6);
    const place = packPlace(ctx, st, deck, assets.fonts);
    const [sx, sy] = shake(local, 14 * st.u, 3);
    ctx.save();
    ctx.translate(sx, sy);

    const fade = clamp01(1 - local / 0.22);
    if (fade > 0) {
        ctx.save();
        ctx.translate(place.text.x, place.text.y);
        drawCaption(ctx, place.hook, 0, 0, "#f6efdc", assets.fonts, { center: place.text.center, alpha: fade });
        drawCaption(
            ctx,
            place.kicker,
            0,
            place.hook.lines.length * place.hook.lead + 18 * st.u,
            "#f1d688",
            assets.fonts,
            {
                body: true,
                center: place.text.center,
                alpha: fade,
            },
        );
        ctx.restore();
    }

    const mouth = { x: place.x, y: place.y + (-PACK.h / 2 + PACK.tearY) * place.scale };
    const drop = easeOutCubic((local - 0.28) / 0.5) ** 2;
    const packAlpha = clamp01(1 - (local - 0.45) / 0.35);
    const cardScale = place.scale * 0.62;
    const rest = restPose(st);
    const tilt = Math.sin(local * 2) * 0.5;

    const cardAt = (i: number): CardPose | null => {
        const start = times.rise(i);
        if (local < start) return null;
        const slot = burstSlot(i, n);
        const fan: CardPose = {
            x: st.card.x + slot.x * cardScale,
            y: st.card.y + ((slot.y + 760) * 0.62 - 140) * cardScale,
            rot: slot.rot,
            scale: cardScale,
            alpha: 1,
        };
        const inside: CardPose = { x: mouth.x, y: mouth.y + 300 * cardScale, rot: 0, scale: cardScale * 0.9, alpha: 1 };
        if (local < times.gather) return dealPose(local, start, RISE, inside, fan);
        const stacked: CardPose = {
            x: rest.x + i * 7 * rest.scale,
            y: rest.y + i * 9 * rest.scale,
            rot: rest.rot + i * 0.006,
            scale: rest.scale,
            alpha: 1,
        };
        const order = n - 1 - i;
        const each = (times.settled - times.gather) / Math.max(1, n);
        return dealPose(local, times.gather + order * each * 0.6, Math.max(0.2, each * 1.6), fan, stacked);
    };

    const back = () => drawCardBack(ctx, deck, assets, tilt);
    const behind = local < times.gather;
    const drawCards = () => {
        for (let i = n - 1; i >= 0; i--) {
            const p = cardAt(i);
            if (p) drawCard(ctx, p, flipPose(0, 1, 1), () => undefined, back, local < times.gather ? 0.6 : 1);
        }
    };

    if (behind) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, st.w, mouth.y + drop * PACK.h * place.scale);
        ctx.clip();
        drawCards();
        ctx.restore();
    }

    if (packAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = packAlpha;
        ctx.translate(place.x, place.y + drop * PACK.h * place.scale * 1.2);
        ctx.rotate(drop * 0.12);
        ctx.scale(place.scale, place.scale);
        const e = easeOutCubic(local / 0.6);
        drawPack(ctx, deck, assets, {
            yaw: 0,
            glint: -1,
            strip: { x: 260 * e, y: -520 * e, rot: 0.9 * e, alpha: clamp01(1 - (local - 0.2) / 0.35) },
            slit: Math.max(flash, clamp01(1 - (local - 0.1) / 0.5) * 0.7),
        });
        flecks(ctx, local);
        ctx.restore();
    }
    drawRays(
        ctx,
        mouth.x,
        mouth.y,
        520 * st.u,
        flash + clamp01(1 - local / 0.7) * 0.5,
        local * 0.4,
        "rgb(255 226 150 / 0.55)",
    );

    if (!behind) drawCards();
    ctx.restore();

    const deal = say(deck, deck.video.tear.deal);
    if (deal) {
        const at = captionAt(ctx, st, deal, assets.fonts);
        const alpha = clamp01((local - 0.28) / 0.2) * clamp01(1 - (local - times.gather + 0.1) / 0.15);
        drawCaption(ctx, at.c, at.x, at.y, "#f6efdc", assets.fonts, { center: at.center, alpha });
    }
};
