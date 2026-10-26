import { barsOf } from "../../../../kinds/collectors/model";
import { flashAt } from "../../../kit/beat";
import { clamp01, easeInOut, easeOutCubic, lerp } from "../../../kit/ease";
import { shake } from "../../../kit/motion";
import { setFont, wrap } from "../../../kit/text";
import type { Ctx } from "../../../kit/types";
import type { SceneAssets, SceneSize } from "../../../scene";
import { collectorsPlan, type CollectorsBeatId } from "../plan";
import {
    CARD,
    cardStage,
    drawCardFace,
    rarityOf,
    say,
    type BeatDraw,
    type CardStage,
    type Deck,
    type FlipPose,
    type Placement,
} from "./card";
import { drawPile } from "./cards";
import { chaseHeld, drawStamp } from "./chase";
import { drawHolo, holoTilt, leanPose } from "./holo";
import { caption, drawCaption, drawSparkle, drawTable } from "./table";

/** The graded case in card units: the label on top, the card in its well under it. */
export const SLAB = { w: 1000, pad: 50, gap: 30, r: 58, labelPx: 56, labelLead: 66 } as const;

const STICKER = 96;
const LABEL_TEXT_W = SLAB.w - 2 * SLAB.pad - 64 - 2 * STICKER - 30;

export interface SlabTimes {
    /** The card is down in its well. */
    seated: number;
    /** The case clicks shut: the slab sound. */
    click: number;
}

/** The slab's clock: the card slides into the case through its first bar and the case clicks shut on the bar line. */
export function slabTimes(span: number, bar: number): SlabTimes {
    const bars = Math.max(1, Math.round(span / bar));
    const click = Math.min(1, bars - 1) * bar;
    return { seated: Math.max(0, click - 0.1), click };
}

export interface SlabGeometry {
    w: number;
    h: number;
    labelH: number;
    label: string[];
    seal: string[];
    /** The well's centre, from the slab's centre. */
    cardY: number;
}

/** Lines no wider than `max`, broken at the " · " separators first, so no line ends on a dot. */
export function wrapParts(ctx: Ctx, str: string, max: number): string[] {
    const lines: string[] = [];
    let line = "";
    for (const part of str.split(" · ")) {
        const next = line ? `${line} · ${part}` : part;
        if (ctx.measureText(next).width <= max) {
            line = next;
            continue;
        }
        if (line) lines.push(line);
        const words = wrap(ctx, part, max);
        line = words.pop() ?? "";
        lines.push(...words);
    }
    if (line) lines.push(line);
    return lines;
}

/** The case's size and its label's lines; the label grows with its text. */
export function slabGeometry(ctx: Ctx, deck: Deck, fonts: SceneAssets["fonts"]): SlabGeometry {
    setFont(ctx, { family: fonts.body, weight: 600, px: SLAB.labelPx });
    const label = wrapParts(ctx, say(deck, deck.video.slab.label), LABEL_TEXT_W).slice(0, 4);
    setFont(ctx, { family: fonts.display, weight: 700, px: SLAB.labelPx, track: 0.06 });
    const seal = wrapParts(ctx, say(deck, deck.video.slab.seal).toUpperCase(), LABEL_TEXT_W).slice(0, 2);
    const labelH = Math.max(2 * STICKER + 120, 40 + (label.length + seal.length) * SLAB.labelLead + 20 + 50);
    const h = SLAB.pad + labelH + SLAB.gap + CARD.h + SLAB.pad;
    return { w: SLAB.w, h, labelH, label, seal, cardY: h / 2 - SLAB.pad - CARD.h / 2 };
}

/** Where the slab rests, in pixels: the label at the top of the safe band in 9:16, right of centre in 16:9. */
export function slabRest(st: CardStage, geo: SlabGeometry): Placement {
    const u = st.u;
    if (st.aspect === "tall") {
        const top = st.safe.top + 6 * u;
        const scale = Math.min((st.h - 220 * u - top) / geo.h, (0.94 * st.w) / geo.w);
        return { x: st.w / 2, y: top + (geo.h * scale) / 2, rot: 0, scale };
    }
    const scale = (0.94 * st.h) / geo.h;
    return { x: st.card.x, y: st.h / 2, rot: 0, scale };
}

function sticker(ctx: Ctx, x: number, y: number, tilt: number, assets: SceneAssets): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.arc(0, 0, STICKER, 0, Math.PI * 2);
    const g = ctx.createLinearGradient(-STICKER + tilt * 90, -STICKER, STICKER + tilt * 90, STICKER);
    ["#ff9ad5", "#ffe08a", "#9dffcf", "#8fd8ff", "#c8a4ff", "#ff9ad5"].forEach((c, i) => g.addColorStop(i / 5, c));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgb(60 20 30 / 0.6)";
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2 + tilt;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * STICKER * 0.45, Math.sin(a) * STICKER * 0.45);
        ctx.lineTo(Math.cos(a) * STICKER * 0.95, Math.sin(a) * STICKER * 0.95);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const brand = assets.images.brand;
    if (brand) {
        const s = (STICKER * 1.1) / Math.max(brand.width, brand.height);
        ctx.drawImage(brand, (-brand.width * s) / 2, (-brand.height * s) / 2, brand.width * s, brand.height * s);
    }
    ctx.restore();
}

export interface SlabState {
    /** Where the light sits, -1 to 1. */
    tilt: number;
    t: number;
    /** The label's text, 0 to 1 as it prints. */
    print: number;
    /** The front acrylic, 0 open to 1 shut. */
    shut: number;
    /** The light on the seam as it clicks. */
    flash: number;
}

/** The case behind the card: its depth, back plate, label and the well. In slab units, centred. */
function drawCaseBack(ctx: Ctx, geo: SlabGeometry, deck: Deck, assets: SceneAssets, s: SlabState): void {
    const { w, h } = geo;
    const top = -h / 2;
    ctx.save();
    ctx.shadowColor = "rgb(0 0 0 / 0.65)";
    ctx.shadowBlur = 50;
    ctx.shadowOffsetY = 30;
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 16, top + 22, w, h, SLAB.r);
    ctx.fillStyle = "rgb(150 170 200 / 0.18)";
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.roundRect(-w / 2, top, w, h, SLAB.r);
    const back = ctx.createLinearGradient(0, top, 0, -top);
    back.addColorStop(0, "rgb(210 225 245 / 0.16)");
    back.addColorStop(1, "rgb(120 140 170 / 0.12)");
    ctx.fillStyle = back;
    ctx.fill();

    const lx = -w / 2 + SLAB.pad;
    const ly = top + SLAB.pad;
    const lw = w - 2 * SLAB.pad;
    ctx.beginPath();
    ctx.roundRect(lx, ly, lw, geo.labelH, 16);
    const paper = ctx.createLinearGradient(lx, ly, lx + lw, ly + geo.labelH);
    paper.addColorStop(0, "#fbf3e2");
    paper.addColorStop(1, "#ead9b8");
    ctx.fillStyle = paper;
    ctx.fill();
    ctx.fillStyle = "#6e1622";
    ctx.fillRect(lx, ly + 14, lw, 10);
    ctx.fillRect(lx, ly + geo.labelH - 24, lw, 10);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#6e1622";
    ctx.beginPath();
    ctx.roundRect(lx + 10, ly + 10, lw - 20, geo.labelH - 20, 10);
    ctx.stroke();

    sticker(ctx, lx + lw - 30 - STICKER, ly + 34 + STICKER, s.tilt, assets);

    const tx = lx + 34;
    let y = ly + 46;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const lines = [...geo.label.map((l) => ({ l, seal: false })), ...geo.seal.map((l) => ({ l, seal: true }))];
    lines.forEach(({ l, seal }, i) => {
        const k = clamp01(s.print * lines.length * 1.3 - i);
        if (k <= 0) return;
        ctx.save();
        ctx.globalAlpha = k;
        if (seal) {
            setFont(ctx, { family: assets.fonts.display, weight: 700, px: SLAB.labelPx, track: 0.06 });
            ctx.fillStyle = "#8a5a12";
            if (i === geo.label.length) y += 20;
        } else {
            setFont(ctx, { family: assets.fonts.body, weight: 600, px: SLAB.labelPx });
            ctx.fillStyle = "#3a0d14";
        }
        ctx.fillText(l, tx + (1 - k) * 30, y);
        ctx.restore();
        y += SLAB.labelLead;
    });
    ctx.letterSpacing = "0px";

    const bars = barsOf(deck.video.serial);
    const total = bars.reduce((a, b) => a + b, 0);
    const bw = 2 * STICKER;
    const bx = lx + lw - 30 - 2 * STICKER;
    const unit = bw / total;
    let x = bx;
    ctx.fillStyle = "#3a0d14";
    bars.forEach((b, i) => {
        if (i % 2 === 0) ctx.fillRect(x, ly + geo.labelH - 58, b * unit, 26);
        x += b * unit;
    });

    const wy = geo.cardY;
    ctx.beginPath();
    ctx.roundRect(-CARD.w / 2 - 18, wy - CARD.h / 2 - 18, CARD.w + 36, CARD.h + 36, CARD.r + 12);
    ctx.fillStyle = "rgb(8 6 14 / 0.55)";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgb(255 255 255 / 0.25)";
    ctx.stroke();
}

/** The front acrylic over the card: bevelled rims, a sweep of light across it, and the seam's flash. */
function drawCaseFront(ctx: Ctx, geo: SlabGeometry, s: SlabState): void {
    const { w, h } = geo;
    const top = -h / 2;
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.65 * s.shut;
    ctx.beginPath();
    ctx.roundRect(-w / 2, top, w, h, SLAB.r);
    ctx.lineWidth = 14;
    const rim = ctx.createLinearGradient(-w / 2, top, w / 2, -top);
    rim.addColorStop(0, "rgb(255 255 255 / 0.85)");
    rim.addColorStop(0.4, "rgb(200 215 235 / 0.35)");
    rim.addColorStop(1, "rgb(255 255 255 / 0.6)");
    ctx.strokeStyle = rim;
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 22, top + 22, w - 44, h - 44, SLAB.r - 16);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgb(255 255 255 / 0.3)";
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(-w / 2, top, w, h, SLAB.r);
    ctx.clip();
    ctx.globalCompositeOperation = "screen";
    const gloss = ctx.createLinearGradient(-w / 2, top, w / 2, top + h * 0.6);
    gloss.addColorStop(0, "rgb(255 255 255 / 0.22)");
    gloss.addColorStop(0.35, "rgb(255 255 255 / 0.02)");
    gloss.addColorStop(1, "rgb(255 255 255 / 0)");
    ctx.fillStyle = gloss;
    ctx.fillRect(-w / 2, top, w, h);
    const sx = (s.tilt * 0.8 + 0.15 * Math.sin(s.t * 0.6)) * w;
    const band = ctx.createLinearGradient(sx - 240, top, sx + 240, -top);
    band.addColorStop(0, "rgb(255 255 255 / 0)");
    band.addColorStop(0.45, "rgb(255 255 255 / 0.05)");
    band.addColorStop(0.5, "rgb(255 255 255 / 0.32)");
    band.addColorStop(0.55, "rgb(255 255 255 / 0.05)");
    band.addColorStop(1, "rgb(255 255 255 / 0)");
    ctx.fillStyle = band;
    ctx.fillRect(-w / 2, top, w, h);
    ctx.restore();

    if (s.flash > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const y = top + SLAB.pad + geo.labelH + SLAB.gap / 2;
        const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
        g.addColorStop(0, "rgb(255 240 200 / 0)");
        g.addColorStop(0.5, `rgb(255 245 220 / ${s.flash})`);
        g.addColorStop(1, "rgb(255 240 200 / 0)");
        ctx.fillStyle = g;
        ctx.fillRect(-w / 2, y - 10, w, 20);
        ctx.beginPath();
        ctx.roundRect(-w / 2, top, w, h, SLAB.r);
        ctx.lineWidth = 10;
        ctx.strokeStyle = `rgb(255 245 220 / ${0.8 * s.flash})`;
        ctx.stroke();
        ctx.restore();
    }
}

function applyPose(ctx: Ctx, at: Placement, lean: FlipPose): void {
    ctx.translate(at.x, at.y);
    ctx.rotate(at.rot);
    ctx.scale(at.scale, at.scale);
    ctx.transform(lean.scaleX, lean.skew * lean.scaleX, 0, 1, 0, 0);
}

/** The chase card in its holo, at a pose of its own, in pixels. */
function drawChaseCard(ctx: Ctx, at: Placement, lean: FlipPose, deck: Deck, assets: SceneAssets, s: SlabState) {
    const chase = deck.video.chase;
    if (!chase) return;
    const n = deck.video.cards.length + 1;
    ctx.save();
    applyPose(ctx, at, lean);
    drawCardFace(ctx, chase, deck, assets, { since: 10, tilt: s.tilt, index: n, of: n });
    drawHolo(ctx, s.tilt, s.t, 1);
    drawStamp(ctx, deck, assets, 10, s.tilt);
    ctx.restore();
}

/** A whole sealed slab with the chase card inside, at `at` in pixels (the slab's own scale). */
export function drawSlab(
    ctx: Ctx,
    at: Placement,
    lean: FlipPose,
    geo: SlabGeometry,
    deck: Deck,
    assets: SceneAssets,
    s: SlabState,
): void {
    ctx.save();
    ctx.globalAlpha *= at.alpha ?? 1;
    applyPose(ctx, at, lean);
    drawCaseBack(ctx, geo, deck, assets, s);
    ctx.restore();
    const c = slabCard(at, geo);
    ctx.save();
    ctx.globalAlpha *= at.alpha ?? 1;
    drawChaseCard(ctx, c, lean, deck, assets, s);
    applyPose(ctx, at, lean);
    drawCaseFront(ctx, geo, s);
    ctx.restore();
}

/** The card's pose inside a slab at `at`. */
export function slabCard(at: Placement, geo: SlabGeometry): Placement {
    const dx = -Math.sin(at.rot) * geo.cardY * at.scale;
    const dy = Math.cos(at.rot) * geo.cardY * at.scale;
    return { x: at.x + dx, y: at.y + dy, rot: at.rot, scale: at.scale };
}

/** Seconds a beat runs on this track, so a card's sway and foil carry straight on across a cut. */
export function beatSpan(deck: Deck, assets: SceneAssets, id: CollectorsBeatId): number {
    const beat = collectorsPlan(deck.video.casting, assets.timing.bars).find((b) => b.id === id);
    return (beat?.bars ?? 0) * assets.timing.barSeconds;
}

/** The slab at rest, swaying a little: the fan picks it up from here. */
export function slabHeld(size: SceneSize, geo: SlabGeometry, t: number): Placement {
    const st = cardStage(size);
    const rest = slabRest(st, geo);
    return { ...rest, y: rest.y + Math.sin(t * 1.1) * 5 * st.u, rot: Math.sin(t * 0.8) * 0.012 };
}

/**
 * The slab. The empty case rises into place while the chase card, still swaying in its foil, shrinks down into
 * the well; on the bar line the front clicks shut with a flash along the seam and a jolt, and the label prints:
 * the season and owner, then the seal with the copy number.
 */
export const draw: BeatDraw = (ctx, local, span, size, deck, assets) => {
    const st = cardStage(size);
    const u = st.u;
    const T = slabTimes(span, assets.timing.barSeconds);
    const before = beatSpan(deck, assets, "c_chase");
    const clock = before + local;
    const tilt = holoTilt(clock);
    const flash = flashAt(local, T.click);
    drawTable(ctx, st, clock + 40, 0.5 + 0.6 * flash);
    const wide = st.aspect === "wide";
    // Faces set their own alpha, so the pile leaves 16:9 by sliding off rather than fading.
    const away = wide ? easeInOut(local / 0.6) : 0;
    if (away < 1) {
        ctx.save();
        ctx.translate(-away * st.w * 0.5, 0);
        drawPile(ctx, st, deck, assets, deck.video.cards.length);
        ctx.restore();
    }

    const geo = slabGeometry(ctx, deck, assets.fonts);
    const rest = slabHeld(size, geo, local);
    const [jx, jy] = shake(local - T.click, 10 * u, 2);
    const rise = easeOutCubic(local / Math.max(0.3, T.seated * 0.8));
    const caseAt: Placement = {
        ...rest,
        x: rest.x + jx,
        y: lerp(rest.y + st.h * 0.9, rest.y, rise) + jy,
        alpha: clamp01(local / 0.25),
    };
    const lean = leanPose(tilt, 0.3);
    const state: SlabState = {
        tilt,
        t: clock,
        print: clamp01((local - T.click - 0.15) / 0.9),
        shut: clamp01((local - T.click + 0.12) / 0.12),
        flash,
    };
    const seat = easeInOut(clamp01(local / Math.max(0.2, T.seated)));
    const from = chaseHeld(st, clock);
    const into = slabCard(caseAt, geo);
    const cardAt: Placement = {
        x: lerp(from.x, into.x, seat),
        y: lerp(from.y, into.y, seat),
        rot: lerp(from.rot, into.rot, seat),
        scale: lerp(from.scale, into.scale, seat),
    };
    const cardLean = leanPose(tilt, lerp(1, 0.3, seat));

    ctx.save();
    ctx.globalAlpha = caseAt.alpha ?? 1;
    applyPose(ctx, caseAt, lean);
    drawCaseBack(ctx, geo, deck, assets, state);
    ctx.restore();
    if (local < T.click) {
        drawChaseCard(ctx, cardAt, cardLean, deck, assets, state);
    } else {
        drawChaseCard(ctx, slabCard(caseAt, geo), lean, deck, assets, state);
    }
    ctx.save();
    ctx.globalAlpha = caseAt.alpha ?? 1;
    applyPose(ctx, caseAt, lean);
    drawCaseFront(ctx, geo, state);
    ctx.restore();

    if (local >= T.click) {
        const dt = local - T.click;
        const hw = (geo.w / 2) * caseAt.scale;
        const hh = (geo.h / 2) * caseAt.scale;
        const corners = [
            [-hw, -hh],
            [hw, -hh],
            [-hw, hh],
            [hw, hh],
        ];
        corners.forEach(([cx, cy], i) => {
            const k = Math.max(0, Math.sin(Math.min(Math.PI, (dt - i * 0.05) * 4)));
            drawSparkle(ctx, caseAt.x + cx, caseAt.y + cy, 70 * u * k, k);
        });
        const k = Math.max(0, Math.sin((dt * 0.7) % Math.PI));
        drawSparkle(ctx, caseAt.x + hw * 0.6, caseAt.y - hh * 0.1, 50 * u * k, 0.7 * k);
    }

    if (wide) {
        const maxW = 0.34 * st.w;
        const label = caption(ctx, say(deck, deck.video.slab.label), 56 * u, maxW, assets.fonts, true);
        label.lines = wrapParts(ctx, say(deck, deck.video.slab.label), maxW);
        const seal = caption(ctx, say(deck, deck.video.slab.seal), 64 * u, maxW, assets.fonts);
        seal.lines = wrapParts(ctx, say(deck, deck.video.slab.seal).toUpperCase(), maxW);
        const h = label.lines.length * label.lead + 30 * u + seal.lines.length * seal.lead;
        const x = 0.06 * st.w;
        const y = st.h / 2 - h / 2;
        drawCaption(ctx, label, x, y, "#f6efdc", assets.fonts, { body: true, alpha: state.print * 1.5 });
        const gold = ctx.createLinearGradient(x, 0, x + maxW, 0);
        rarityOf("gold").frame.forEach((c, i, all) => gold.addColorStop(i / (all.length - 1), c));
        drawCaption(ctx, seal, x, y + label.lines.length * label.lead + 30 * u, gold, assets.fonts, {
            alpha: clamp01(state.print * 1.5 - 0.4),
        });
    }
};
