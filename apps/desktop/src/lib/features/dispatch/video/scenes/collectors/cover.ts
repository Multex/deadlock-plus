import type { CollectorsSceneData } from "./data";
import {
    INK,
    badgeFallback,
    drawContained,
    fit,
    foilText,
    font,
    rainbowAcross,
    roundRect,
    type Ctx,
    type Fonts,
} from "./paint";

/** The printed cover's own frame, as `cover.svelte` lays it out. */
export const COVER_W = 720;
export const COVER_H = 1080;
export const MEDAL = { x: 360, y: 478, r: 230 } as const;
const PLATE = { x: 510, y: 974, w: 166, h: 64 } as const;
const TICKS = 72;

type Images = Partial<Record<string, ImageBitmap>>;

function ringGradient(ctx: Ctx, cx: number, cy: number, r: number) {
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, "#8a6420");
    g.addColorStop(0.35, "#fbeec0");
    g.addColorStop(0.6, "#b48731");
    g.addColorStop(1, "#f1d688");
    return g;
}

/** The medal: two rings, the tick bezel and the season line set round it, in medal units (r 230). */
export function drawMedalRing(ctx: Ctx, cx: number, cy: number, s: number, arc: string, fonts: Fonts) {
    const ring = ringGradient(ctx, cx, cy, 230 * s);
    ctx.strokeStyle = ring;
    ctx.lineWidth = 4 * s;
    ctx.beginPath();
    ctx.arc(cx, cy, 224 * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.arc(cx, cy, 178 * s, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < TICKS; i++) {
        const major = i % 6 === 0;
        const a = (i / TICKS) * Math.PI * 2;
        const r0 = 220 * s;
        const r1 = (major ? 206 : 213) * s;
        ctx.lineWidth = (major ? 2.4 : 1.2) * s;
        ctx.beginPath();
        ctx.moveTo(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0);
        ctx.lineTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1);
        ctx.stroke();
    }
    const text = arc.toUpperCase();
    ctx.save();
    ctx.fillStyle = INK.gold;
    ctx.font = font(700, 15 * s, fonts.display);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const widths = [...text].map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0);
    const circumference = 2 * Math.PI * 196 * s;
    const gap = Math.max(0, (circumference - total) / Math.max(1, widths.length));
    let along = 0;
    [...text].forEach((ch, i) => {
        const a = (along + widths[i] / 2) / (196 * s) - Math.PI / 2;
        along += widths[i] + gap;
        ctx.save();
        ctx.translate(cx + Math.cos(a) * 196 * s, cy + Math.sin(a) * 196 * s);
        ctx.rotate(a + Math.PI / 2);
        ctx.fillText(ch, 0, 0);
        ctx.restore();
    });
    ctx.restore();
}

/** The peak badge at the medal's heart, with its tier glow, in medal units. */
export function drawMedalBadge(
    ctx: Ctx,
    cx: number,
    cy: number,
    s: number,
    data: CollectorsSceneData,
    images: Images,
    glow = 0.55,
) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 160 * s);
    g.addColorStop(0, data.tierColor);
    g.addColorStop(0.3, `${data.tierColor}aa`);
    g.addColorStop(1, `${data.tierColor}00`);
    ctx.save();
    ctx.globalAlpha *= glow;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 160 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.shadowColor = "#000000a6";
    ctx.shadowBlur = 18 * s;
    ctx.shadowOffsetY = 14 * s;
    if (!drawContained(ctx, images["badge:peak"], cx, cy, 380 * s)) badgeFallback(ctx, cx, cy, 300 * s, data.tierColor);
    ctx.restore();
}

function frame(ctx: Ctx) {
    const gold = ctx.createLinearGradient(0, 0, COVER_W, COVER_H);
    for (const [o, c] of [
        [0, "#7a5716"],
        [0.3, "#f3dc92"],
        [0.5, "#b48731"],
        [0.75, "#f7e8b4"],
        [1, "#8a6420"],
    ] as const)
        gold.addColorStop(o, c);
    ctx.strokeStyle = gold;
    ctx.lineWidth = 3;
    roundRect(ctx, 16, 16, 688, 1048, 4);
    ctx.stroke();
    ctx.lineWidth = 1;
    roundRect(ctx, 25, 25, 670, 1030, 2);
    ctx.stroke();
    ctx.lineWidth = 3;
    for (const [cx, cy, sx, sy] of [
        [25, 25, 1, 1],
        [695, 25, -1, 1],
        [25, 1055, 1, -1],
        [695, 1055, -1, -1],
    ]) {
        ctx.beginPath();
        ctx.moveTo(cx, cy + sy * 54);
        ctx.lineTo(cx, cy + sy * 12);
        ctx.quadraticCurveTo(cx, cy, cx + sx * 12, cy);
        ctx.lineTo(cx + sx * 54, cy);
        ctx.moveTo(cx + sx * 10, cy + sy * 30);
        ctx.lineTo(cx + sx * 30, cy + sy * 10);
        ctx.stroke();
    }
}

function rays(ctx: Ctx, cx: number, cy: number, reach: number, alpha: number) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, reach);
    g.addColorStop(0, `rgba(255, 226, 150, ${alpha})`);
    g.addColorStop(0.26, `rgba(255, 226, 150, ${alpha})`);
    g.addColorStop(0.55, `rgba(255, 226, 150, ${alpha / 2})`);
    g.addColorStop(1, "rgba(255, 226, 150, 0)");
    ctx.fillStyle = g;
    for (let a = 2; a < 362; a += 12) {
        const a0 = (a * Math.PI) / 180 - Math.PI / 2;
        const a1 = ((a + 4) * Math.PI) / 180 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, reach, a0, a1);
        ctx.closePath();
        ctx.fill();
    }
}

/** Sunburst rays turning round (cx, cy); `turn` in radians. Used behind the medal and the end card too. */
export function drawRays(ctx: Ctx, cx: number, cy: number, reach: number, alpha: number, turn: number) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(turn);
    rays(ctx, 0, 0, reach, alpha);
    ctx.restore();
}

function barcode(ctx: Ctx, bars: number[], x: number, y: number, w: number, h: number) {
    const total = bars.reduce((a, b) => a + b, 0);
    let at = 0;
    ctx.fillStyle = "#111";
    bars.forEach((b, i) => {
        if (i % 2 === 0) ctx.fillRect(x + (at / total) * w, y, (b / total) * w, h);
        at += b;
    });
}

/** The cover as printed, at `r` pixels per cover unit, without the copy-number plate (it stamps on later). */
export function renderCover(data: CollectorsSceneData, images: Images, fonts: Fonts, r: number): OffscreenCanvas {
    const canvas = new OffscreenCanvas(Math.round(COVER_W * r), Math.round(COVER_H * r));
    const ctx = canvas.getContext("2d")!;
    ctx.scale(r, r);
    roundRect(ctx, 0, 0, COVER_W, COVER_H, 6);
    ctx.clip();

    const base = ctx.createLinearGradient(0, 0, 0, COVER_H);
    base.addColorStop(0, "#120d1c");
    base.addColorStop(0.6, "#0a0810");
    base.addColorStop(1, "#07060a");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, COVER_W, COVER_H);
    const tier = ctx.createRadialGradient(360, 475, 0, 360, 475, 324);
    tier.addColorStop(0, `${data.tierColor}9e`);
    tier.addColorStop(1, `${data.tierColor}00`);
    ctx.fillStyle = tier;
    ctx.fillRect(0, 0, COVER_W, COVER_H);
    const warm = ctx.createRadialGradient(360, 1296, 0, 360, 1296, 600);
    warm.addColorStop(0, "#7850148c");
    warm.addColorStop(1, "#78501400");
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, COVER_W, COVER_H);
    rays(ctx, 360, 470, 470, 0.2);
    frame(ctx);

    const t = data.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#e9cf86";
    ctx.font = font(700, 22, fonts.display);
    ctx.letterSpacing = "11px";
    ctx.fillText(t.brand.toUpperCase(), 365, 55);
    ctx.letterSpacing = "2px";
    fit(ctx, t.title.toUpperCase(), 700, 118, fonts.pulp, 640, 70);
    foilText(ctx, t.title.toUpperCase(), 360, 130, 0.32);
    ctx.letterSpacing = "0px";

    const ribbon = ctx.createLinearGradient(0, 196, 0, 242);
    ribbon.addColorStop(0, "#1b1306");
    ribbon.addColorStop(0.6, "#050403");
    ribbon.addColorStop(1, "#1a1207");
    ctx.fillStyle = ribbon;
    ctx.fillRect(0, 196, COVER_W, 46);
    ctx.fillStyle = INK.goldDeep;
    ctx.fillRect(0, 196, COVER_W, 2);
    ctx.fillRect(0, 240, COVER_W, 2);
    ctx.fillStyle = INK.gold;
    ctx.letterSpacing = "5px";
    fit(ctx, t.ribbon.toUpperCase(), 700, 21, fonts.display, 620, 12);
    ctx.fillText(t.ribbon.toUpperCase(), 362, 220);
    ctx.letterSpacing = "0px";

    drawMedalRing(ctx, MEDAL.x, MEDAL.y, 1, t.arc, fonts);
    drawMedalBadge(ctx, MEDAL.x, MEDAL.y, 1, data, images);

    fit(ctx, t.peakName.toUpperCase(), 700, 96, fonts.pulp, 640, 48);
    foilText(ctx, t.peakName.toUpperCase(), 360, 762, 0.4);
    ctx.fillStyle = INK.creamSoft;
    fit(ctx, t.peakLine, 500, 24, fonts.body, 640, 14);
    ctx.fillText(t.peakLine, 360, 828);

    ctx.fillStyle = "#c9a24a99";
    ctx.fillRect(44, 862, 632, 1);
    ctx.fillRect(44, 930, 632, 1);
    ctx.fillRect(486, 862, 1, 68);
    ctx.textAlign = "left";
    ctx.fillStyle = INK.goldDeep;
    ctx.letterSpacing = "3px";
    ctx.font = font(700, 14, fonts.display);
    ctx.fillText(t.theClimb.toUpperCase(), 48, 882);
    ctx.fillText(t.rankedRecord.toUpperCase(), 504, 882);
    ctx.letterSpacing = "0px";
    ctx.fillStyle = "#f7ecd0";
    if (data.hasClimb) {
        const size = fit(ctx, `${t.startLabel} → ${t.endLabel}`, 700, 24, fonts.display, 360, 14);
        let x = 48;
        const icon = size * 1.4;
        const part = (key: string, label: string) => {
            if (drawContained(ctx, images[key], x + icon / 2, 910, icon)) x += icon + 6;
            ctx.fillText(label, x, 912);
            x += ctx.measureText(label).width + 10;
        };
        part("badge:start", t.startLabel);
        ctx.fillStyle = INK.gold;
        ctx.fillText("→", x, 912);
        x += ctx.measureText("→").width + 10;
        ctx.fillStyle = "#f7ecd0";
        part("badge:end", t.endLabel);
    } else {
        fit(ctx, t.peakName, 700, 24, fonts.display, 420, 14);
        ctx.fillText(t.peakName, 48, 912);
    }
    const record = recordText(data);
    fit(ctx, record, 700, 40, fonts.pulp, 160, 20);
    ctx.fillText(record, 504, 912);

    ctx.fillStyle = INK.paper;
    ctx.fillRect(44, 974, 132, 64);
    barcode(ctx, data.bars, 51, 980, 118, 40);
    ctx.fillStyle = "#111";
    ctx.textAlign = "center";
    ctx.letterSpacing = "1px";
    fit(ctx, t.code, 600, 10, fonts.display, 120, 6);
    ctx.fillText(t.code, 110, 1029);
    ctx.letterSpacing = "2px";
    ctx.fillStyle = INK.goldDeep;
    fit(ctx, t.dates.toUpperCase(), 700, 13, fonts.display, 290, 8);
    ctx.fillText(t.dates.toUpperCase(), 343, 996);
    ctx.letterSpacing = "0px";
    ctx.fillStyle = INK.creamSoft;
    fit(ctx, t.teaser, 500, 16, fonts.body, 300, 9);
    ctx.fillText(t.teaser, 343, 1018);
    return canvas;
}

export function recordText(data: CollectorsSceneData, wins = data.record.wins, losses = data.record.losses) {
    const n = new Intl.NumberFormat(data.locale);
    return data.text.recordValue.replace("{wins}", n.format(wins)).replace("{losses}", n.format(losses));
}

/** The copy-number plate in cover units; `pose` scales and turns it about its centre while it stamps. */
export function drawPlate(ctx: Ctx, data: CollectorsSceneData, fonts: Fonts, scale = 1, alpha = 1) {
    if (alpha <= 0) return;
    const cx = PLATE.x + PLATE.w / 2;
    const cy = PLATE.y + PLATE.h / 2;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(cx, cy);
    ctx.rotate((-2 * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.shadowColor = "#00000080";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    const g = ctx.createLinearGradient(0, -PLATE.h / 2, 0, PLATE.h / 2);
    g.addColorStop(0, "#fbf4df");
    g.addColorStop(1, "#eadfbf");
    ctx.fillStyle = g;
    ctx.fillRect(-PLATE.w / 2, -PLATE.h / 2, PLATE.w, PLATE.h);
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "#b48731";
    ctx.lineWidth = 2;
    ctx.strokeRect(-PLATE.w / 2, -PLATE.h / 2, PLATE.w, PLATE.h);
    ctx.lineWidth = 1;
    ctx.strokeRect(-PLATE.w / 2 + 4, -PLATE.h / 2 + 4, PLATE.w - 8, PLATE.h - 8);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#6a4a12";
    ctx.letterSpacing = "2.6px";
    fit(ctx, data.text.yourCopy.toUpperCase(), 700, 11, fonts.display, 140, 7);
    ctx.fillText(data.text.yourCopy.toUpperCase(), 0, -16);
    ctx.letterSpacing = "1.5px";
    ctx.fillStyle = INK.red;
    ctx.font = font(700, 14, fonts.display);
    const no = ctx.measureText(data.text.copyNo).width;
    ctx.font = font(700, 30, fonts.display);
    const serial = ctx.measureText(data.serial).width;
    const left = -(no + 4 + serial) / 2;
    ctx.textAlign = "left";
    ctx.font = font(700, 14, fonts.display);
    ctx.fillText(data.text.copyNo, left, 12);
    ctx.font = font(700, 30, fonts.display);
    ctx.fillText(data.serial, left + no + 4, 8);
    ctx.letterSpacing = "0px";
    ctx.restore();
}

/** The holographic wash and glare that follow a light at (mx, my), both 0 to 1 over the cover. */
export function drawGloss(ctx: Ctx, mx: number, my: number, strength: number) {
    ctx.save();
    roundRect(ctx, 0, 0, COVER_W, COVER_H, 6);
    ctx.clip();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.1 + strength * 0.26;
    ctx.fillStyle = rainbowAcross(ctx, 0, COVER_W, mx);
    ctx.fillRect(0, 0, COVER_W, COVER_H);
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = 0.6 + strength * 0.4;
    const gx = mx * COVER_W;
    const gy = my * COVER_H;
    const glare = ctx.createRadialGradient(gx, gy, 0, gx, gy, 700);
    glare.addColorStop(0, "#ffffff52");
    glare.addColorStop(0.28 * 0.7, "#ffffff0f");
    glare.addColorStop(0.55 * 0.7, "#ffffff00");
    ctx.fillStyle = glare;
    ctx.fillRect(0, 0, COVER_W, COVER_H);
    ctx.restore();
}

/** A rainbow foil band sweeping across the cover; `p` 0 to 1 carries it from left to right. */
export function drawSweep(ctx: Ctx, p: number) {
    if (p <= 0 || p >= 1) return;
    ctx.save();
    roundRect(ctx, 0, 0, COVER_W, COVER_H, 6);
    ctx.clip();
    const x = -400 + p * (COVER_W + 800);
    ctx.translate(x, COVER_H / 2);
    ctx.transform(1, 0, -0.21, 1, 0, 0);
    const g = ctx.createLinearGradient(-180, 0, 180, 0);
    g.addColorStop(0, "#00000000");
    g.addColorStop(0.25, "#ffe67859");
    g.addColorStop(0.45, "#fffffff2");
    g.addColorStop(0.6, "#8cfff073");
    g.addColorStop(0.75, "#dc8cff59");
    g.addColorStop(1, "#00000000");
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = g;
    ctx.fillRect(-180, -COVER_H, 360, COVER_H * 2);
    ctx.restore();
}
