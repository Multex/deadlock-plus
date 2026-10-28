import { clamp01, easeInOut, easeOutBack, easeOutCubic, lerp } from "../../../kit/ease";
import { seeded } from "../../../kit/rng";
import type { Ctx } from "../../../kit/types";
import type { SceneAssets } from "../../../scene";
import {
    CARD,
    cardStage,
    dealPose,
    drawCard,
    drawCardFace,
    flipPose,
    rarityOf,
    say,
    type BeatDraw,
    type CardPose,
    type CardStage,
    type Deck,
    type Placement,
} from "./card";
import { pilePose } from "./cards";
import { holoTilt, leanPose } from "./holo";
import { beatSpan, drawSlab, slabGeometry, slabHeld, type SlabGeometry } from "./slab";
import { caption, drawCaption, drawRays, drawSparkle, drawTable, type Caption } from "./table";

const FAN_R = 1100;

/** Card `i` of `n` in the fan, in card units from the fan's centre: an arc, the middle card upright. */
export function fanSlot(i: number, n: number): { x: number; y: number; rot: number } {
    if (n <= 1) return { x: 0, y: 0, rot: 0 };
    const spread = Math.min(Math.PI / 4, 0.13 * (n - 1));
    const rot = (i / (n - 1) - 0.5) * 2 * spread;
    return { x: FAN_R * Math.sin(rot), y: FAN_R * (1 - Math.cos(rot)), rot };
}

/** The fan's size in card units, with its edge cards' corners. */
function fanBox(n: number): { w: number; h: number } {
    const sp = Math.abs(fanSlot(0, n).rot);
    return {
        w: 2 * (FAN_R * Math.sin(sp) + 0.5 * CARD.w * Math.cos(sp) + 0.5 * CARD.h * Math.sin(sp)),
        h: CARD.h * 1.25 + FAN_R * (1 - Math.cos(sp)),
    };
}

interface EndText {
    sign: Caption | null;
    head: Caption | null;
    site: Caption | null;
}

/** The call to action split at its last " · " into the line and the address, so the address gets its own line. */
function endText(ctx: Ctx, deck: Deck, maxW: number, u: number, fonts: SceneAssets["fonts"]): EndText {
    const cta = say(deck, deck.video.fan.cta);
    const cut = cta.lastIndexOf(" · ");
    const head = cut > 0 ? cta.slice(0, cut) : cta;
    const site = cut > 0 ? cta.slice(cut + 3) : "";
    const sign = say(deck, deck.video.fan.sign);
    return {
        sign: sign ? caption(ctx, sign, 52 * u, maxW, fonts, true) : null,
        head: head ? caption(ctx, head, 96 * u, maxW, fonts) : null,
        site: site ? caption(ctx, site, 64 * u, maxW, fonts, true) : null,
    };
}

const heightOf = (c: Caption | null) => (c ? c.lines.length * c.lead : 0);

interface FanLayout {
    text: EndText;
    /** Top-left (or top-centre) of the sign, and of the call to action block. */
    signAt: { x: number; y: number };
    ctaAt: { x: number; y: number };
    center: boolean;
    /** The fan's centre and pixels per card unit. */
    fan: { x: number; y: number; scale: number };
}

/**
 * 9:16 and 1:1 stack the sign, the fan and the call to action (in the safe band in 9:16); 16:9 sets the text in
 * a column on the left and the fan on the right.
 */
function fanLayout(ctx: Ctx, st: CardStage, deck: Deck, fonts: SceneAssets["fonts"], n: number): FanLayout {
    const u = st.u;
    const box = fanBox(n);
    if (st.aspect === "wide") {
        const maxW = 0.36 * st.w;
        const text = endText(ctx, deck, maxW, u, fonts);
        const gap = 28 * u;
        const total = heightOf(text.sign) + gap + heightOf(text.head) + gap + heightOf(text.site);
        const y = st.h / 2 - total / 2;
        const x = 0.06 * st.w;
        const left = 0.46 * st.w;
        const scale = Math.min((st.w - left - 40 * u) / box.w, (0.88 * st.h) / box.h);
        return {
            text,
            signAt: { x, y },
            ctaAt: { x, y: y + heightOf(text.sign) + gap },
            center: false,
            fan: { x: (left + st.w) / 2, y: st.h / 2 - 0.05 * box.h * scale, scale },
        };
    }
    const top = (st.aspect === "tall" ? st.safe.top : 0) + 30 * u;
    const bottom = st.aspect === "tall" ? st.safe.bottom - 10 * u : st.h - 40 * u;
    const text = endText(ctx, deck, st.w - 120 * u, u, fonts);
    const cta = heightOf(text.head) + 16 * u + heightOf(text.site);
    const fanTop = top + heightOf(text.sign) + 30 * u;
    const fanBottom = bottom - cta - 30 * u;
    const scale = Math.min((st.w - 60 * u) / box.w, (fanBottom - fanTop) / box.h);
    return {
        text,
        signAt: { x: st.w / 2, y: top },
        ctaAt: { x: st.w / 2, y: bottom - cta },
        center: true,
        fan: { x: st.w / 2, y: (fanTop + fanBottom) / 2 - 0.08 * box.h * scale, scale },
    };
}

/** The slab in front of the fan, a little larger than a card and lower. */
function slabFront(lay: FanLayout, geo: SlabGeometry): Placement {
    const scale = (lay.fan.scale * CARD.h * 1.12) / geo.h;
    return { x: lay.fan.x, y: lay.fan.y + 0.14 * CARD.h * lay.fan.scale, rot: 0, scale };
}

/**
 * The end card. The dealt cards sweep up off the pile into a fan, the slab drops in front of them, light breaks
 * behind and the call to action lands under it: the line, then the address on its own line.
 */
export const draw: BeatDraw = (ctx, local, span, size, deck, assets) => {
    const st = cardStage(size);
    const u = st.u;
    const cards = deck.video.cards;
    const before = beatSpan(deck, assets, "c_chase") + beatSpan(deck, assets, "c_slab");
    const clock = before + local;
    const lay = fanLayout(ctx, st, deck, assets.fonts, cards.length);
    const settle = clamp01((local - 0.3) / 0.8);
    drawTable(ctx, st, clock + 40, 0.4 + 0.5 * settle);
    drawRays(ctx, lay.fan.x, lay.fan.y, 1300 * u, 0.45 * settle, local * 0.15, "rgb(255 214 140 / 0.45)");

    const n = cards.length;
    const total = n + (deck.video.chase ? 1 : 0);
    cards.forEach((card, i) => {
        const slot = fanSlot(i, n);
        const to: CardPose = {
            x: lay.fan.x + slot.x * lay.fan.scale,
            y: lay.fan.y + slot.y * lay.fan.scale,
            rot: slot.rot,
            scale: lay.fan.scale,
            alpha: 1,
        };
        const from = { ...pilePose(st, i), alpha: st.aspect === "wide" ? 0 : 1 };
        const pose = dealPose(local, 0.04 + i * 0.07, 0.6, from, to);
        const tilt = Math.sin(clock * 0.9 + i * 1.3) * 0.8;
        drawCard(
            ctx,
            pose,
            flipPose(1, 0, 1),
            () => drawCardFace(ctx, card, deck, assets, { since: 10, tilt, index: i + 1, of: total }),
            () => undefined,
            0.8,
        );
    });

    if (deck.video.chase) {
        const geo = slabGeometry(ctx, deck, assets.fonts);
        const held = slabHeld(size, geo, beatSpan(deck, assets, "c_slab"));
        const front = slabFront(lay, geo);
        const k = easeInOut(clamp01((local - 0.1) / 0.65));
        const bob = Math.sin(local * 1.4) * 5 * u * settle;
        const at: Placement = {
            x: lerp(held.x, front.x, k),
            y: lerp(held.y, front.y, k) + bob,
            rot: lerp(held.rot, 0, k) + Math.sin(local * 0.8) * 0.01,
            scale: lerp(held.scale, front.scale, k),
        };
        const tilt = holoTilt(clock);
        drawSlab(ctx, at, leanPose(tilt, 0.3), geo, deck, assets, {
            tilt,
            t: clock,
            print: 1,
            shut: 1,
            flash: 0,
        });
    }

    const rng = seeded(2026);
    for (let i = 0; i < 14; i++) {
        const x = lay.fan.x + (rng() * 2 - 1) * 520 * lay.fan.scale * 1.6;
        const y = lay.fan.y + (rng() * 2 - 1) * 700 * lay.fan.scale;
        const tw = Math.max(0, Math.sin(local * 2.2 + rng() * 6));
        drawSparkle(ctx, x, y, (26 + 40 * rng()) * u * tw, tw * settle);
    }

    const { text, center } = lay;
    if (text.sign) {
        const a = clamp01((local - 0.55) / 0.4);
        drawCaption(ctx, text.sign, lay.signAt.x, lay.signAt.y + (1 - a) * 20 * u, "#f1d688", assets.fonts, {
            body: true,
            center,
            alpha: a,
        });
    }
    if (text.head) {
        const a = clamp01((local - 0.8) / 0.25);
        const slam = lerp(1.15, 1, clamp01(easeOutBack(clamp01((local - 0.8) / 0.35))));
        ctx.save();
        ctx.translate(lay.ctaAt.x, lay.ctaAt.y);
        ctx.scale(slam, slam);
        drawCaption(ctx, text.head, 0, 0, "#f6efdc", assets.fonts, { center, alpha: a });
        ctx.restore();
    }
    if (text.site) {
        const a = easeOutCubic((local - 1.15) / 0.4);
        const y = lay.ctaAt.y + heightOf(text.head) + 16 * u;
        const gold = ctx.createLinearGradient(lay.ctaAt.x - 300 * u, 0, lay.ctaAt.x + 300 * u, 0);
        rarityOf("gold").frame.forEach((c, i, all) => gold.addColorStop(i / (all.length - 1), c));
        drawCaption(ctx, text.site, lay.ctaAt.x, y, gold, assets.fonts, { body: true, center, alpha: a });
    }
};
