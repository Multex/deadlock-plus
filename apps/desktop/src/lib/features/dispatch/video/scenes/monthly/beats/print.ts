import { PAGE_TOKENS } from "../../../../kinds/monthly/palette";
import { clamp01 } from "../../../kit/ease";
import { seeded } from "../../../kit/rng";
import { setFont, type TextStyle } from "../../../kit/text";
import type { Bitmap, Ctx, Rect } from "../../../kit/types";
import type { SceneAssets } from "../../../scene";
import { drawBlock, fitBlock, mix, tint, type Block, type MonthlyDraw, type Stage } from "./studio";

/** A page of the magazine, in its own units: every inside page is laid out on this 3:4 sheet. */
export const PAGE_W = 1000;
export const PAGE_H = 1333;
/**
 * Type sizes in page units that clear the phone floors (44 px body, 96 px headline at 1080 wide) in every aspect's
 * spread: the widest scale-down is 16:9, where a page is 0.75 of its units.
 */
export const PAGE_BODY = 60;
export const PAGE_HEAD = 130;
/** Folios and photo credits: furniture, read as texture rather than as copy. */
export const PAGE_SMALL = 30;
export const MARGIN = 70;

export const PAPER = PAGE_TOKENS.paper;
export const INK = PAGE_TOKENS.text;
export const MUTED = PAGE_TOKENS.muted;

export interface Spread {
    left: Rect;
    right: Rect;
    /** Screen pixels per page unit. */
    s: number;
    /** How much of the left page is on screen, 0-1. */
    leftShown: number;
}

/**
 * The open magazine on the desk: on 9:16 the right-hand page fills the frame with the facing page's edge at the
 * spine; on 1:1 the right page with a third of the left; on 16:9 the whole spread.
 */
export function spreadLayout(st: Stage): Spread {
    const { w, h } = st;
    if (st.aspect === "wide") {
        const ph = h * 0.93;
        const pw = (ph * PAGE_W) / PAGE_H;
        const x = (w - 2 * pw) / 2;
        const y = (h - ph) / 2;
        return { left: { x, y, w: pw, h: ph }, right: { x: x + pw, y, w: pw, h: ph }, s: pw / PAGE_W, leftShown: 1 };
    }
    if (st.aspect === "square") {
        const ph = h * 0.93;
        const pw = (ph * PAGE_W) / PAGE_H;
        const x = w - pw - h * 0.035;
        const y = (h - ph) / 2;
        return {
            left: { x: x - pw, y, w: pw, h: ph },
            right: { x, y, w: pw, h: ph },
            s: pw / PAGE_W,
            leftShown: clamp01(x / pw),
        };
    }
    const pw = w * 0.93;
    const ph = (pw * PAGE_H) / PAGE_W;
    const x = w - pw - w * 0.02;
    const y = h * 0.075;
    return { left: { x: x - pw, y, w: pw, h: ph }, right: { x, y, w: pw, h: ph }, s: pw / PAGE_W, leftShown: x / pw };
}

/** Draws in a page's own units, clipped to the sheet. */
export function onPage(ctx: Ctx, r: Rect, paint: () => void): void {
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.scale(r.w / PAGE_W, r.w / PAGE_W);
    ctx.beginPath();
    ctx.rect(0, 0, PAGE_W, PAGE_H);
    ctx.clip();
    paint();
    ctx.restore();
}

/** Where a point in a page's units lands on screen, before the camera. */
export function pagePoint(r: Rect, x: number, y: number): { x: number; y: number } {
    const s = r.w / PAGE_W;
    return { x: r.x + x * s, y: r.y + y * s };
}

let fibreTile: Bitmap | null = null;

/** Paper fibre: soft speckle and a few longer strands, baked once. */
function fibres(): Bitmap | null {
    if (fibreTile) return fibreTile;
    if (typeof OffscreenCanvas === "undefined") return null;
    const size = 512;
    const c = new OffscreenCanvas(size, size);
    const g = c.getContext("2d");
    if (!g) return null;
    const rng = seeded(2711);
    g.fillStyle = "rgb(128 128 128)";
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < 9000; i++) {
        const v = 100 + rng() * 60;
        g.fillStyle = `rgb(${v} ${v} ${v} / 0.5)`;
        g.fillRect(rng() * size, rng() * size, 1 + rng() * 1.5, 1 + rng() * 1.5);
    }
    g.lineWidth = 0.8;
    for (let i = 0; i < 260; i++) {
        const v = 90 + rng() * 80;
        g.strokeStyle = `rgb(${v} ${v} ${v} / 0.35)`;
        const x = rng() * size;
        const y = rng() * size;
        const a = rng() * Math.PI;
        const l = 4 + rng() * 14;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(
            x + Math.cos(a) * l * 0.5 + rng() * 3,
            y + Math.sin(a) * l * 0.5,
            x + Math.cos(a) * l,
            y + Math.sin(a) * l,
        );
        g.stroke();
    }
    fibreTile = c;
    return c;
}

/**
 * The sheet: coated paper with its fibre, the curve into the binding on the spine side and a gloss that catches
 * the lamp. Draws in page units (inside `onPage`).
 */
export function paper(ctx: Ctx, fill: string = PAPER): void {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    const tile = fibres();
    if (tile) {
        const pattern = ctx.createPattern(tile as CanvasImageSource, "repeat");
        if (pattern) {
            ctx.save();
            ctx.globalCompositeOperation = "overlay";
            ctx.globalAlpha = 0.16;
            ctx.fillStyle = pattern;
            ctx.fillRect(0, 0, PAGE_W, PAGE_H);
            ctx.restore();
        }
    }
}

/** The page's curve into the spine and the lamp's gloss; drawn over whatever the page printed. */
export function binding(ctx: Ctx, side: "left" | "right", gloss = 0.5): void {
    const spine = side === "right" ? 0 : PAGE_W;
    const dir = side === "right" ? 1 : -1;
    const g = ctx.createLinearGradient(spine, 0, spine + dir * 120, 0);
    g.addColorStop(0, "rgb(0 0 0 / 0.34)");
    g.addColorStop(0.2, "rgb(0 0 0 / 0.12)");
    g.addColorStop(1, "rgb(0 0 0 / 0)");
    ctx.fillStyle = g;
    ctx.fillRect(side === "right" ? 0 : PAGE_W - 120, 0, 120, PAGE_H);
    const edge = side === "right" ? PAGE_W : 0;
    const e = ctx.createLinearGradient(edge, 0, edge - dir * 30, 0);
    e.addColorStop(0, "rgb(0 0 0 / 0.1)");
    e.addColorStop(1, "rgb(0 0 0 / 0)");
    ctx.fillStyle = e;
    ctx.fillRect(side === "right" ? PAGE_W - 30 : 0, 0, 30, PAGE_H);
    if (gloss > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "soft-light";
        const s = ctx.createLinearGradient(0, 0, PAGE_W, PAGE_H);
        s.addColorStop(0, `rgb(255 255 255 / ${0.55 * gloss})`);
        s.addColorStop(0.35, "rgb(255 255 255 / 0)");
        s.addColorStop(0.8, "rgb(255 255 255 / 0)");
        s.addColorStop(1, `rgb(255 255 255 / ${0.3 * gloss})`);
        ctx.fillStyle = s;
        ctx.fillRect(0, 0, PAGE_W, PAGE_H);
        ctx.restore();
    }
}

/** The desk the magazine lies on: a dark surface in the month's colour under one warm lamp. */
export function desk(ctx: Ctx, st: Stage, d: MonthlyDraw, lamp: { x: number; y: number } = { x: 0.55, y: 0.35 }): void {
    const base = mix(d.palette.bg, "#0b0907", 0.72);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, st.w, st.h);
    const g = ctx.createRadialGradient(
        st.w * lamp.x,
        st.h * lamp.y,
        0,
        st.w * lamp.x,
        st.h * lamp.y,
        Math.hypot(st.w, st.h) * 0.6,
    );
    g.addColorStop(0, tint(mix(d.palette.glow, "#ffe2b0", 0.5), 0.32));
    g.addColorStop(1, tint(base, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, st.w, st.h);
}

/** The pages' shadow on the desk and the soft dip at the spine. */
export function spreadShadow(ctx: Ctx, sp: Spread, u: number): void {
    const x = sp.left.x;
    const y = sp.left.y;
    const w = sp.left.w + sp.right.w;
    const h = sp.right.h;
    ctx.save();
    ctx.shadowColor = "rgb(0 0 0 / 0.55)";
    ctx.shadowBlur = 60 * u;
    ctx.shadowOffsetY = 26 * u;
    ctx.fillStyle = PAPER;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
}

export interface PageCamera {
    /** Screen point the zoom holds still. */
    ox: number;
    oy: number;
    zoom: number;
    dx: number;
    dy: number;
    rot: number;
}

export const STILL: PageCamera = { ox: 0, oy: 0, zoom: 1, dx: 0, dy: 0, rot: 0 };

export function withPageCamera(ctx: Ctx, cam: PageCamera, paint: () => void): void {
    ctx.save();
    ctx.translate(cam.ox + cam.dx, cam.oy + cam.dy);
    ctx.rotate(cam.rot);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.ox, -cam.oy);
    paint();
    ctx.restore();
}

/**
 * The vertical shift that keeps page rows `top`..`bottom` (page units) inside the safe band on 9:16, as little as
 * it takes; other aspects show the whole page and never shift.
 */
export function readShift(st: Stage, sp: Spread, top: number, bottom: number): number {
    if (st.aspect !== "tall") return 0;
    const a = pagePoint(sp.right, 0, top).y;
    const b = pagePoint(sp.right, 0, bottom).y;
    const band = { top: st.safe.top + 20 * st.u, bottom: st.safe.bottom - 10 * st.u };
    if (b - a > band.bottom - band.top) return band.top - a;
    if (b > band.bottom) return band.bottom - b;
    if (a < band.top) return band.top - a;
    return 0;
}

export interface Spec {
    left: (ctx: Ctx) => void;
    right: (ctx: Ctx) => void;
    /** Page numbers; the left page's is `folio`, the right page's one more. */
    folio: number;
    section: string;
    cam: PageCamera;
}

/** The open spread on the desk, each page printed by `spec`, under the camera. */
export function drawSpread(ctx: Ctx, st: Stage, sp: Spread, d: MonthlyDraw, assets: SceneAssets, spec: Spec): void {
    desk(ctx, st, d);
    withPageCamera(ctx, spec.cam, () => {
        spreadShadow(ctx, sp, st.u);
        if (sp.leftShown > 0.02)
            onPage(ctx, sp.left, () => {
                paper(ctx);
                spec.left(ctx);
                folio(ctx, "left", spec.folio, d, assets, spec.section);
                binding(ctx, "left");
            });
        onPage(ctx, sp.right, () => {
            paper(ctx);
            spec.right(ctx);
            folio(ctx, "right", spec.folio + 1, d, assets, spec.section);
            binding(ctx, "right");
        });
    });
}

/** The folio at a page's foot: page number on the outer edge, the magazine's name and the section. */
export function folio(
    ctx: Ctx,
    side: "left" | "right",
    n: number,
    d: MonthlyDraw,
    assets: SceneAssets,
    section: string,
): void {
    const y = PAGE_H - 46;
    const name = (d.print?.folio ?? d.print?.masthead ?? "").toUpperCase();
    ctx.save();
    ctx.textBaseline = "alphabetic";
    setFont(ctx, { family: assets.fonts.display, weight: 700, px: PAGE_SMALL * 1.25, track: 0.06 } as TextStyle);
    ctx.fillStyle = d.palette.ink;
    const num = String(n);
    const nw = ctx.measureText(num).width;
    ctx.textAlign = side === "right" ? "right" : "left";
    ctx.fillText(num, side === "right" ? PAGE_W - MARGIN : MARGIN, y);
    setFont(ctx, { family: assets.fonts.display, weight: 700, px: PAGE_SMALL, track: 0.14 } as TextStyle);
    ctx.fillStyle = MUTED;
    const gap = 26;
    const room = PAGE_W - 2 * MARGIN - nw - gap;
    const line = section ? `${name}   ${section.toUpperCase()}` : name;
    ctx.fillText(line, side === "right" ? PAGE_W - MARGIN - nw - gap : MARGIN + nw + gap, y, room);
    ctx.restore();
}

/** A kicker over a headline: tracked capitals in the month's ink, with a short rule ahead of it. Returns its height. */
export function kicker(
    ctx: Ctx,
    text: string,
    x: number,
    y: number,
    maxW: number,
    family: string,
    colour: string,
    reveal = 1,
): number {
    if (!text) return 0;
    const px = PAGE_BODY * 0.8;
    ctx.save();
    ctx.globalAlpha *= clamp01(reveal * 2);
    setFont(ctx, { family, weight: 700, px, track: 0.16 } as TextStyle);
    ctx.fillStyle = colour;
    ctx.fillRect(x, y + px * 0.38, 46 * clamp01(reveal * 1.5), 7);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(text.toUpperCase(), x + 64, y + px * 0.45, maxW - 64);
    ctx.restore();
    return px * 1.1;
}

/** A headline in the magazine's display serif, fitted to `maxW` on up to `maxLines`. */
export function headlineBlock(
    ctx: Ctx,
    text: string,
    family: string,
    maxW: number,
    maxLines: number,
    px = 150,
    floor = PAGE_HEAD,
): Block {
    return fitBlock(ctx, text, headStyle(family, INK), { px, floor, maxW, maxLines }, 0.92);
}

export const headStyle = (family: string, fill: string) => ({ family, weight: 600, fill, track: -0.02 });
export const deckStyle = (family: string, fill: string = INK) => ({ family, weight: 500, fill, italic: true });

/** A drop cap: the answer's first letter three lines deep. Returns the width it takes from the first lines. */
export function dropCap(
    ctx: Ctx,
    letter: string,
    x: number,
    top: number,
    lineH: number,
    family: string,
    fill: string,
): number {
    const px = lineH * 2.3;
    ctx.save();
    setFont(ctx, { family, weight: 600, px } as TextStyle);
    ctx.fillStyle = fill;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillText(letter, x, top + lineH * 1.85);
    const w = ctx.measureText(letter).width;
    ctx.restore();
    return w + lineH * 0.25;
}

/** A photo credit set up the side of a picture, the way the print runs them. */
export function credit(ctx: Ctx, text: string, x: number, y: number, family: string, fill: string = MUTED): void {
    if (!text) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-Math.PI / 2);
    setFont(ctx, { family, weight: 700, px: PAGE_SMALL * 0.8, track: 0.16 } as TextStyle);
    ctx.fillStyle = fill;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText(text.toUpperCase(), 0, 0);
    ctx.restore();
}

/** A thin rule across a column. */
export function rule(ctx: Ctx, x: number, y: number, w: number, fill: string = INK, weight = 3): void {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, weight);
}

export function drawText(ctx: Ctx, b: Block, x: number, top: number, style: Omit<TextStyle, "px">, reveal = 1): void {
    drawBlock(ctx, b, x, top, style, { reveal });
}

/** Slices a page is drawn in while it turns: enough that the perspective reads as a curve. */
const SLICES = 28;

/**
 * A page turning over its spine at `spine` (screen x), `k` 0-1 through the turn. `front` is the outgoing frame,
 * whose `page` rect is the sheet that turns; past halfway the sheet shows its other side, `backPage` of `back`,
 * laid down on the far side of the spine. Draws over whatever is already on `ctx` (the page underneath).
 */
export function turnPage(
    ctx: Ctx,
    k: number,
    front: Bitmap,
    page: Rect,
    back: Bitmap | null,
    backPage: Rect | null,
): void {
    const theta = Math.PI * clamp01(k);
    const c = Math.cos(theta);
    const lift = Math.sin(theta);
    const spine = page.x;
    const shown = page.w * Math.abs(c);
    // The shadow the lifted sheet throws on the page it uncovers.
    ctx.save();
    const reach = page.w * (0.25 + 0.35 * lift);
    const sx = c >= 0 ? spine + shown : spine;
    const sh = ctx.createLinearGradient(sx, 0, sx + reach, 0);
    sh.addColorStop(0, `rgb(0 0 0 / ${0.45 * lift})`);
    sh.addColorStop(1, "rgb(0 0 0 / 0)");
    ctx.fillStyle = sh;
    ctx.fillRect(sx, page.y, reach, page.h);
    ctx.restore();
    if (shown < 1) return;
    const src = c >= 0 ? front : back;
    const from = c >= 0 ? page : backPage;
    if (!src || !from) return;
    for (let i = 0; i < SLICES; i++) {
        const a = i / SLICES;
        const b = (i + 1) / SLICES;
        // Far from the spine the sheet comes up toward the lens and grows.
        const grow = 1 + 0.12 * lift * (a + b) * 0.5;
        const h = from.h * grow;
        const y = from.y + (from.h - h) / 2;
        const sw = from.w / SLICES;
        const srcX = c >= 0 ? from.x + a * from.w : from.x + from.w - b * from.w;
        const dx = c >= 0 ? spine + a * shown : spine - b * shown;
        ctx.drawImage(src as CanvasImageSource, srcX, from.y, sw, from.h, dx, y, shown / SLICES + 0.6, h);
    }
    // The sheet darkens as it stands up and catches the lamp on the way down.
    ctx.save();
    const x0 = c >= 0 ? spine : spine - shown;
    const g = ctx.createLinearGradient(x0, 0, x0 + shown, 0);
    const dark = 0.4 * lift;
    g.addColorStop(c >= 0 ? 0 : 1, `rgb(0 0 0 / ${dark * 0.3})`);
    g.addColorStop(c >= 0 ? 1 : 0, `rgb(0 0 0 / ${dark})`);
    ctx.fillStyle = g;
    ctx.fillRect(x0, page.y - page.h * 0.07, shown, page.h * 1.14);
    ctx.restore();
}
