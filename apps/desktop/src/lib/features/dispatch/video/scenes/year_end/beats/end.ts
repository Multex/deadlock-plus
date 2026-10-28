import { drawScraps, makeScraps, type Scrap } from "../../../../kinds/year_end/scraps";
import { clamp01, easeInOut, easeOutBack, easeOutCubic, lerp } from "../../../kit/ease";
import { sceneFrame } from "../../../kit/frame";
import type { Ctx } from "../../../kit/types";
import type { SceneAssets, SceneSize } from "../../../scene";
import { INK, dust, goldGradient } from "../draw";
import {
    blockHeight,
    curtain,
    drawRich,
    grain,
    layoutRich,
    richMeasure,
    say,
    seedOf,
    spotlight,
    vignette,
    type Look,
    type Stage,
} from "./stage";

const CTA_MAX = 128;
const CTA_MIN = 96;

const scrapCache = new Map<number, Scrap[]>();
function scrapsFor(seed: number): Scrap[] {
    let s = scrapCache.get(seed);
    if (!s) scrapCache.set(seed, (s = makeScraps(70, seed)));
    return s;
}

/**
 * The end card: the house curtain draws closed behind a black-and-gold invitation that swings up into the
 * spotlight, carrying the brand, the call to action and the address, while the last confetti settles.
 */
export function draw(ctx: Ctx, local: number, span: number, size: SceneSize, data: Stage, assets: SceneAssets): void {
    const { w, h } = size;
    const { u, safe } = sceneFrame(w, h);
    const tall = h > w * 1.2;
    const wide = w > h * 1.2;
    const fonts = assets.fonts;
    const seed = seedOf(`${data.awards.player ?? ""}|end`);

    ctx.fillStyle = INK.room;
    ctx.fillRect(0, 0, w, h);
    spotlight(ctx, w / 2, h * 0.45, w * 0.8, h * 0.5, 0.5);

    const cardW = tall ? w - 150 * u : wide ? 1000 * u : w - 260 * u;
    const padX = 64 * u;
    const innerW = cardW - padX * 2;
    const kicker = say(data, data.awards.preshow.marquee).toLocaleUpperCase();
    const cta = say(data, data.awards.end.cta);
    const url = data.awards.end.url;
    const look = (tag?: string): Look =>
        tag === "kick"
            ? { family: fonts.display, weight: 700, fill: INK.gold, track: 0.22 }
            : tag === "url"
              ? { family: fonts.body, weight: 600, fill: INK.gold, track: 0.03 }
              : { family: fonts.display, weight: 700, fill: INK.cream };
    const measure = richMeasure(ctx, look);
    let px = CTA_MAX * u;
    let ctaLines = layoutRich([{ text: cta, px }], innerW, measure);
    while (px > CTA_MIN * u && ctaLines.length > (tall ? 3 : 2)) {
        px -= 4 * u;
        ctaLines = layoutRich([{ text: cta, px }], innerW, measure);
    }
    const kickLines = layoutRich([{ text: kicker, px: 46 * u, tag: "kick" }], innerW, measure);
    let urlPx = 72 * u;
    while (urlPx > 48 * u && measure(url, urlPx, "url") > innerW) urlPx -= 2 * u;
    const mark = (tall ? 190 : 150) * u;
    const gapS = 34 * u;
    const contentH = mark + gapS + blockHeight(kickLines) + gapS + blockHeight(ctaLines) + gapS * 1.3 + urlPx * 1.2;
    const cardH = contentH + 130 * u;
    const centre = tall ? (safe.top + safe.bottom) / 2 : h * 0.5;
    const cardX = (w - cardW) / 2;
    const cardY = centre - cardH / 2;

    // The curtain closes behind the card over the beat: the show is over.
    const close = easeInOut(local / Math.max(0.5, span * 0.85));
    const edge = lerp(-20 * u, w / 2 + 10 * u, close);
    curtain(ctx, -40 * u, -20 * u, edge + 40 * u, h + 40 * u, u, 24 * u * (1 - close));
    curtain(ctx, w - edge, -20 * u, edge + 40 * u, h + 40 * u, u, -24 * u * (1 - close));
    dust(ctx, w, h, local + 11, u, 0.45, 0.3);

    const rise = easeOutBack(local / 0.6, 1.4);
    const tilt = lerp(0.55, 1, easeOutCubic(local / 0.6));
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.45 * clamp01(local / 0.15);
    ctx.translate(w / 2, centre + (1 - rise) * 260 * u);
    ctx.scale(1, tilt);
    ctx.rotate((1 - rise) * -0.05);
    ctx.translate(-w / 2, -centre);
    invitation(ctx, cardX, cardY, cardW, cardH, u);

    let y = cardY + 60 * u;
    const brand = assets.images.brand;
    if (brand) ctx.drawImage(brand, w / 2 - mark / 2, y, mark, mark);
    else {
        ctx.fillStyle = INK.gold;
        ctx.beginPath();
        ctx.arc(w / 2, y + mark / 2, mark / 2.4, 0, Math.PI * 2);
        ctx.fill();
    }
    y += mark + gapS;
    y += drawRich(ctx, kickLines, w / 2, y, look) + gapS;
    y += drawRich(ctx, ctaLines, w / 2, y, look) + gapS * 1.3;
    ctx.font = `600 ${urlPx}px "${fonts.body}"`;
    ctx.letterSpacing = `${0.03 * urlPx}px`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = goldGradient(ctx, 0, y, 0, y + urlPx);
    ctx.fillText(url, w / 2, y + urlPx * 0.85);
    ctx.letterSpacing = "0px";
    glint(ctx, cardX, cardY, cardW, cardH, local - 0.7, u);
    ctx.restore();

    drawScraps(ctx as unknown as CanvasRenderingContext2D, scrapsFor(seed), {
        t: 1.4 + local * 0.6,
        stage: { width: w, height: h },
        scale: 1.4 * u,
        alpha: 0.85,
        front: true,
    });
    vignette(ctx, w, h, 0.7);
    grain(ctx, w, h, local, u);
}

/** A black card with a double gold frame and stepped art deco corners. */
function invitation(ctx: Ctx, x: number, y: number, w: number, h: number, u: number): void {
    ctx.save();
    ctx.shadowColor = "rgb(0 0 0 / 0.85)";
    ctx.shadowBlur = 60 * u;
    ctx.shadowOffsetY = 30 * u;
    ctx.fillStyle = "#0b0906";
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    const g = goldGradient(ctx, x, y, x + w, y + h);
    ctx.strokeStyle = g;
    ctx.lineWidth = 6 * u;
    ctx.strokeRect(x + 14 * u, y + 14 * u, w - 28 * u, h - 28 * u);
    ctx.lineWidth = 2 * u;
    ctx.strokeRect(x + 28 * u, y + 28 * u, w - 56 * u, h - 56 * u);
    ctx.fillStyle = g;
    for (const [cx, cy, sx, sy] of [
        [x + 28 * u, y + 28 * u, 1, 1],
        [x + w - 28 * u, y + 28 * u, -1, 1],
        [x + 28 * u, y + h - 28 * u, 1, -1],
        [x + w - 28 * u, y + h - 28 * u, -1, -1],
    ]) {
        for (let i = 0; i < 3; i++) {
            const s = (14 + i * 14) * u;
            ctx.fillRect(cx, cy + sy * i * 10 * u - (sy < 0 ? 3 * u : 0), sx * s, 3 * u);
            ctx.fillRect(cx + sx * i * 10 * u - (sx < 0 ? 3 * u : 0), cy, 3 * u, sy * s);
        }
    }
}

/** One sweep of light across the card, `t` seconds after it starts. */
function glint(ctx: Ctx, x: number, y: number, w: number, h: number, t: number, u: number): void {
    if (t < 0 || t > 0.8) return;
    const k = t / 0.8;
    const gx = x - 200 * u + (w + 400 * u) * k;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(gx, y + h / 2);
    ctx.rotate(0.35);
    const g = ctx.createLinearGradient(-90 * u, 0, 90 * u, 0);
    g.addColorStop(0, "rgb(255 230 170 / 0)");
    g.addColorStop(0.5, `rgb(255 236 190 / ${0.28 * (1 - k)})`);
    g.addColorStop(1, "rgb(255 230 170 / 0)");
    ctx.fillStyle = g;
    ctx.fillRect(-90 * u, -h, 180 * u, h * 2);
    ctx.restore();
}
