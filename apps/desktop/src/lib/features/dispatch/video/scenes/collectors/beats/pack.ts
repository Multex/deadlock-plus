import { clamp01, easeInOut, easeOutCubic } from "../../../kit/ease";
import { setFont } from "../../../kit/text";
import type { Ctx } from "../../../kit/types";
import type { SceneAssets } from "../../../scene";
import { cardStage, say, type BeatDraw, type CardStage, type Deck } from "./card";
import { caption, drawCaption, drawSparkle, drawTable, type Caption } from "./table";

/** The foil pack in its own units. The tear runs across it `TEAR_Y` below the top edge. */
export const PACK = { w: 640, h: 1000, crimp: 52, tearY: 92 } as const;

const FOIL = ["#7e818c", "#e6e8ef", "#9da1ae", "#ffffff", "#868a9a", "#d5d8e4", "#767a8a"];
const RAINBOW = ["#ff8fd0", "#ffd77a", "#8dffcf", "#7fd0ff", "#c49bff", "#ff8fd0"];

export interface PackPose {
    /** The pack's turn about its upright axis, in radians; 0 faces the camera. */
    yaw: number;
    /** A light band across the foil, 0 to 1 while it crosses; outside that, none. */
    glint: number;
    /** The strip above the tear line, once it rips: its offset in pack units, turn and opacity. */
    strip?: { x: number; y: number; rot: number; alpha: number };
    /** Light leaking from the slit, 0 to 1. */
    slit?: number;
}

export interface PackPlace {
    x: number;
    y: number;
    /** Pixels per pack unit. */
    scale: number;
    hook: Caption;
    kicker: Caption;
    text: { x: number; y: number; center: boolean };
}

/**
 * Where the pack and its hook go. 9:16 and 1:1 set the hook across the top (of the safe band, in 9:16) and the
 * pack under it; 16:9 sets the hook in a column left of the pack, which stands where the cards will.
 */
export function packPlace(ctx: Ctx, st: CardStage, deck: Deck, fonts: SceneAssets["fonts"]): PackPlace {
    const u = st.u;
    const hookText = say(deck, deck.video.pack.hook);
    const kickerText = say(deck, deck.video.pack.kicker);
    if (st.aspect !== "wide") {
        const maxW = st.w - 120 * u;
        const hook = caption(ctx, hookText, 96 * u, maxW, fonts);
        const kicker = caption(ctx, kickerText, 46 * u, maxW, fonts, true);
        const top = st.safe.top + 24 * u;
        const textBottom = top + hook.lines.length * hook.lead + 18 * u + kicker.lines.length * kicker.lead;
        const floor = st.aspect === "tall" ? st.safe.bottom + 140 * u : st.h - 40 * u;
        const room = floor - textBottom - 40 * u;
        const scale = Math.min(1.05 * u, room / PACK.h);
        return {
            x: st.w / 2,
            y: textBottom + 40 * u + (PACK.h * scale) / 2,
            scale,
            hook,
            kicker,
            text: { x: st.w / 2, y: top, center: true },
        };
    }
    const colW = 0.4 * st.w;
    const hook = caption(ctx, hookText, 96 * u, colW, fonts);
    const kicker = caption(ctx, kickerText, 46 * u, colW, fonts, true);
    const textH = hook.lines.length * hook.lead + 18 * u + kicker.lines.length * kicker.lead;
    return {
        x: st.card.x,
        y: st.h / 2,
        scale: (0.86 * st.h) / PACK.h,
        hook,
        kicker,
        text: { x: 0.06 * st.w, y: st.h / 2 - textH / 2, center: false },
    };
}

function foilAcross(ctx: Ctx, shift: number): CanvasGradient {
    const off = shift * 520;
    const g = ctx.createLinearGradient(-PACK.w / 2 + off, -PACK.h / 2, PACK.w / 2 + off, PACK.h / 2);
    FOIL.forEach((c, i) => g.addColorStop(i / (FOIL.length - 1), c));
    return g;
}

function goldAcross(ctx: Ctx, shift: number): CanvasGradient {
    const off = shift * 300;
    const g = ctx.createLinearGradient(-300 + off, -300, 300 + off, 300);
    for (const [o, c] of [
        [0, "#6e4f14"],
        [0.25, "#f7e7ae"],
        [0.45, "#b88a33"],
        [0.6, "#fff6d0"],
        [0.8, "#9a7425"],
        [1, "#e6c56f"],
    ] as const)
        g.addColorStop(o, c);
    return g;
}

/** The wrapper's outline, crimped top and bottom: the strip above the tear line, or the body below it. */
function wrapperPath(ctx: Ctx, part: "strip" | "body"): void {
    const w = PACK.w / 2;
    const h = PACK.h / 2;
    const teeth = 22;
    const step = PACK.w / teeth;
    const tearY = -h + PACK.tearY;
    ctx.beginPath();
    if (part === "strip") {
        ctx.moveTo(-w, tearY);
        for (let i = 0; i <= teeth; i++) ctx.lineTo(-w + i * step, -h + (i % 2 ? 10 : 0));
        for (let i = teeth * 2; i >= 0; i--) ctx.lineTo(-w + (i * step) / 2, tearY + (i % 2 ? 5 : -5));
        ctx.closePath();
        return;
    }
    for (let i = 0; i <= teeth * 2; i++) ctx.lineTo(-w + (i * step) / 2, tearY + (i % 2 ? 5 : -5));
    ctx.lineTo(w, h);
    for (let i = teeth; i >= 0; i--) ctx.lineTo(-w + i * step, h - (i % 2 ? 10 : 0));
    ctx.closePath();
}

function wrapperFill(ctx: Ctx, deck: Deck, assets: SceneAssets, pose: PackPose, part: "strip" | "body"): void {
    const shift = pose.yaw * 1.6;
    const w = PACK.w / 2;
    const h = PACK.h / 2;
    ctx.save();
    wrapperPath(ctx, part);
    ctx.fillStyle = foilAcross(ctx, shift);
    ctx.fill();
    ctx.clip();
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    const rb = ctx.createLinearGradient(-w + shift * 400, -h, w + shift * 400, h * 0.6);
    RAINBOW.forEach((c, i) => rb.addColorStop(i / (RAINBOW.length - 1), c));
    ctx.fillStyle = rb;
    ctx.fillRect(-w, -h, PACK.w, PACK.h);
    ctx.restore();

    ctx.strokeStyle = "rgb(0 0 0 / 0.18)";
    ctx.lineWidth = 3;
    for (let x = -w + 8; x < w; x += 12) {
        ctx.beginPath();
        ctx.moveTo(x, -h);
        ctx.lineTo(x, -h + PACK.crimp);
        ctx.moveTo(x, h - PACK.crimp);
        ctx.lineTo(x, h);
        ctx.stroke();
    }

    const top = -h + PACK.tearY + 34;
    const bottom = h - PACK.crimp - 30;
    const panel = ctx.createLinearGradient(0, top, 0, bottom);
    panel.addColorStop(0, "#4a1119");
    panel.addColorStop(0.55, "#22070c");
    panel.addColorStop(1, "#0f0306");
    ctx.beginPath();
    ctx.roundRect(-w + 40, top, PACK.w - 80, bottom - top, 26);
    ctx.fillStyle = panel;
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = goldAcross(ctx, shift);
    ctx.stroke();

    const cy = top + (bottom - top) * 0.4;
    ctx.save();
    ctx.translate(0, cy);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = goldAcross(ctx, -shift);
    for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2 + pose.yaw * 0.6;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 300, a, a + Math.PI / 54);
        ctx.closePath();
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 150, 0, Math.PI * 2);
    ctx.fillStyle = "#1a0509";
    ctx.fill();
    ctx.lineWidth = 12;
    ctx.strokeStyle = goldAcross(ctx, shift);
    ctx.stroke();
    const brand = assets.images.brand;
    if (brand) {
        const s = 190 / Math.max(brand.width, brand.height);
        ctx.drawImage(brand, (-brand.width * s) / 2, (-brand.height * s) / 2, brand.width * s, brand.height * s);
    } else {
        setFont(ctx, { family: assets.fonts.display, weight: 700, px: 140 });
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = goldAcross(ctx, shift);
        ctx.fillText("D+", 0, 8);
    }
    ctx.restore();

    const n = deck.video.cards.length + (deck.video.chase ? 1 : 0);
    const cw = 44;
    const gap = 16;
    const rowY = bottom - 170;
    for (let i = 0; i < n; i++) {
        const x = -((n * cw + (n - 1) * gap) / 2) + i * (cw + gap);
        ctx.beginPath();
        ctx.roundRect(x, rowY, cw, cw * 1.4, 6);
        const chase = deck.video.chase && i === n - 1;
        if (chase) {
            const g = ctx.createLinearGradient(x, rowY, x + cw, rowY + cw * 1.4);
            RAINBOW.forEach((c, j) => g.addColorStop(j / (RAINBOW.length - 1), c));
            ctx.fillStyle = g;
        } else ctx.fillStyle = goldAcross(ctx, shift);
        ctx.fill();
    }
    setFont(ctx, { family: assets.fonts.display, weight: 700, px: 52, track: 0.12 });
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = goldAcross(ctx, shift);
    ctx.fillText(`#${deck.video.serial}`, 0, bottom - 60);
    ctx.letterSpacing = "0px";

    const pillow = ctx.createLinearGradient(-w, 0, w, 0);
    pillow.addColorStop(0, "rgb(0 0 0 / 0.45)");
    pillow.addColorStop(0.12, "rgb(0 0 0 / 0)");
    pillow.addColorStop(0.5 + pose.yaw * 0.5, "rgb(255 255 255 / 0.16)");
    pillow.addColorStop(0.88, "rgb(0 0 0 / 0)");
    pillow.addColorStop(1, "rgb(0 0 0 / 0.45)");
    ctx.fillStyle = pillow;
    ctx.fillRect(-w, -h, PACK.w, PACK.h);

    if (pose.glint > 0 && pose.glint < 1) {
        const x = -w - 300 + pose.glint * (PACK.w + 600);
        const g = ctx.createLinearGradient(x - 140, -h, x + 140, -h + 260);
        g.addColorStop(0, "rgb(255 255 255 / 0)");
        g.addColorStop(0.5, "rgb(255 255 255 / 0.6)");
        g.addColorStop(1, "rgb(255 255 255 / 0)");
        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = g;
        ctx.fillRect(-w, -h, PACK.w, PACK.h);
    }
    ctx.restore();
}

/** The sealed pack centred on the origin, in pack units; a ripped strip draws where `pose.strip` puts it. */
export function drawPack(ctx: Ctx, deck: Deck, assets: SceneAssets, pose: PackPose): void {
    const c = Math.cos(pose.yaw);
    ctx.save();
    ctx.transform(Math.max(0.2, c), Math.sin(pose.yaw) * 0.08, 0, 1, 0, 0);
    ctx.save();
    ctx.shadowColor = "rgb(0 0 0 / 0.7)";
    ctx.shadowBlur = 60;
    ctx.shadowOffsetY = 40;
    wrapperPath(ctx, "body");
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.restore();
    wrapperFill(ctx, deck, assets, pose, "body");
    if (pose.slit && pose.slit > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = pose.slit;
        ctx.shadowColor = "#ffe296";
        ctx.shadowBlur = 50;
        ctx.fillStyle = "#fff4cf";
        ctx.fillRect(-PACK.w / 2, -PACK.h / 2 + PACK.tearY - 4, PACK.w, 8);
        ctx.restore();
    }
    const strip = pose.strip ?? { x: 0, y: 0, rot: 0, alpha: 1 };
    if (strip.alpha > 0) {
        ctx.save();
        ctx.globalAlpha *= strip.alpha;
        ctx.translate(PACK.w / 2 + strip.x, -PACK.h / 2 + PACK.tearY / 2 + strip.y);
        ctx.rotate(strip.rot);
        ctx.translate(-PACK.w / 2, PACK.h / 2 - PACK.tearY / 2);
        wrapperFill(ctx, deck, assets, pose, "strip");
        ctx.restore();
    }
    ctx.restore();
}

/** The pack's turn over its beat: a slow sway that comes square to the camera for the tear. */
export function packYaw(local: number, span: number): number {
    return 0.34 * Math.sin(local * 1.3 + 0.8) * (1 - easeInOut((local - (span - 0.55)) / 0.5));
}

/** 0 to 1 while a glint crosses the foil: one on every bar line, `dur` seconds each. */
export function glintAt(local: number, bar: number, dur = 0.55): number {
    const since = ((local % bar) + bar) % bar;
    return since < dur ? since / dur : -1;
}

export const draw: BeatDraw = (ctx, local, span, size, deck, assets) => {
    const st = cardStage(size);
    const bar = assets.timing.barSeconds;
    drawTable(ctx, st, local);
    const place = packPlace(ctx, st, deck, assets.fonts);
    const push = 1 + 0.05 * clamp01(local / span);
    const bob = Math.sin(local * 1.6) * 8 * st.u;
    const yaw = packYaw(local, span);
    ctx.save();
    ctx.translate(place.x, place.y + bob);
    ctx.scale(place.scale * push, place.scale * push);
    drawPack(ctx, deck, assets, { yaw, glint: glintAt(local, bar) });
    const g = glintAt(local, bar);
    if (g >= 0) {
        const big = local < bar ? 1.4 : 1;
        drawSparkle(
            ctx,
            PACK.w * 0.36 * Math.cos(yaw),
            -PACK.h * 0.3,
            120 * big * Math.sin(g * Math.PI),
            Math.sin(g * Math.PI),
        );
    }
    ctx.restore();

    const slam = 1 + 0.06 * (1 - easeOutCubic(local / 0.3));
    const { text } = place;
    ctx.save();
    ctx.translate(text.x, text.y);
    ctx.scale(slam, slam);
    drawCaption(ctx, place.hook, 0, 0, "#f6efdc", assets.fonts, { center: text.center });
    drawCaption(ctx, place.kicker, 0, place.hook.lines.length * place.hook.lead + 18 * st.u, "#f1d688", assets.fonts, {
        body: true,
        center: text.center,
        alpha: clamp01((local - 0.35) / 0.35),
    });
    ctx.restore();
};
