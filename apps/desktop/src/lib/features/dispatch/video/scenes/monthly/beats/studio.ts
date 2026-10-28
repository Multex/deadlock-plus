import type { MonthPalette } from "../../../../kinds/monthly/palette";
import { flashAt } from "../../../kit/beat";
import { clamp01 } from "../../../kit/ease";
import { sceneFrame } from "../../../kit/frame";
import { seeded } from "../../../kit/rng";
import { setFont, type TextStyle } from "../../../kit/text";
import type { Bitmap, Ctx, Rect } from "../../../kit/types";
import type { SceneAssets, SceneSize } from "../../../scene";
import { allCopy, type Copy, type MonthlyVideoData } from "../data";

/** What every Monthly beat draws from: the video's data, the cover's colours and every line already translated. */
export interface MonthlyDraw {
    video: MonthlyVideoData;
    /** `buildMagazine(...).palette`: the cover colour sampled from the star's backdrop art. */
    palette: MonthPalette;
    /** Translated lines by `copyId`; the worker has no i18n. */
    lines: Record<string, string>;
    /** For numbers the beats format themselves. */
    locale: string;
    /** Names and colours of the heroes the beats show; a hero missing here gets a neutral swatch and no tag. */
    heroes?: Record<number, { name: string; colour: string | null }>;
    /** The print cover's own furniture, so the video's cover reads as the magazine's. */
    print?: PrintCover;
}

export interface PrintCover {
    brand: string;
    masthead: string;
    issueLine: string;
    barcode: { bars: number[]; digits: string };
    site: string;
    /** The print's folio line, "Dispatch · November". */
    folio?: string;
    /** The print's own page furniture, so the video's pages carry the same labels. */
    labels?: PrintLabels;
}

export interface PrintLabels {
    coverStar: string;
    newFace: string;
    bestGame: string;
    coverStory: string;
    people: string;
    rotation: string;
    kills: string;
    deaths: string;
    assists: string;
    netWorth: string;
    grade: string;
    rankStart: string;
    rankEnd: string;
    games: string;
}

/** `draw(ctx, local, span, size, data, assets)`: `local` seconds into the beat, `span` the beat's length. */
export type BeatDraw = (
    ctx: Ctx,
    local: number,
    span: number,
    size: SceneSize,
    data: MonthlyDraw,
    assets: SceneAssets,
) => void;

/** The shot's net worth line: an existing print key, so the video adds no copy for it. */
export const NET_WORTH_KEY = "dispatch.best_game.net_worth";

export function netWorthCopy(value: string): Copy {
    return { key: NET_WORTH_KEY, params: { value } };
}

export function copyId(c: Copy): string {
    return `${c.key}|${JSON.stringify(c.params)}|${c.count ?? ""}`;
}

/** Every line the beats draw, translated on the main thread before the worker starts. */
export function monthlyLines(
    video: MonthlyVideoData,
    translate: (c: Copy) => string,
    number: (n: number) => string,
): Record<string, string> {
    const all = allCopy(video);
    const worth = video.beats.m_shot?.netWorth;
    if (worth) all.push(netWorthCopy(number(worth.value)));
    return Object.fromEntries(all.map((c) => [copyId(c), translate(c)]));
}

export function say(d: MonthlyDraw, c: Copy): string {
    return d.lines[copyId(c)] ?? "";
}

export function formatNumber(d: MonthlyDraw, n: number): string {
    return new Intl.NumberFormat(d.locale).format(n);
}

/** Phone-legibility floors at 1080 wide, scaled by `u`. */
export const BODY_PX = 44;
export const HEADLINE_PX = 96;

export interface Stage extends SceneSize {
    u: number;
    box: Rect;
    safe: { top: number; bottom: number };
    aspect: "tall" | "square" | "wide";
    /** Side margin for text. */
    m: number;
}

export function stage(size: SceneSize): Stage {
    const f = sceneFrame(size.w, size.h);
    const aspect = size.h > size.w * 1.2 ? "tall" : size.w > size.h * 1.2 ? "wide" : "square";
    return { ...size, ...f, aspect, m: Math.round(64 * f.u) };
}

/** The rect a picture covers `box` with, its spare overflow split by `fx`/`fy` (0 = keep the left/top). */
export function coverRect(iw: number, ih: number, box: Rect, fx = 0.5, fy = 0.5): Rect {
    const s = Math.max(box.w / iw, box.h / ih);
    const w = iw * s;
    const h = ih * s;
    return { x: box.x + (box.w - w) * fx, y: box.y + (box.h - h) * fy, w, h };
}

export interface FitSpec {
    px: number;
    /** Never set smaller than this; the text takes more lines instead. */
    floor: number;
    maxW: number;
    maxLines: number;
}

function wrapWith(measure: (s: string, px: number) => number, str: string, px: number, maxW: number): string[] {
    const lines: string[] = [];
    let line = "";
    for (const word of str.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (line && measure(next, px) > maxW) {
            lines.push(line);
            line = word;
        } else line = next;
    }
    if (line) lines.push(line);
    return lines;
}

/** The largest size up to `px` at which `str` wraps onto `maxLines` within `maxW`; at the floor it wraps further. */
export function fitLines(
    measure: (s: string, px: number) => number,
    str: string,
    spec: FitSpec,
): { px: number; lines: string[] } {
    let px = spec.px;
    for (;;) {
        const lines = wrapWith(measure, str, px, spec.maxW);
        if (lines.length <= spec.maxLines) {
            const widest = Math.max(0, ...lines.map((l) => measure(l, px)));
            if (widest <= spec.maxW) return { px, lines };
            const exact = (px * spec.maxW) / widest;
            const at = Math.max(spec.floor, exact);
            return { px: at, lines: wrapWith(measure, str, at, spec.maxW) };
        }
        if (px <= spec.floor) return { px: spec.floor, lines };
        px = Math.max(spec.floor, px * 0.95);
    }
}

export function ctxMeasure(ctx: Ctx, s: Omit<TextStyle, "px">): (str: string, px: number) => number {
    return (str, px) => {
        setFont(ctx, { ...s, px } as TextStyle, px);
        return ctx.measureText(str).width;
    };
}

export interface Block {
    px: number;
    lines: string[];
    lineH: number;
    height: number;
}

/** Fits and lays out a block of text; draw it with `drawBlock`. */
export function fitBlock(ctx: Ctx, str: string, style: Omit<TextStyle, "px">, spec: FitSpec, leading = 1.08): Block {
    const r = fitLines(ctxMeasure(ctx, style), str, spec);
    const lineH = r.px * leading;
    return { ...r, lineH, height: lineH * r.lines.length };
}

/**
 * Draws a fitted block from its top edge. `mark` is a substring (a number) set in `markFill`; `reveal` 0-1 brings
 * the lines in one after another from below.
 */
export function drawBlock(
    ctx: Ctx,
    b: Block,
    x: number,
    top: number,
    style: Omit<TextStyle, "px">,
    opts: { align?: CanvasTextAlign; reveal?: number; mark?: string; markFill?: string; shadow?: string } = {},
): void {
    const align = opts.align ?? "left";
    const reveal = opts.reveal ?? 1;
    ctx.save();
    setFont(ctx, { ...style, px: b.px } as TextStyle, b.px);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    if (opts.shadow) {
        ctx.shadowColor = opts.shadow;
        ctx.shadowBlur = b.px * 0.25;
        ctx.shadowOffsetY = b.px * 0.04;
    }
    b.lines.forEach((line, i) => {
        const k = clamp01(reveal * b.lines.length - i);
        if (k <= 0) return;
        const e = 1 - (1 - k) ** 3;
        const y = top + b.lineH * (i + 0.8) + (1 - e) * b.lineH * 0.45;
        const w = ctx.measureText(line).width;
        let lx = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
        ctx.globalAlpha = e;
        const parts = opts.mark && line.includes(opts.mark) ? line.split(opts.mark) : [line];
        parts.forEach((part, j) => {
            ctx.fillStyle = style.fill ?? "#fff";
            ctx.fillText(part, lx, y);
            lx += ctx.measureText(part).width;
            if (j < parts.length - 1) {
                ctx.fillStyle = opts.markFill ?? ctx.fillStyle;
                ctx.fillText(opts.mark!, lx, y);
                lx += ctx.measureText(opts.mark!).width;
            }
        });
    });
    ctx.restore();
}

export function rgbOf(hex: string): [number, number, number] {
    const h = hex.replace("#", "");
    const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h.slice(0, 6);
    const n = Number.parseInt(full, 16);
    return Number.isNaN(n) ? [128, 128, 128] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `a` mixed toward `b` by `k`, at `alpha`. */
export function mix(a: string, b: string, k: number, alpha = 1): string {
    const x = rgbOf(a);
    const y = rgbOf(b);
    const c = x.map((v, i) => Math.round(v + (y[i]! - v) * k));
    return `rgb(${c[0]} ${c[1]} ${c[2]} / ${alpha})`;
}

export const tint = (hex: string, alpha: number) => mix(hex, hex, 0, alpha);

/** Red china marker, the contact-sheet editor's pen. */
export const PENCIL = "#e0281e";
export const FILM = "#15110e";
export const PAPER = "#f2ede2";

/**
 * A hand-drawn loop round an ellipse: starts upper left, goes round a bit more than once and wobbles, the same
 * way for the same seed. `progress` 0-1 is how much of the stroke is drawn.
 */
export function pencilLoop(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    seed: number,
    progress: number,
): { x: number; y: number }[] {
    const N = 72;
    const rng = seeded(seed);
    const a0 = -2.4 + rng() * 0.7;
    const turns = 1.12 + rng() * 0.12;
    const f1 = 2 + Math.floor(rng() * 2);
    const p1 = rng() * Math.PI * 2;
    const tilt = (rng() - 0.5) * 0.25;
    const count = Math.ceil(N * clamp01(progress));
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
        const k = i / (N - 1);
        const a = a0 + k * turns * Math.PI * 2;
        const r = 0.95 + 0.12 * k + 0.05 * Math.sin(a * f1 + p1);
        const ex = Math.cos(a) * rx * r;
        const ey = Math.sin(a) * ry * r;
        out.push({
            x: cx + ex * Math.cos(tilt) - ey * Math.sin(tilt),
            y: cy + ex * Math.sin(tilt) + ey * Math.cos(tilt),
        });
    }
    return out;
}

/** Strokes `pencilLoop` as a waxy marker line: a soft under-stroke and a grainy top stroke. */
export function greasePencil(
    ctx: Ctx,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    seed: number,
    progress: number,
    width: number,
    colour = PENCIL,
): void {
    const pts = pencilLoop(cx, cy, rx, ry, seed, progress);
    if (pts.length < 2) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const path = () => {
        ctx.beginPath();
        ctx.moveTo(pts[0]!.x, pts[0]!.y);
        for (let i = 1; i < pts.length - 1; i++) {
            const mx = (pts[i]!.x + pts[i + 1]!.x) / 2;
            const my = (pts[i]!.y + pts[i + 1]!.y) / 2;
            ctx.quadraticCurveTo(pts[i]!.x, pts[i]!.y, mx, my);
        }
        ctx.lineTo(pts[pts.length - 1]!.x, pts[pts.length - 1]!.y);
    };
    ctx.shadowColor = "rgb(0 0 0 / 0.35)";
    ctx.shadowBlur = width * 0.8;
    ctx.shadowOffsetY = width * 0.25;
    ctx.strokeStyle = colour;
    ctx.globalAlpha = 0.92;
    ctx.lineWidth = width;
    path();
    ctx.stroke();
    ctx.shadowColor = "transparent";
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = width * 0.22;
    ctx.setLineDash([width * 0.6, width * 1.4]);
    path();
    ctx.stroke();
    ctx.restore();
}

export interface SheetLayout {
    strips: Rect[];
    frames: Rect[];
    /** Height of the sprocket band above and below each frame row. */
    band: number;
}

const GAP = 0.06;
const BAND = 0.22;
const STRIP_GAP = 0.14;

/** A contact sheet: `cols` 3:2 frames per strip of 35 mm film, as large as `area` allows, centred in it. */
export function sheetLayout(n: number, area: Rect, cols = 7): SheetLayout {
    const rows = Math.ceil(n / cols);
    const fwByW = area.w / (cols + (cols + 1) * GAP);
    const fwByH = area.h / ((rows * (1 + 2 * BAND) + (rows - 1) * STRIP_GAP) / 1.5);
    const fw = Math.min(fwByW, fwByH);
    const fh = fw / 1.5;
    const gx = fw * GAP;
    const band = fh * BAND;
    const sw = cols * fw + (cols + 1) * gx;
    const sh = fh + 2 * band;
    const total = rows * sh + (rows - 1) * fh * STRIP_GAP;
    const x0 = area.x + (area.w - sw) / 2;
    const y0 = area.y + (area.h - total) / 2;
    const strips = Array.from({ length: rows }, (_, r) => ({ x: x0, y: y0 + r * (sh + fh * STRIP_GAP), w: sw, h: sh }));
    const frames = Array.from({ length: n }, (_, i) => {
        const s = strips[Math.floor(i / cols)]!;
        return { x: s.x + gx + (i % cols) * (fw + gx), y: s.y + band, w: fw, h: fh };
    });
    return { strips, frames, band };
}

/** A strip of film: base, sprocket holes along both edges, and the edge print between them. */
export function filmStrip(
    ctx: Ctx,
    r: Rect,
    band: number,
    opts: { edge?: string; base?: string; holes?: string; u: number },
): void {
    ctx.save();
    ctx.fillStyle = opts.base ?? FILM;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    const hw = band * 0.42;
    const hh = band * 0.5;
    const step = hw * 2.1;
    ctx.fillStyle = opts.holes ?? PAPER;
    for (let x = r.x + step * 0.5; x < r.x + r.w - hw; x += step) {
        for (const y of [r.y + (band - hh) / 2, r.y + r.h - band + (band - hh) / 2]) {
            ctx.beginPath();
            ctx.roundRect(x, y, hw, hh, hw * 0.25);
            ctx.fill();
        }
    }
    if (opts.edge) {
        ctx.fillStyle = "#e8913a";
        ctx.globalAlpha = 0.85;
        ctx.font = `700 ${Math.max(10, band * 0.42)}px monospace`;
        ctx.textBaseline = "middle";
        ctx.fillText(opts.edge, r.x + step * 3.2, r.y + band / 2);
    }
    ctx.restore();
}

/** Draws `img` covering `r`, clipped to it. */
export function drawCover(ctx: Ctx, img: Bitmap, r: Rect, fx = 0.5, fy = 0.5, zoom = 1): void {
    const c = coverRect(img.width, img.height, r, fx, fy);
    const w = c.w * zoom;
    const h = c.h * zoom;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.drawImage(img, c.x - (w - c.w) * fx, c.y - (h - c.h) * fy, w, h);
    ctx.restore();
}

/** A photograph lit by the frame's own colour: the hero card over a tone, with a light falloff. */
export function heroPhoto(
    ctx: Ctx,
    r: Rect,
    img: Bitmap | undefined,
    tone: string,
    opts: { fy?: number; zoom?: number } = {},
): void {
    ctx.save();
    const g = ctx.createRadialGradient(
        r.x + r.w * 0.5,
        r.y + r.h * 0.35,
        0,
        r.x + r.w * 0.5,
        r.y + r.h * 0.5,
        Math.max(r.w, r.h) * 0.8,
    );
    g.addColorStop(0, mix(tone, "#ffffff", 0.35));
    g.addColorStop(1, mix(tone, "#000000", 0.55));
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    if (img) drawCover(ctx, img, r, 0.5, opts.fy ?? 0.15, opts.zoom ?? 1);
    ctx.restore();
}

/** A print: white border, soft drop shadow, a gloss sheen that slides with `sheen` (0-1). */
export function photoPrint(
    ctx: Ctx,
    r: Rect,
    paint: (inner: Rect) => void,
    opts: { border: number; rot?: number; shadow?: number; sheen?: number },
): void {
    ctx.save();
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate(opts.rot ?? 0);
    ctx.translate(-cx, -cy);
    ctx.shadowColor = "rgb(0 0 0 / 0.5)";
    ctx.shadowBlur = (opts.shadow ?? 30) * 1;
    ctx.shadowOffsetY = (opts.shadow ?? 30) * 0.4;
    ctx.fillStyle = "#fbf8f1";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.shadowColor = "transparent";
    const inner = { x: r.x + opts.border, y: r.y + opts.border, w: r.w - 2 * opts.border, h: r.h - 2 * opts.border };
    ctx.save();
    ctx.beginPath();
    ctx.rect(inner.x, inner.y, inner.w, inner.h);
    ctx.clip();
    paint(inner);
    if (opts.sheen !== undefined) {
        const sx = inner.x - inner.w + opts.sheen * inner.w * 3;
        const g = ctx.createLinearGradient(sx, inner.y, sx + inner.w * 0.6, inner.y + inner.h);
        g.addColorStop(0, "rgb(255 255 255 / 0)");
        g.addColorStop(0.5, "rgb(255 255 255 / 0.22)");
        g.addColorStop(1, "rgb(255 255 255 / 0)");
        ctx.fillStyle = g;
        ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
    }
    ctx.restore();
    ctx.restore();
}

export interface Camera {
    /** The point that stays put while zooming. */
    ox: number;
    oy: number;
    zoom: number;
    dx?: number;
    dy?: number;
    rot?: number;
}

export function withCamera(ctx: Ctx, cam: Camera, paint: () => void): void {
    ctx.save();
    ctx.translate(cam.ox + (cam.dx ?? 0), cam.oy + (cam.dy ?? 0));
    ctx.rotate(cam.rot ?? 0);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.ox, -cam.oy);
    paint();
    ctx.restore();
}

/**
 * A loupe over the sheet: `paint` draws the scene again, `zoom` times larger, with `focus` (default: the lens
 * centre) in the middle of the lens, so a lens kept on screen can still look at a frame by the edge.
 */
export function loupe(
    ctx: Ctx,
    cx: number,
    cy: number,
    r: number,
    zoom: number,
    paint: () => void,
    focus: { x: number; y: number } = { x: cx, y: cy },
): void {
    ctx.save();
    ctx.shadowColor = "rgb(0 0 0 / 0.55)";
    ctx.shadowBlur = r * 0.35;
    ctx.shadowOffsetY = r * 0.12;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.scale(zoom, zoom);
    ctx.translate(-focus.x, -focus.y);
    paint();
    ctx.restore();

    ctx.save();
    const glare = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.45, 0, cx - r * 0.4, cy - r * 0.45, r * 0.9);
    glare.addColorStop(0, "rgb(255 255 255 / 0.28)");
    glare.addColorStop(1, "rgb(255 255 255 / 0)");
    ctx.fillStyle = glare;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    const rim = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    rim.addColorStop(0, "#f4f4f4");
    rim.addColorStop(0.5, "#6d6d6d");
    rim.addColorStop(1, "#d8d8d8");
    ctx.strokeStyle = rim;
    ctx.lineWidth = r * 0.09;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgb(0 0 0 / 0.6)";
    ctx.lineWidth = r * 0.02;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.955, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

/**
 * The studio: a seamless paper sweep in the cover colour, the hero's backdrop art hung behind, a key light from
 * the upper left, two softboxes at the edges and a vignette. `light` 0-1 is how hot the lights are burning.
 */
export function studioSet(
    ctx: Ctx,
    st: Stage,
    pal: MonthPalette,
    opts: { backdrop?: Bitmap; light?: number; drift?: number; art?: number },
): void {
    const { w, h } = st;
    const light = opts.light ?? 1;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, mix(pal.bg, "#000000", 0.45));
    g.addColorStop(0.62, pal.bg);
    g.addColorStop(0.64, mix(pal.bg, "#000000", 0.1));
    g.addColorStop(1, mix(pal.bg, "#000000", 0.6));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    if (opts.backdrop) {
        const area = { x: -w * 0.08, y: 0, w: w * 1.16, h: h * 0.9 };
        ctx.save();
        ctx.globalAlpha = opts.art ?? 0.7;
        // The collage sits on the right of the art; the hero's empty space is on the left.
        drawCover(ctx, opts.backdrop, area, 0.85 - (opts.drift ?? 0) * 0.08, 0.3, 1.04);
        ctx.restore();
        ctx.save();
        ctx.globalCompositeOperation = "color";
        ctx.fillStyle = tint(pal.bg, 0.45);
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const key = ctx.createRadialGradient(w * 0.3, h * 0.22, 0, w * 0.3, h * 0.22, Math.max(w, h) * 0.75);
    key.addColorStop(0, tint(pal.glow, 0.55 * light));
    key.addColorStop(1, tint(pal.glow, 0));
    ctx.fillStyle = key;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    softbox(ctx, st, -1, light);
    softbox(ctx, st, 1, light * 0.75);
    vignette(ctx, st, 0.6);
}

/** A tall softbox at the left (-1) or right (1) edge, half out of frame, glowing. */
export function softbox(ctx: Ctx, st: Stage, side: -1 | 1, light: number): void {
    if (light <= 0) return;
    const { w, h, u } = st;
    const bw = 220 * u;
    const bh = Math.min(h * 0.55, 900 * u);
    const x = side < 0 ? -bw * 0.55 : w - bw * 0.45;
    const y = h * 0.08;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const bloom = ctx.createRadialGradient(x + bw / 2, y + bh / 2, 0, x + bw / 2, y + bh / 2, bh * 0.75);
    bloom.addColorStop(0, `rgb(255 248 235 / ${0.35 * light})`);
    bloom.addColorStop(1, "rgb(255 248 235 / 0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(x - bh, y - bh * 0.3, bw + 2 * bh, bh * 1.6);
    const face = ctx.createLinearGradient(x, 0, x + bw, 0);
    face.addColorStop(0, `rgb(255 252 245 / ${0.8 * light})`);
    face.addColorStop(0.5, `rgb(255 255 255 / ${0.95 * light})`);
    face.addColorStop(1, `rgb(255 250 240 / ${0.75 * light})`);
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.roundRect(x, y, bw, bh, 10 * u);
    ctx.fill();
    ctx.restore();
}

export function vignette(ctx: Ctx, st: Stage, k: number): void {
    const { w, h } = st;
    const v = ctx.createRadialGradient(
        w / 2,
        h * 0.45,
        Math.min(w, h) * 0.35,
        w / 2,
        h * 0.45,
        Math.hypot(w, h) * 0.62,
    );
    v.addColorStop(0, "rgb(0 0 0 / 0)");
    v.addColorStop(1, `rgb(0 0 0 / ${k})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
}

/** The flashbulb at its strength `k` (0-1): warm white with a hot centre. */
export function flashOverlay(ctx: Ctx, st: Stage, k: number): void {
    if (k <= 0) return;
    ctx.save();
    ctx.fillStyle = `rgb(255 251 242 / ${k})`;
    ctx.fillRect(0, 0, st.w, st.h);
    ctx.restore();
}

/** The flash of a shutter fired at `at` seconds: `flashAt` with a short afterglow. */
export function shutterFlash(local: number, at: number): number {
    return flashAt(local, at);
}

let grainTile: Bitmap | null = null;

function grainBitmap(): Bitmap | null {
    if (grainTile) return grainTile;
    if (typeof OffscreenCanvas === "undefined") return null;
    const size = 256;
    const c = new OffscreenCanvas(size, size);
    const g = c.getContext("2d");
    if (!g) return null;
    const img = g.createImageData(size, size);
    const rng = seeded(1105);
    for (let i = 0; i < size * size; i++) {
        const v = 128 + (rng() - 0.5) * 255;
        img.data[i * 4] = v;
        img.data[i * 4 + 1] = v;
        img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    grainTile = c;
    return c;
}

/** Film grain, moving twelve times a second so it reads as film rather than a texture. */
export function grain(ctx: Ctx, st: Stage, t: number, amount = 0.07): void {
    const tile = grainBitmap();
    if (!tile) return;
    const pattern = ctx.createPattern(tile as CanvasImageSource, "repeat");
    if (!pattern) return;
    const step = Math.floor(t * 12);
    const ox = (step * 97) % 256;
    const oy = (step * 61) % 256;
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = amount;
    ctx.translate(-ox, -oy);
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, st.w + 256, st.h + 256);
    ctx.restore();
}

/** A rubber stamp slammed on: big on the hit, settling to size; `k` is seconds since the slam. */
export function stamp(
    ctx: Ctx,
    str: string,
    x: number,
    y: number,
    style: { family: string; px: number; colour: string; rot: number; maxW: number },
    k: number,
): { w: number; h: number } {
    if (k < 0) return { w: 0, h: 0 };
    const e = clamp01(k / 0.16);
    const scale = 1.6 - 0.6 * (1 - (1 - e) ** 2);
    ctx.save();
    setFont(ctx, { family: style.family, weight: 700, px: style.px, track: 0.06 } as TextStyle, style.px);
    let px = style.px;
    let w = ctx.measureText(str).width;
    if (w > style.maxW) {
        px = (style.px * style.maxW) / w;
        setFont(ctx, { family: style.family, weight: 700, px, track: 0.06 } as TextStyle, px);
        w = ctx.measureText(str).width;
    }
    const pad = px * 0.3;
    const bw = w + pad * 2;
    const bh = px * 1.3;
    ctx.translate(x, y);
    ctx.rotate(style.rot);
    ctx.scale(scale, scale);
    ctx.globalAlpha = Math.min(1, e * 1.5) * 0.92;
    ctx.strokeStyle = style.colour;
    ctx.lineWidth = px * 0.09;
    ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
    ctx.lineWidth = px * 0.035;
    ctx.strokeRect(-bw / 2 + px * 0.12, -bh / 2 + px * 0.12, bw - px * 0.24, bh - px * 0.24);
    ctx.fillStyle = style.colour;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(str, px * 0.03, px * 0.06);
    ctx.restore();
    return { w: bw, h: bh };
}

export function image(assets: SceneAssets, key: string): Bitmap | undefined {
    return assets.images[key] ?? undefined;
}

/** Image keys the Monthly's beats read (prepare decodes them under these names). */
export const imageKeys = {
    /** The month's top hero's backdrop: the studio. */
    backdrop: "backdrop",
    heroBackdrop: (id: number) => `backdrop:${id}`,
    hero: (id: number) => `hero:${id}`,
    gloat: (id: number) => `mood:${id}:gloat`,
    rank: (badge: number) => `rank:${badge}`,
    brand: "brand",
};
