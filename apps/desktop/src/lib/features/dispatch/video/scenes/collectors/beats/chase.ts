import { flashAt } from "../../../kit/beat";
import { clamp01, easeInOut, easeOutBack, easeOutCubic, lerp } from "../../../kit/ease";
import { shake } from "../../../kit/motion";
import { seeded } from "../../../kit/rng";
import { setFont } from "../../../kit/text";
import type { Ctx } from "../../../kit/types";
import type { SceneAssets } from "../../../scene";
import { chaseFlipBar } from "../plan";
import {
    CARD,
    cardStage,
    drawCard,
    drawCardBack,
    drawCardFace,
    flipPose,
    holdSway,
    restPose,
    say,
    type BeatDraw,
    type CardStage,
    type Deck,
    type Placement,
} from "./card";
import { drawPile } from "./cards";
import { drawAura, drawHolo, drawRainbowEdge, holoTilt, leanPose } from "./holo";
import { caption, drawCaption, drawRays, drawSparkle, drawTable, type Caption } from "./table";

export interface ChaseTimes {
    /** The card is off the stack and trembling from here. */
    lift: number;
    flipStart: number;
    flipDur: number;
    /** The holo sound and the burst: the plan's flip bar. */
    reveal: number;
    /** The "one of one" seal slams onto the face. */
    stamp: number;
}

/** The chase's clock: the build up to the flip bar, the flip turning the face up just after it, then the seal. */
export function chaseTimes(span: number, bar: number): ChaseTimes {
    const bars = Math.max(1, Math.round(span / bar));
    const reveal = chaseFlipBar(bars) * bar;
    const flipDur = 0.42;
    return {
        lift: Math.min(0.7, reveal * 0.4),
        flipStart: reveal - 0.12,
        flipDur,
        reveal,
        stamp: reveal + Math.min(1.1, (span - reveal) * 0.35),
    };
}

/** The held chase card: the card's spot, swaying; the slab starts from here. */
export function chaseHeld(st: CardStage, t: number): Placement {
    const sway = holdSway(t, 4.2);
    return { x: st.card.x, y: st.card.y + sway.bob * st.u, rot: sway.rot, scale: st.scale };
}

interface Tease {
    cap: Caption | null;
    x: number;
    y: number;
    center: boolean;
    /** The trembling card, clear of the caption. */
    pose: Placement;
}

/** The tease over the card in 9:16 and 1:1, with the card lowered and smaller under it; a left column in 16:9. */
function teaseLayout(ctx: Ctx, st: CardStage, text: string, fonts: SceneAssets["fonts"]): Tease {
    const u = st.u;
    if (st.aspect === "wide") {
        const cap = text ? caption(ctx, text, 96 * u, 0.36 * st.w, fonts) : null;
        const h = cap ? cap.lines.length * cap.lead : 0;
        return {
            cap,
            x: 0.06 * st.w,
            y: st.h / 2 - h / 2,
            center: false,
            pose: { x: st.card.x, y: st.card.y, rot: 0, scale: st.scale * 0.88 },
        };
    }
    const top = (st.aspect === "tall" ? st.safe.top : 0) + 40 * u;
    const cap = text ? caption(ctx, text, 96 * u, st.w - 120 * u, fonts) : null;
    const capBottom = top + (cap ? cap.lines.length * cap.lead : 0) + 36 * u;
    const floor = st.aspect === "tall" ? st.safe.bottom + 120 * u : st.h - 36 * u;
    const scale = Math.min(st.scale * 0.82, (floor - capBottom) / CARD.h);
    return {
        cap,
        x: st.w / 2,
        y: top,
        center: true,
        pose: { x: st.card.x, y: capBottom + (CARD.h * scale) / 2, rot: 0, scale },
    };
}

/** The "one of one" seal: a rainbow foil tag that slams down across the card's bottom edge. */
export function drawStamp(ctx: Ctx, deck: Deck, assets: SceneAssets, since: number, tilt: number): void {
    const chase = deck.video.chase!;
    const text = say(deck, chase.stamp).toUpperCase();
    if (!text || since < 0) return;
    // A tag across the card's bottom edge: it covers only the set number and serial, never the name, the art's
    // picture, the number medallion or the line.
    setFont(ctx, { family: assets.fonts.display, weight: 700, px: 54, track: 0.1 });
    const tw = Math.min(CARD.w - 220, ctx.measureText(text).width);
    const w = tw + 70;
    const h = 96;
    const x = 0;
    const y = CARD.h / 2 - 8;
    const k = easeOutBack(clamp01(since / 0.28), 2.4);
    const scale = lerp(2.4, 1, clamp01(k));
    ctx.save();
    ctx.globalAlpha = clamp01(since / 0.12);
    ctx.translate(x, y);
    ctx.rotate(-0.03);
    ctx.scale(scale, scale);
    ctx.shadowColor = "rgb(0 0 0 / 0.6)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 18);
    const g = ctx.createLinearGradient(-w / 2 + tilt * 120, -h, w / 2 + tilt * 120, h);
    ["#ffd6f0", "#fff2b8", "#c8ffe0", "#c4ecff", "#e4d2ff"].forEach((c, i) => g.addColorStop(i / 4, c));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#1a0f2a";
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 9, -h / 2 + 9, w - 18, h - 18, 12);
    ctx.stroke();
    ctx.fillStyle = "#1a0f2a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fit = ctx.measureText(text).width;
    if (fit > tw) setFont(ctx, { family: assets.fonts.display, weight: 700, px: (54 * tw) / fit, track: 0.1 });
    ctx.fillText(text, 0, 4);
    ctx.letterSpacing = "0px";
    ctx.restore();
}

/** Foil flecks thrown out from the card at the burst, in pixels. */
function burstFlecks(ctx: Ctx, x: number, y: number, dt: number, u: number): void {
    if (dt < 0 || dt > 2) return;
    const rng = seeded(8086);
    ctx.save();
    for (let i = 0; i < 90; i++) {
        const a = rng() * Math.PI * 2;
        const v = (700 + rng() * 1500) * u;
        const drag = 2.2 + rng();
        const travel = (v / drag) * (1 - Math.exp(-drag * dt));
        const px = x + Math.cos(a) * travel;
        const py = y + Math.sin(a) * travel + 260 * u * dt * dt;
        const life = 0.9 + rng() * 1.1;
        const alpha = clamp01(1 - dt / life);
        if (alpha <= 0) continue;
        const s = (6 + rng() * 14) * u;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(px, py);
        ctx.rotate(dt * (rng() - 0.5) * 24 + a);
        ctx.fillStyle = `hsl(${Math.round(rng() * 360)} 100% ${70 + rng() * 20}%)`;
        ctx.fillRect(-s, -s / 3, 2 * s, (2 * s) / 3);
        ctx.restore();
    }
    ctx.restore();
}

/** Rainbow rings racing out from the card at the burst. */
function shockwave(ctx: Ctx, st: CardStage, x: number, y: number, dt: number): void {
    for (const [lag, hue] of [
        [0, 300],
        [0.12, 180],
    ] as const) {
        const k = (dt - lag) / 0.9;
        if (k < 0 || k > 1) continue;
        const r = easeOutCubic(k) * Math.max(st.w, st.h) * 0.95;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.lineWidth = 46 * st.u * (1 - k);
        ctx.strokeStyle = `hsl(${(hue + dt * 300) % 360} 100% 70% / ${0.7 * (1 - k)})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}

/**
 * The chase card. The room dims and the last card lifts off the stack; it trembles harder on every beat while
 * rainbow light leaks round its edges. On the flip bar it turns over in a white burst, rings and foil flecks,
 * surges to full size and sways in the light: the holo foil, its glints and the light sweep all move with it,
 * then the "one of one" seal slams on.
 */
export const draw: BeatDraw = (ctx, local, span, size, deck, assets) => {
    const st = cardStage(size);
    const chase = deck.video.chase;
    const cards = deck.video.cards;
    const u = st.u;
    if (!chase) {
        drawTable(ctx, st, local);
        drawPile(ctx, st, deck, assets, cards.length);
        return;
    }
    const bar = assets.timing.barSeconds;
    const beat = bar / 4;
    const T = chaseTimes(span, bar);
    const n = cards.length + 1;
    const turned = T.flipStart + T.flipDur / 2;
    const build = clamp01(local / T.reveal);
    const after = local - T.reveal;
    const burst = flashAt(local, turned);
    const sinceFlip = local - (T.flipStart + T.flipDur);

    const glow = after >= 0 ? 0.5 + 1.2 * burst : 0;
    drawTable(ctx, st, local + 40, glow);
    if (st.aspect !== "wide" || after > 0) drawPile(ctx, st, deck, assets, cards.length);
    const dim = Math.min(easeOutCubic(local / 0.6), 1 - 0.55 * easeOutCubic(after / 1.4));
    ctx.fillStyle = `rgb(4 2 8 / ${(st.aspect === "wide" ? 0.82 : 0.68) * dim})`;
    ctx.fillRect(0, 0, st.w, st.h);

    const tease = teaseLayout(ctx, st, say(deck, chase.tease), assets.fonts);
    const rest = restPose(st);
    const pulse = local < T.reveal ? Math.exp(-(local % beat) / 0.09) * build : 0;
    const amp = build ** 2.2 * 11 * u;
    const trembling: Placement = {
        x: tease.pose.x + amp * (Math.sin(local * 91) + 0.5 * Math.sin(local * 137)),
        y: tease.pose.y + amp * Math.cos(local * 83),
        rot: build ** 2 * 0.025 * Math.sin(local * 67),
        scale: tease.pose.scale * (1 + 0.03 * pulse),
    };
    const lifted = easeInOut(local / T.lift);
    const lifting: Placement = {
        x: lerp(rest.x, trembling.x, lifted),
        y: lerp(rest.y, trembling.y, lifted),
        rot: lerp(rest.rot, trembling.rot, lifted),
        scale: lerp(rest.scale, trembling.scale, lifted),
    };
    const held = chaseHeld(st, local);
    const surge = easeOutBack(clamp01((local - T.flipStart) / 0.6), 1.6);
    let pose: Placement =
        local < T.flipStart
            ? lifting
            : {
                  x: lerp(tease.pose.x, held.x, surge),
                  y: lerp(tease.pose.y, held.y, surge),
                  rot: lerp(0, held.rot, clamp01(surge)),
                  scale: lerp(tease.pose.scale, held.scale, surge),
              };
    const [sx, sy] = shake(local - turned, 26 * u, 5);
    pose = { ...pose, x: pose.x + sx, y: pose.y + sy };

    const tilt =
        local < T.flipStart + T.flipDur ? -1 + 2 * clamp01((local - T.flipStart) / T.flipDur) : holoTilt(local);
    const flip =
        local < T.flipStart + T.flipDur
            ? flipPose(local, T.flipStart, T.flipDur)
            : leanPose(tilt, easeOutCubic(sinceFlip / 0.6));

    const hueSpin = local * 0.35;
    if (build > 0.15 && after < 0) {
        drawRays(
            ctx,
            pose.x,
            pose.y,
            820 * st.scale,
            build ** 2 * 0.8,
            hueSpin,
            `hsl(${(local * 120) % 360} 100% 70% / 0.5)`,
        );
    }
    if (after >= -0.05) {
        const k = 0.45 + 1.3 * burst;
        drawRays(ctx, pose.x, pose.y, 1500 * u, k, hueSpin, `hsl(${(local * 80) % 360} 100% 72% / 0.55)`);
        drawRays(
            ctx,
            pose.x,
            pose.y,
            1100 * u,
            k * 0.7,
            -hueSpin * 1.4,
            `hsl(${(local * 80 + 150) % 360} 100% 72% / 0.45)`,
        );
        shockwave(ctx, st, pose.x, pose.y, local - turned);
    }

    const auraPower =
        local < turned ? build ** 1.6 * 0.95 + pulse * 0.35 : 0.55 + 0.25 * Math.sin(local * 3) + 1.4 * burst;
    drawAura(ctx, pose, flip, local, auraPower);

    const holoPower = clamp01((local - turned) / 0.5);
    drawCard(
        ctx,
        pose,
        flip,
        () => {
            drawCardFace(ctx, chase, deck, assets, { since: local - turned, tilt, index: n, of: n });
            drawHolo(ctx, tilt, local, holoPower);
            drawStamp(ctx, deck, assets, local - T.stamp, tilt);
        },
        () => {
            drawCardBack(ctx, deck, assets, Math.sin(local * 1.7) * 0.6);
            drawRainbowEdge(ctx, local, build ** 1.8 + pulse * 0.4);
        },
    );

    if (local < turned) {
        const rng = seeded(311);
        const count = Math.floor(6 + 22 * build);
        const hw = (CARD.w / 2) * pose.scale;
        const hh = (CARD.h / 2) * pose.scale;
        for (let i = 0; i < count; i++) {
            const side = rng();
            const edge = rng() * 2 - 1;
            const ex = side < 0.5 ? edge * hw : (side < 0.75 ? -1 : 1) * hw;
            const ey = side < 0.5 ? (side < 0.25 ? -1 : 1) * hh : edge * hh;
            const phase = rng() * 4;
            const rise = ((local * 0.7 + phase) % 1.6) / 1.6;
            const tw = Math.sin(rise * Math.PI);
            drawSparkle(ctx, pose.x + ex, pose.y + ey - rise * 120 * u, (18 + 26 * rng()) * u * tw, tw * build);
        }
    } else {
        burstFlecks(ctx, pose.x, pose.y, local - turned, u);
        const rng = seeded(97);
        const hw = (CARD.w / 2) * pose.scale;
        const hh = (CARD.h / 2) * pose.scale;
        for (let i = 0; i < 16; i++) {
            const x = pose.x + (rng() * 2 - 1) * hw * 1.25;
            const y = pose.y + (rng() * 2 - 1) * hh * 1.1;
            const tw = Math.max(0, Math.sin((local - turned) * 2.6 + rng() * 6));
            drawSparkle(ctx, x, y, (36 + 50 * rng()) * u * tw, tw * holoPower);
        }
    }

    if (tease.cap) {
        const alpha = clamp01((local - 0.25) / 0.35) * clamp01((T.flipStart - 0.05 - local) / 0.25);
        const fill = ctx.createLinearGradient(tease.x - 400 * u, 0, tease.x + 400 * u, 0);
        ["#ffd6f0", "#fff6dc", "#c4ecff"].forEach((c, i) => fill.addColorStop(i / 2, c));
        drawCaption(ctx, tease.cap, tease.x, tease.y, fill, assets.fonts, { center: tease.center, alpha });
    }

    if (burst > 0) {
        ctx.fillStyle = `rgb(255 252 245 / ${0.92 * burst})`;
        ctx.fillRect(0, 0, st.w, st.h);
    }
};
