import type { Scene, SceneAssets } from "../scene";
import { placeholderScene } from "./placeholder";
import { presentSections, type MonthlyVideo } from "./monthly/legacy/data";
import { COUNT_BEATS, monthlyPlan, pageAt, staggers, type MonthlyPlan, type PageId } from "./monthly/legacy/plan";
import { feathered } from "../kit/bitmap";
import { countUp } from "../kit/count";
import { clamp01, easeInOut, easeOutBack, easeOutCubic, lerp } from "../kit/ease";
import { sceneFrame } from "../kit/frame";
import { shake } from "../kit/motion";
import { setFont, text, wrap, type TextStyle } from "../kit/text";
import type { Ctx, Rect } from "../kit/types";

/** Every page is laid out in a 1080 px square, then scaled to the frame's shorter side. */
const S = 1080;
const M = 60;
/** A portrait card is 280 px wide and goes soft past 1.5x. */
const CARD = { w: 280, h: 380, most: 420 };

interface Prepared {
    plan: MonthlyPlan;
    num: Intl.NumberFormat;
    pct: Intl.NumberFormat;
}

interface F {
    ctx: Ctx;
    t: number;
    w: number;
    h: number;
    u: number;
    box: Rect;
    /** Seconds in a bar and in a beat. */
    B: number;
    b: number;
    v: MonthlyVideo;
    p: Prepared;
    images: SceneAssets["images"];
    fonts: SceneAssets["fonts"];
}

const prepared = new WeakMap<SceneAssets, Prepared>();

function prepare(assets: SceneAssets, v: MonthlyVideo): Prepared {
    let p = prepared.get(assets);
    if (!p) {
        p = {
            plan: monthlyPlan(assets.timing.bars, presentSections(v)),
            num: new Intl.NumberFormat(v.locale),
            pct: new Intl.NumberFormat(v.locale, { style: "percent", maximumFractionDigits: 0 }),
        };
        prepared.set(assets, p);
    }
    return p;
}

const fallback = placeholderScene({ ground: "#1b3768", accent: "#ffd23f" });

export const monthlyScene: Scene = (ctx, t, size, assets) => {
    const v = assets.data as MonthlyVideo | undefined;
    if (!v) return fallback(ctx, t, size, assets);
    const { u, box } = sceneFrame(size.w, size.h);
    const B = assets.timing.barSeconds;
    const f: F = {
        ctx,
        t,
        w: size.w,
        h: size.h,
        u,
        box,
        B,
        b: B / 4,
        v,
        p: prepare(assets, v),
        images: assets.images,
        fonts: assets.fonts,
    };
    const now = pageAt(f.p.plan, t, B);
    if (!now.turn) {
        drawPage(f, now.page);
        return;
    }
    drawPage(f, now.turn.to);
    const leaf = buffer(size.w, size.h);
    leaf.ctx.clearRect(0, 0, size.w, size.h);
    drawPage({ ...f, ctx: leaf.ctx }, now.page);
    turnLeaf(f, leaf.canvas, now.turn.k);
};

/* ---------- Pages, the page turn and shared pieces ---------- */

let leafCanvas: { canvas: OffscreenCanvas; ctx: Ctx } | null = null;

/** The page being turned is drawn here first; the worker draws one frame at a time, so one canvas serves. */
function buffer(w: number, h: number): { canvas: OffscreenCanvas; ctx: Ctx } {
    if (!leafCanvas || leafCanvas.canvas.width !== w || leafCanvas.canvas.height !== h) {
        const canvas = new OffscreenCanvas(w, h);
        leafCanvas = { canvas, ctx: canvas.getContext("2d")! };
    }
    return leafCanvas;
}

function pageSpan(f: F, id: PageId): { start: number; span: number } {
    const { plan } = f.p;
    const span = id === "cover" ? plan.cover : id === "end" ? plan.end : plan.sections.find((s) => s.id === id)!;
    return { start: span.bar * f.B, span: span.bars * f.B };
}

function drawPage(f: F, id: PageId): void {
    const { start, span } = pageSpan(f, id);
    switch (id) {
        case "cover":
            return drawCover(f, start, span);
        case "numbers":
            return drawNumbers(f, start, span);
        case "calendar":
            return drawCalendar(f, start, span);
        case "heroes":
            return drawHeroes(f, start, span);
        case "best":
            return drawBest(f, start, span);
        case "people":
            return drawPeople(f, start, span);
        case "rank":
            return drawRank(f, start, span);
        case "end":
            return drawEnd(f, start);
    }
}

/**
 * The leaf swings over the spine on the left: each strip is foreshortened toward the spine and its far edge grows
 * a little, as the edge nearer the eye would, while the page under it catches the leaf's shadow.
 */
function turnLeaf(f: F, leaf: OffscreenCanvas, k: number): void {
    const { ctx, w, h, u } = f;
    const e = easeInOut(k);
    const angle = (e * Math.PI) / 2;
    const cos = Math.cos(angle);
    const edge = w * cos;
    const lift = Math.sin(angle);

    const shadow = 0.38 * Math.sin(Math.PI * k);
    if (shadow > 0) {
        const g = ctx.createLinearGradient(edge, 0, edge + 160 * u, 0);
        g.addColorStop(0, `rgb(0 0 0 / ${shadow})`);
        g.addColorStop(1, "rgb(0 0 0 / 0)");
        ctx.fillStyle = g;
        ctx.fillRect(edge, 0, 160 * u, h);
    }
    if (edge < 1) return;

    const strips = 48;
    const sw = w / strips;
    for (let i = 0; i < strips; i++) {
        const sx = i * sw;
        const grow = 1 + lift * (sx / w) * 0.14;
        ctx.drawImage(leaf, sx, 0, sw, h, sx * cos, (-h * (grow - 1)) / 2, sw * cos + 1, h * grow);
    }
    const dim = ctx.createLinearGradient(0, 0, edge, 0);
    dim.addColorStop(0, `rgb(0 0 0 / ${0.12 * e})`);
    dim.addColorStop(1, `rgb(0 0 0 / ${0.5 * e})`);
    ctx.fillStyle = dim;
    ctx.fillRect(0, 0, edge, h);
    const shine = ctx.createLinearGradient(edge - 40 * u, 0, edge, 0);
    shine.addColorStop(0, "rgb(255 255 255 / 0)");
    shine.addColorStop(1, `rgb(255 255 255 / ${0.3 * lift})`);
    ctx.fillStyle = shine;
    ctx.fillRect(edge - 40 * u, 0, 40 * u, h);
}

/** Draws in the page's own 1080 px square. */
function local(f: F, draw: () => void): void {
    const { ctx, box, u } = f;
    ctx.save();
    ctx.translate(box.x, box.y);
    ctx.scale(u, u);
    draw();
    ctx.restore();
}

const enter = (t: number, cue: number, d = 0.35) => (t < cue ? 0 : easeOutCubic((t - cue) / d));
const pop = (t: number, cue: number, d = 0.3) => (t < cue ? 0 : easeOutBack((t - cue) / d));

/** Slides a piece up into place as it fades in. */
function rise(f: F, k: number, draw: () => void, dy = 30): void {
    if (k <= 0) return;
    const { ctx } = f;
    ctx.save();
    ctx.globalAlpha *= k;
    ctx.translate(0, (1 - k) * dy);
    draw();
    ctx.restore();
}

/** Scales a piece about a point, from `from` to 1 as `k` runs 0 to 1, overshooting with an eased-back `k`. */
function scaled(f: F, k: number, x: number, y: number, from: number, draw: () => void, rotate = 0): void {
    if (k <= 0) return;
    const { ctx } = f;
    ctx.save();
    ctx.globalAlpha *= clamp01(k * 3);
    ctx.translate(x, y);
    ctx.scale(lerp(from, 1, k), lerp(from, 1, k));
    ctx.rotate(rotate * (1 - clamp01(k)));
    ctx.translate(-x, -y);
    draw();
    ctx.restore();
}

const upper = (f: F, s: string) => s.toLocaleUpperCase(f.v.locale);

function display(f: F, px: number, fill: string, extra: Partial<TextStyle> = {}): TextStyle {
    return { family: f.fonts.display, weight: 700, px, fill, ...extra };
}

function serif(f: F, px: number, fill: string, extra: Partial<TextStyle> = {}): TextStyle {
    return { family: f.fonts.body, weight: 600, px, fill, ...extra };
}

function kicker(f: F, label: string, x: number, y: number, fill: string, extra: Partial<TextStyle> = {}): void {
    text(f.ctx, upper(f, label), x, y, display(f, 22, fill, { track: 0.18, ...extra }));
}

/**
 * Sets `str` in at most `maxLines` lines of `maxW`, shrinking the type down to `minPx` first and cutting the last
 * line short after that. Drawn from its top at `y`; returns the height it took.
 */
function block(
    f: F,
    str: string,
    x: number,
    y: number,
    s: TextStyle,
    maxLines: number,
    lineH = 1.05,
    minPx = s.px * 0.6,
    dry = false,
): number {
    const { ctx } = f;
    const maxW = s.maxW ?? Infinity;
    let px = s.px;
    let lines: string[] = [];
    for (;;) {
        setFont(ctx, s, px);
        lines = wrap(ctx, str, maxW);
        const fits = lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxW);
        if (fits || px * 0.92 < minPx) break;
        px *= 0.92;
    }
    if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        let last = lines[maxLines - 1]!;
        while (last.length > 1 && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
        lines[maxLines - 1] = `${last.trimEnd()}…`;
    }
    if (!dry)
        lines.forEach((line, i) => {
            text(ctx, line, x, y + i * px * lineH, { ...s, px, baseline: "top" });
        });
    return lines.length * px * lineH;
}

function card(f: F, heroId: number): (CanvasImageSource & { width: number; height: number }) | undefined {
    const img = f.images[`hero:${heroId}`];
    return img ? feathered(img) : undefined;
}

/** A portrait card's width on the page, so it never draws past 1.5x on screen. */
const cardW = (f: F, want: number) => Math.min(want, CARD.most / f.u);

/** The hero collage, filling a frame-space rect with its busy right half centred on `cx`. */
function collage(f: F, r: Rect, cx: number, alpha: number): void {
    const img = f.images.backdrop;
    if (!img) return;
    const { ctx } = f;
    const k = Math.max(r.h / img.height, (r.w * 1.35) / img.width);
    const w = img.width * k;
    const x = Math.min(r.x, Math.max(r.x + r.w - w, cx - 0.64 * w));
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, x, r.y + r.h - img.height * k, w, img.height * k);
    ctx.restore();
}

/** A soft light behind the art, kept inside `bottom` so it never spills onto the white page under a panel. */
function glow(f: F, x: number, y: number, r: number, colour: string, alpha = 1, bottom = f.h): void {
    const { ctx } = f;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, colour);
    g.addColorStop(1, "rgb(0 0 0 / 0)");
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, Math.min(r * 2, bottom - (y - r)));
    ctx.globalAlpha = 1;
}

/** An inside page: white stock, the spine's shade down the left and the folio along the foot. */
function paperPage(f: F, page: number, section: string): void {
    const { ctx, w, h, u, v } = f;
    ctx.fillStyle = v.paper.paper;
    ctx.fillRect(0, 0, w, h);
    const spine = ctx.createLinearGradient(0, 0, 48 * u, 0);
    spine.addColorStop(0, "rgb(40 30 10 / 0.22)");
    spine.addColorStop(1, "rgb(40 30 10 / 0)");
    ctx.fillStyle = spine;
    ctx.fillRect(0, 0, 48 * u, h);
    local(f, () => {
        const y = S - 26;
        const num = text(ctx, f.p.num.format(page), M, y, display(f, 22, v.palette.ink));
        text(ctx, upper(f, v.folio), M + num.w + 18, y, display(f, 17, v.paper.muted, { track: 0.14, maxW: 560 }));
        text(
            ctx,
            upper(f, section),
            S - M,
            y,
            display(f, 17, v.palette.ink, { track: 0.14, align: "right", maxW: 300 }),
        );
    });
}

/** The laminate's light: a fixed sheen and a bright band swept across at `sweep` (0 to 1). */
function gloss(f: F, sweep: number | null): void {
    const { ctx, w, h } = f;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "rgb(255 255 255 / 0.2)");
    g.addColorStop(0.2, "rgb(255 255 255 / 0.05)");
    g.addColorStop(0.36, "rgb(255 255 255 / 0)");
    g.addColorStop(0.75, "rgb(255 255 255 / 0)");
    g.addColorStop(1, "rgb(255 255 255 / 0.12)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    if (sweep !== null && sweep > 0 && sweep < 1) {
        const span = Math.max(w, h);
        const cx = -0.4 * span + sweep * 1.8 * span;
        ctx.translate(cx, h / 2);
        ctx.rotate((18 * Math.PI) / 180);
        const band = 0.36 * span;
        const s = ctx.createLinearGradient(-band / 2, 0, band / 2, 0);
        s.addColorStop(0, "rgb(255 255 255 / 0)");
        s.addColorStop(0.32, "rgb(255 255 255 / 0.16)");
        s.addColorStop(0.5, "rgb(255 255 255 / 0.7)");
        s.addColorStop(0.68, "rgb(255 255 255 / 0.16)");
        s.addColorStop(1, "rgb(255 255 255 / 0)");
        ctx.fillStyle = s;
        ctx.fillRect(-band / 2, -span, band, span * 2);
    }
    ctx.restore();
}

/* ---------- The cover ---------- */

function drawCover(f: F, start: number, span: number): void {
    const { ctx, t, w, h, box, u, v, b, B } = f;
    const c = v.cover;
    const P = v.palette;
    const dt = t - start;
    const zoom = lerp(1.07, 1, easeOutCubic(dt / B));

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-w / 2, -h / 2);

    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, w, h);
    glow(f, box.x + box.w * 0.64, box.y + box.h * 0.52, box.w * 0.62, P.glow, 0.9);
    collage(f, { x: 0, y: 0, w, h }, box.x + box.w * 0.62, 0.92);

    const lines = [
        ...(c.lead ? ["lead"] : []),
        ...c.lines.map((_, i) => `line${i}`),
        ...(c.sticker ? ["sticker"] : []),
    ];
    const cues = staggers(lines.length, start + B, span - B, b);
    const cue = (id: string) => cues[lines.indexOf(id)] ?? Infinity;

    local(f, () => {
        const star = c.star && card(f, c.star.heroId);
        if (star) {
            const cw = cardW(f, 520);
            const ch = (cw * CARD.h) / CARD.w;
            const bob = Math.sin(dt * 1.3) * 4;
            ctx.shadowColor = "rgb(0 0 0 / 0.35)";
            ctx.shadowBlur = 30;
            ctx.shadowOffsetY = 18;
            ctx.drawImage(star, 650 - cw / 2, 940 - ch + bob, cw, ch);
            ctx.shadowColor = "transparent";
            ctx.shadowOffsetY = 0;
        }
    });

    const scrimTop = box.y + box.h * 0.6;
    const bottom = ctx.createLinearGradient(0, scrimTop, 0, box.y + box.h);
    bottom.addColorStop(0, "rgb(0 0 0 / 0)");
    bottom.addColorStop(1, P.bg);
    ctx.fillStyle = bottom;
    ctx.fillRect(0, scrimTop, w, box.y + box.h - scrimTop);
    ctx.fillStyle = P.bg;
    ctx.fillRect(0, box.y + box.h, w, h - box.y - box.h);
    const left = ctx.createLinearGradient(box.x, 0, box.x + box.w * 0.5, 0);
    left.addColorStop(0, P.bg);
    left.addColorStop(1, "rgb(0 0 0 / 0)");
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = left;
    ctx.fillRect(box.x, 0, box.w * 0.5, h);
    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, box.x, h);
    ctx.globalAlpha = 1;

    local(f, () => {
        ctx.shadowColor = "rgb(0 0 0 / 0.3)";
        ctx.shadowBlur = 24;
        text(
            ctx,
            upper(f, c.masthead),
            S / 2,
            250,
            serif(f, 270, P.fg, { align: "center", baseline: "alphabetic", track: -0.035, maxW: S - 60 }),
        );
        ctx.shadowBlur = 8;
        text(ctx, upper(f, c.brand), 44, 34, display(f, 22, P.accent, { track: 0.16 }));
        text(ctx, upper(f, c.issueLine), S - 44, 34, display(f, 20, P.fg, { track: 0.14, align: "right", maxW: 620 }));

        ctx.shadowColor = "rgb(0 0 0 / 0.35)";
        ctx.shadowBlur = 14;
        let y = 300;
        const colW = 420;
        if (c.lead) {
            const lead = c.lead;
            const top = y;
            const headStyle = display(f, 60, P.fg, { maxW: colW });
            const deckStyle = serif(f, 27, P.fg, { weight: 500, italic: true, maxW: colW });
            const headline = upper(f, lead.headline);
            const head = block(f, headline, 44, top + 22, headStyle, 3, 0.98, 34, true);
            const deck = block(f, lead.deck, 44, top + 34 + head, deckStyle, 2, 1.2, 20, true);
            const rule = top + 52 + head + deck;
            scaled(f, pop(t, cue("lead"), 0.32), 44, top + 60, 1.25, () => {
                kicker(f, lead.kicker, 44, top, P.accent);
                block(f, headline, 44, top + 22, headStyle, 3, 0.98, 34);
                block(f, lead.deck, 44, top + 34 + head, deckStyle, 2, 1.2, 20);
                ctx.fillStyle = P.accent;
                ctx.fillRect(44, rule, colW, 3);
            });
            y = rule + 26;
        }
        c.lines.forEach((line, i) => {
            if (y > 800) return;
            const k = enter(t, cue(`line${i}`));
            const top = y;
            rise(
                f,
                k,
                () => {
                    ctx.save();
                    ctx.translate((1 - k) * -40, 0);
                    kicker(f, line.kicker, 44, top + 10, P.accent, { maxW: colW - 70 });
                    if (line.pageRef)
                        text(ctx, line.pageRef, 44 + colW, top + 10, display(f, 20, P.accent, { align: "right" }));
                    block(f, upper(f, line.headline), 44, top + 28, display(f, 33, P.fg, { maxW: colW }), 2, 1.04, 22);
                    ctx.restore();
                },
                0,
            );
            y += 120;
        });

        if (c.star) {
            ctx.shadowBlur = 16;
            kicker(f, c.star.kicker, 44, 870, P.accent);
            text(ctx, upper(f, c.star.name), 40, 975, display(f, 160, P.accent, { maxW: 740, track: -0.02 }));
            text(ctx, c.star.line, 44, 1046, serif(f, 27, P.fg, { weight: 500, italic: true, maxW: 760 }));
        }
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";

        barcode(f);
        if (c.sticker) sticker(f, pop(t, cue("sticker"), 0.4));
    });

    const sweepAt = start + b;
    const stickerAt = cue("sticker");
    const glare = t >= stickerAt ? (t - stickerAt) / (3 * b) : (t - sweepAt) / (4 * b);
    gloss(f, glare);
    ctx.restore();
}

function barcode(f: F): void {
    const { ctx, v } = f;
    const x = 860;
    const y = 920;
    const bw = 176;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, bw, 120);
    const bars = v.cover.barcode.bars;
    const total = bars.reduce((a, n) => a + n, 0);
    const scale = (bw - 24) / total;
    let bx = x + 12;
    ctx.fillStyle = "#111111";
    bars.forEach((n, i) => {
        if (i % 2 === 0) ctx.fillRect(bx, y + 12, n * scale, 62);
        bx += n * scale;
    });
    text(
        ctx,
        v.cover.barcode.digits,
        x + bw / 2,
        y + 88,
        display(f, 15, "#111111", { weight: 400, align: "center", track: 0.08, maxW: bw - 16 }),
    );
    text(
        ctx,
        v.cover.site,
        x + bw / 2,
        y + 108,
        display(f, 12, "#444444", { weight: 400, align: "center", maxW: bw - 16 }),
    );
}

function sticker(f: F, k: number): void {
    const { ctx, v } = f;
    const s = v.cover.sticker;
    if (!s || k <= 0) return;
    const P = v.palette;
    const x = 930;
    const y = 690;
    const r = 108;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((9 * Math.PI) / 180);
    ctx.scale(k, k);
    ctx.shadowColor = "rgb(0 0 0 / 0.35)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = P.accent;
    ctx.beginPath();
    ctx.arc(0, 0, r + 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = P.bg;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    text(ctx, upper(f, s.top), 0, -58, display(f, 18, P.bg, { align: "center", track: 0.12, maxW: 150 }));
    text(ctx, s.big, 0, 6, serif(f, s.long ? 46 : 104, P.bg, { align: "center", maxW: 176 }));
    block(f, upper(f, s.bottom), 0, 40, display(f, 16, P.bg, { align: "center", track: 0.1, maxW: 150 }), 2, 1.1, 12);
    ctx.restore();
}

/* ---------- By the numbers ---------- */

function drawNumbers(f: F, start: number, span: number): void {
    const { ctx, t, b, v } = f;
    const n = v.numbers;
    const P = v.palette;
    const Q = v.paper;
    paperPage(f, v.pages.numbers, n.kicker);
    const facts = n.facts.slice(0, 6);
    const cues = staggers(2 + facts.length, start, span, b);
    const count = COUNT_BEATS * b;

    local(f, () => {
        kicker(f, n.kicker, M, 70, P.ink);
        block(f, n.title, M, 100, serif(f, 78, Q.text, { maxW: 560 }), 2, 1.0, 50);

        const matchesNow = countUp(n.matches, t, cues[0]!, cues[0]! + count);
        const big = display(f, 300, P.ink, { weight: 400, baseline: "alphabetic" });
        setFont(ctx, big);
        const finalW = ctx.measureText(f.p.num.format(n.matches)).width;
        const k0 = enter(t, cues[0]!, 0.25);
        rise(f, k0, () => {
            setFont(ctx, big);
            ctx.textAlign = "left";
            ctx.textBaseline = "alphabetic";
            ctx.lineWidth = 7;
            ctx.strokeStyle = P.ink;
            ctx.strokeText(f.p.num.format(matchesNow), M - 6, 560);
            ctx.letterSpacing = "0px";
            block(
                f,
                upper(f, n.matchesLabel),
                M + finalW + 24,
                474,
                display(f, 30, Q.text, { maxW: Math.max(160, 980 - finalW - M - 24) }),
                2,
                1.0,
                20,
            );
        });

        if (n.won) {
            const cx = 850;
            const cy = 250;
            const r = 140;
            const k1 = enter(t, cues[1]!, 0.25);
            rise(f, k1, () => {
                const share = countUp(n.won!.share, t, cues[1]!, cues[1]! + count, 100);
                ctx.lineCap = "butt";
                ctx.lineWidth = 30;
                ctx.strokeStyle = "rgb(22 19 15 / 0.1)";
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.stroke();
                ctx.strokeStyle = P.ink;
                ctx.beginPath();
                ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + share * Math.PI * 2);
                ctx.stroke();
                text(
                    ctx,
                    f.p.pct.format(share),
                    cx,
                    cy - 8,
                    display(f, 78, Q.text, { align: "center", maxW: 2 * r - 50 }),
                );
                text(
                    ctx,
                    upper(f, n.won!.label),
                    cx,
                    cy + 52,
                    display(f, 22, Q.text, { align: "center", track: 0.16, maxW: 2 * r - 60 }),
                );
                text(
                    ctx,
                    upper(f, n.won!.record),
                    cx,
                    cy + r + 50,
                    display(f, 26, Q.text, { align: "center", track: 0.1, maxW: 300 }),
                );
            });
        }

        ctx.fillStyle = Q.text;
        ctx.fillRect(M, 610, S - 2 * M, 3);
        const colW = (S - 2 * M) / 3;
        facts.forEach((fact, i) => {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const x = M + col * colW;
            const y = 640 + row * 190;
            if (col > 0) {
                ctx.fillStyle = "rgb(22 19 15 / 0.18)";
                ctx.fillRect(x - 1, y - 10, 2, 170);
            }
            if (row > 0 && col === 0) {
                ctx.fillStyle = "rgb(22 19 15 / 0.18)";
                ctx.fillRect(M, y - 22, S - 2 * M, 2);
            }
            const pad = col > 0 ? 22 : 0;
            rise(f, enter(t, cues[2 + i]!), () => {
                text(
                    ctx,
                    upper(f, fact.label),
                    x + pad,
                    y + 12,
                    display(f, 20, P.ink, { track: 0.14, maxW: colW - pad - 14 }),
                );
                text(ctx, fact.value, x + pad, y + 64, display(f, 50, Q.text, { maxW: colW - pad - 14 }));
                block(
                    f,
                    fact.note,
                    x + pad,
                    y + 100,
                    serif(f, 23, Q.muted, { weight: 500, maxW: colW - pad - 14 }),
                    2,
                    1.15,
                    16,
                );
            });
        });
    });
}

/* ---------- Every day of the month ---------- */

function drawCalendar(f: F, start: number, span: number): void {
    const { ctx, t, b, v } = f;
    const cal = v.calendar;
    if (!cal) return;
    const P = v.palette;
    const Q = v.paper;
    paperPage(f, v.pages.calendar, v.numbers.kicker);

    local(f, () => {
        kicker(f, v.numbers.kicker, M, 70, P.ink);
        block(f, cal.title, M, 100, serif(f, 78, Q.text, { maxW: S - 2 * M }), 1, 1.0, 44);

        const legendY = 238;
        ctx.fillStyle = P.ink;
        ctx.beginPath();
        ctx.arc(M + 12, legendY, 12, 0, Math.PI * 2);
        ctx.fill();
        const won = text(
            ctx,
            cal.legendWon,
            M + 34,
            legendY,
            serif(f, 24, Q.muted, { weight: 500, italic: true, maxW: 380 }),
        );
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(M + 34 + won.w + 40, legendY, 11, 0, Math.PI * 2);
        ctx.stroke();
        text(
            ctx,
            cal.legendLost,
            M + 34 + won.w + 62,
            legendY,
            serif(f, 24, Q.muted, { weight: 500, italic: true, maxW: 420 }),
        );

        const cols = 7;
        const cw = (S - 2 * M) / cols;
        const rows = Math.ceil((cal.lead + cal.days.length) / cols);
        const top = 330;
        const rh = Math.min(120, (1010 - top) / rows);
        cal.weekdays.forEach((d, i) => {
            text(ctx, upper(f, d), M + i * cw + 8, top - 24, display(f, 22, Q.muted, { maxW: cw - 12 }));
        });

        const sweep = span * 0.5;
        const step = Math.min(b / 2, sweep / Math.max(1, cal.days.length));
        cal.days.forEach((day, i) => {
            const slot = cal.lead + i;
            const x = M + (slot % cols) * cw;
            const y = top + Math.floor(slot / cols) * rh;
            const cue = start + i * step;
            ctx.fillStyle = "rgb(22 19 15 / 0.16)";
            ctx.fillRect(x + 4, y, cw - 8, 2);
            ctx.globalAlpha = 0.35 + 0.65 * enter(t, cue, 0.2);
            text(ctx, day.day, x + 8, y + 20, display(f, 20, Q.muted, { maxW: cw - 12 }));
            ctx.globalAlpha = 1;
            if (day.matches === 0) return;
            const k = pop(t, cue, 0.3);
            if (k <= 0) return;
            const r = Math.min(rh * 0.4, day.size * 1.7);
            const cx = x + cw / 2 + 6;
            const cy = y + rh * 0.58;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(k, k);
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            if (day.won) {
                ctx.fillStyle = P.ink;
                ctx.fill();
            } else {
                ctx.strokeStyle = P.ink;
                ctx.lineWidth = 4;
                ctx.stroke();
            }
            if (r >= 15) {
                text(
                    ctx,
                    f.p.num.format(day.matches),
                    0,
                    1,
                    display(f, Math.round(r * 1.05), day.won ? Q.paper : P.ink, { align: "center" }),
                );
            }
            ctx.restore();
        });
    });
}

/* ---------- The cover story ---------- */

function drawHeroes(f: F, start: number, span: number): void {
    const { ctx, t, b, v, box, w, u } = f;
    const hv = v.heroes;
    if (!hv) return;
    const P = v.palette;
    const Q = v.paper;
    paperPage(f, v.pages.heroes, hv.kicker);
    const panelBottom = box.y + 560 * u;
    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, w, panelBottom);
    glow(f, box.x + box.w * 0.72, box.y + 300 * u, box.w * 0.55, P.glow, 0.85, panelBottom);
    collage(f, { x: 0, y: 0, w, h: panelBottom }, box.x + box.w * 0.72, 0.8);

    const rows = hv.rows;
    const cues = staggers(1 + rows.length, start, span, b);
    const count = COUNT_BEATS * b;

    local(f, () => {
        const art = card(f, hv.heroId);
        if (art) {
            const cw = cardW(f, 460);
            const ch = (cw * CARD.h) / CARD.w;
            const k = enter(t, start - 2 * b, 0.6);
            ctx.save();
            ctx.beginPath();
            ctx.rect(-box.x / u, -box.y / u, w / u, 560 + box.y / u);
            ctx.clip();
            ctx.globalAlpha = 0.4 + 0.6 * k;
            ctx.drawImage(art, 800 - cw / 2 + (1 - k) * 60, 560 - ch + 20, cw, ch);
            ctx.restore();
        }
        const scrim = ctx.createLinearGradient(0, 0, 640, 0);
        scrim.addColorStop(0, P.bg);
        scrim.addColorStop(1, "rgb(0 0 0 / 0)");
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = scrim;
        ctx.fillRect(-box.x / u, -box.y / u, 640 + box.x / u, 560 + box.y / u);
        ctx.globalAlpha = 1;

        ctx.shadowColor = "rgb(0 0 0 / 0.3)";
        ctx.shadowBlur = 12;
        kicker(f, hv.kicker, M, 80, P.accent);
        text(ctx, hv.name, M - 4, 170, serif(f, 120, P.fg, { maxW: 600 }));
        block(
            f,
            hv.title === hv.name ? hv.deck : hv.title,
            M,
            250,
            serif(f, 30, P.fg, { weight: 500, italic: true, maxW: 520 }),
            3,
            1.2,
            22,
        );

        const k = enter(t, cues[0]!, 0.25);
        rise(f, k, () => {
            const share = countUp(hv.share, t, cues[0]!, cues[0]! + count, 100);
            const n = text(
                ctx,
                f.p.num.format(Math.round(share * 100)),
                M - 6,
                520,
                display(f, 210, P.fg, { weight: 400, baseline: "alphabetic" }),
            );
            text(ctx, "%", M + n.w + 4, 520, serif(f, 84, P.fg, { baseline: "alphabetic" }));
            block(f, upper(f, hv.shareLabel), M + n.w + 84, 440, display(f, 28, P.fg, { maxW: 290 }), 3, 1.0, 18);
        });
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";

        text(ctx, hv.rotation, M, 625, serif(f, 54, Q.text, { maxW: 520 }));
        text(
            ctx,
            hv.tried,
            S - M,
            630,
            serif(f, 24, Q.muted, { weight: 500, italic: true, align: "right", maxW: 420 }),
        );
        ctx.fillStyle = Q.text;
        ctx.fillRect(M, 668, S - 2 * M, 3);

        const rowH = 68;
        rows.slice(0, 5).forEach((row, i) => {
            const y = 690 + i * rowH;
            const cue = cues[1 + i]!;
            rise(
                f,
                enter(t, cue),
                () => {
                    text(ctx, f.p.num.format(i + 1), M, y + 28, display(f, 36, P.ink));
                    const img = f.images[`hero:${row.id}`];
                    if (img) {
                        const side = img.width * 0.62;
                        ctx.save();
                        ctx.beginPath();
                        ctx.arc(130, y + 28, 27, 0, Math.PI * 2);
                        ctx.clip();
                        ctx.fillStyle = P.bg;
                        ctx.fillRect(100, y, 60, 60);
                        ctx.drawImage(img, (img.width - side) / 2, img.height * 0.06, side, side, 103, y + 1, 54, 54);
                        ctx.restore();
                    }
                    text(ctx, upper(f, row.name), 176, y + 16, display(f, 28, Q.text, { maxW: 480 }));
                    const grow = easeOutCubic((t - cue) / count);
                    ctx.fillStyle = "rgb(22 19 15 / 0.1)";
                    ctx.fillRect(176, y + 40, 520, 9);
                    ctx.fillStyle = P.ink;
                    ctx.fillRect(176, y + 40, 520 * row.bar * clamp01(grow), 9);
                    text(ctx, row.games, 790, y + 18, display(f, 32, Q.text, { align: "right" }));
                    text(
                        ctx,
                        upper(f, hv.cols.games),
                        790,
                        y + 46,
                        display(f, 15, Q.muted, { align: "right", track: 0.12 }),
                    );
                    text(ctx, row.record, 950, y + 18, display(f, 32, Q.text, { align: "right" }));
                    text(
                        ctx,
                        upper(f, hv.cols.record),
                        950,
                        y + 46,
                        display(f, 15, Q.muted, { align: "right", track: 0.12 }),
                    );
                },
                16,
            );
            ctx.fillStyle = "rgb(22 19 15 / 0.14)";
            ctx.fillRect(M, y + rowH - 6, S - 2 * M, 2);
        });
    });
}

/* ---------- Game of the month ---------- */

function drawBest(f: F, start: number, span: number): void {
    const { ctx, t, b, v, box, w, u } = f;
    const g = v.best;
    if (!g) return;
    const P = v.palette;
    const Q = v.paper;
    paperPage(f, v.pages.best, g.kicker);
    const panelBottom = box.y + 540 * u;
    ctx.fillStyle = Q.dark;
    ctx.fillRect(0, 0, w, panelBottom);
    glow(f, box.x + box.w * 0.7, box.y + 330 * u, box.w * 0.5, P.glow, 0.35, panelBottom);

    const stats: { label: string; value: string; count?: number; thin: boolean }[] = [
        { label: g.labels.kills, value: "", count: g.counts.kills, thin: true },
        { label: g.labels.deaths, value: "", count: g.counts.deaths, thin: true },
        { label: g.labels.assists, value: "", count: g.counts.assists, thin: true },
        { label: g.labels.netWorth, value: g.netWorth, thin: false },
        ...(g.grade ? [{ label: g.labels.grade, value: g.grade, thin: false }] : []),
    ];
    const cues = staggers(1 + stats.length, start, span, b);
    const count = COUNT_BEATS * b;
    const big = g.grade ?? g.kda;

    local(f, () => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(-box.x / u, -box.y / u, w / u, 540 + box.y / u);
        ctx.clip();
        const slam = pop(t, cues[0]!, 0.3);
        const [sx, sy] = shake(t - cues[0]! - 0.12, 10, 3);
        scaled(f, slam, 300, 300, 1.6, () => {
            text(ctx, big, 40 + sx, 500 + sy, display(f, 500, P.night, { baseline: "alphabetic", maxW: 640 }));
        });
        const art = card(f, g.heroId);
        if (art) {
            const cw = cardW(f, 440);
            const ch = (cw * CARD.h) / CARD.w;
            const k = enter(t, cues[0]! + b, 0.5);
            ctx.globalAlpha = k;
            ctx.drawImage(art, 760 - cw / 2 + (1 - k) * 80, 560 - ch, cw, ch);
            ctx.globalAlpha = 1;
        }
        ctx.restore();
        text(
            ctx,
            upper(f, g.hero),
            S - M,
            470,
            display(f, 26, Q["dark-text"], { align: "right", track: 0.1, maxW: 400 }),
        );
        text(
            ctx,
            upper(f, g.date),
            S - M,
            504,
            display(f, 22, Q["dark-muted"], { align: "right", track: 0.1, maxW: 400 }),
        );

        kicker(f, g.kicker, M, 590, P.ink);
        const head = block(f, g.headline, M, 620, serif(f, 66, Q.text, { maxW: S - 2 * M }), 2, 1.0, 40);
        if (g.deck)
            block(
                f,
                g.deck,
                M,
                636 + head,
                serif(f, 27, Q.muted, { weight: 500, italic: true, maxW: S - 2 * M }),
                1,
                1.2,
                20,
            );

        const top = 850;
        ctx.fillStyle = Q.text;
        ctx.fillRect(M, top - 14, S - 2 * M, 3);
        const cellW = (S - 2 * M) / stats.length;
        stats.forEach((s, i) => {
            const x = M + i * cellW;
            const cue = cues[1 + i]!;
            if (i > 0) {
                ctx.fillStyle = "rgb(22 19 15 / 0.18)";
                ctx.fillRect(x, top, 2, 140);
            }
            const pad = i > 0 ? 18 : 0;
            rise(f, enter(t, cue), () => {
                const value = s.count === undefined ? s.value : f.p.num.format(countUp(s.count, t, cue, cue + count));
                text(
                    ctx,
                    value,
                    x + pad,
                    top + 60,
                    display(f, s.thin ? 86 : 58, P.ink, { weight: s.thin ? 400 : 700, maxW: cellW - pad - 10 }),
                );
                text(
                    ctx,
                    upper(f, s.label),
                    x + pad,
                    top + 124,
                    display(f, 17, Q.text, { track: 0.14, maxW: cellW - pad - 10 }),
                );
            });
        });
    });
}

/* ---------- The company you keep ---------- */

function drawPeople(f: F, start: number, span: number): void {
    const { ctx, t, b, v } = f;
    const pv = v.people;
    if (!pv) return;
    const P = v.palette;
    const Q = v.paper;
    paperPage(f, v.pages.people, pv.kicker);
    const mates = pv.mates.slice(0, 3);
    const cues = staggers(mates.length + (pv.nemesis ? 1 : 0), start, span, b);

    local(f, () => {
        kicker(f, pv.kicker, M, 70, P.ink);
        let y = 100 + block(f, pv.title, M, 100, serif(f, 84, Q.text, { maxW: S - 2 * M }), 2, 1.0, 50);
        if (pv.intro)
            y +=
                14 +
                block(
                    f,
                    pv.intro,
                    M,
                    y + 14,
                    serif(f, 28, Q.muted, { weight: 500, italic: true, maxW: S - 2 * M }),
                    2,
                    1.2,
                    20,
                );
        y += 24;
        ctx.fillStyle = Q.text;
        ctx.fillRect(M, y, S - 2 * M, 3);
        y += 18;

        const rowH = pv.nemesis ? 104 : 140;
        mates.forEach((mate, i) => {
            const top = y + i * rowH;
            const k = enter(t, cues[i]!);
            rise(
                f,
                k,
                () => {
                    const r = i === 0 ? 42 : 36;
                    const cx = M + 44;
                    const cy = top + rowH / 2 - 4;
                    ctx.beginPath();
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    if (i === 0) {
                        ctx.fillStyle = P.ink;
                        ctx.fill();
                    } else {
                        ctx.strokeStyle = P.ink;
                        ctx.lineWidth = 3;
                        ctx.stroke();
                    }
                    text(ctx, mate.initial, cx, cy + 2, display(f, r, i === 0 ? Q.paper : P.ink, { align: "center" }));
                    text(ctx, upper(f, mate.name), M + 112, cy - 18, display(f, 42, Q.text, { maxW: S - 2 * M - 120 }));
                    text(
                        ctx,
                        mate.line,
                        M + 112,
                        cy + 24,
                        serif(f, 25, Q.muted, { weight: 500, maxW: S - 2 * M - 120 }),
                    );
                },
                20,
            );
            ctx.fillStyle = "rgb(22 19 15 / 0.14)";
            ctx.fillRect(M, top + rowH - 4, S - 2 * M, 2);
        });
        y += mates.length * rowH + 26;

        const nem = pv.nemesis;
        if (nem) {
            const cue = cues[mates.length]!;
            const boxH = Math.min(260, 1000 - y);
            const k = pop(t, cue, 0.32);
            const [sx, sy] = shake(t - cue - 0.1, 8, 7);
            scaled(
                f,
                k,
                S / 2,
                y + boxH / 2,
                1.2,
                () => {
                    ctx.translate(sx, sy);
                    ctx.fillStyle = Q.dark;
                    ctx.fillRect(M, y, S - 2 * M, boxH);
                    kicker(f, nem.kicker, M + 36, y + 40, P.night);
                    text(ctx, nem.name, M + 32, y + 104, serif(f, 82, Q["dark-text"], { maxW: S - 2 * M - 70 }));
                    text(
                        ctx,
                        nem.line,
                        M + 36,
                        y + 162,
                        serif(f, 27, Q["dark-muted"], { weight: 500, maxW: S - 2 * M - 70 }),
                    );
                    if (nem.headline && boxH >= 230) {
                        text(
                            ctx,
                            nem.headline,
                            M + 36,
                            y + 206,
                            serif(f, 27, Q["dark-text"], { weight: 500, italic: true, maxW: S - 2 * M - 70 }),
                        );
                    }
                },
                -0.05,
            );
        }
    });
}

/* ---------- Rank report ---------- */

function drawRank(f: F, start: number, span: number): void {
    const { ctx, t, b, B, v } = f;
    const rv = v.rank;
    if (!rv) return;
    const P = v.palette;
    const Q = v.paper;
    paperPage(f, v.pages.rank, rv.kicker);
    const cues = staggers(4, start, span, b);

    const badge = (key: string, cx: number, cy: number, size: number) => {
        const img = f.images[key];
        if (img) {
            const k = Math.min(size / img.width, size / img.height);
            ctx.drawImage(img, cx - (img.width * k) / 2, cy - (img.height * k) / 2, img.width * k, img.height * k);
        } else {
            ctx.fillStyle = P.ink;
            ctx.beginPath();
            ctx.arc(cx, cy, size * 0.36, 0, Math.PI * 2);
            ctx.fill();
        }
    };

    local(f, () => {
        kicker(f, rv.kicker, M, 70, P.ink);
        block(f, rv.headline, M, 100, serif(f, 90, Q.text, { maxW: S - 2 * M }), 2, 1.0, 50);

        const cy = 520;
        rise(f, enter(t, cues[0]!), () => {
            badge("rank:start", 260, cy, 270);
            text(ctx, upper(f, rv.start.name), 260, cy + 190, display(f, 40, Q.text, { align: "center", maxW: 400 }));
            text(
                ctx,
                upper(f, rv.start.caption),
                260,
                cy + 232,
                display(f, 19, Q.muted, { align: "center", track: 0.14, maxW: 400 }),
            );
        });

        const draw = clamp01((t - cues[1]!) / (2 * b));
        if (draw > 0) {
            const x0 = 440;
            const x1 = lerp(x0, 620, easeOutCubic(draw));
            ctx.strokeStyle = P.ink;
            ctx.lineWidth = 8;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(x0, cy);
            ctx.lineTo(x1, cy);
            ctx.stroke();
            if (draw >= 1) {
                ctx.beginPath();
                ctx.moveTo(x1 - 30, cy - 26);
                ctx.lineTo(x1, cy);
                ctx.lineTo(x1 - 30, cy + 26);
                ctx.stroke();
            }
        }

        const endCue = Math.max(cues[2]!, start + B);
        const slam = pop(t, endCue, 0.32);
        const [sx, sy] = shake(t - endCue - 0.1, 9, 11);
        scaled(f, slam, 800, cy, 1.5, () => {
            badge("rank:end", 800 + sx, cy + sy, 360);
        });
        rise(f, enter(t, endCue + b), () => {
            text(ctx, upper(f, rv.end.name), 800, cy + 210, display(f, 50, P.ink, { align: "center", maxW: 440 }));
            text(
                ctx,
                upper(f, rv.end.caption),
                800,
                cy + 254,
                display(f, 19, Q.muted, { align: "center", track: 0.14, maxW: 440 }),
            );
        });

        rise(f, enter(t, Math.max(cues[3]!, endCue + 2 * b)), () => {
            ctx.fillStyle = "rgb(22 19 15 / 0.2)";
            ctx.fillRect(M, 900, S - 2 * M, 2);
            text(
                ctx,
                upper(f, rv.peak.caption),
                S / 2 - 14,
                950,
                display(f, 22, Q.muted, { align: "right", track: 0.16, maxW: 300 }),
            );
            text(ctx, upper(f, rv.peak.name), S / 2 + 14, 950, display(f, 38, P.ink, { maxW: 440 }));
        });
    });
}

/* ---------- The back cover ---------- */

function drawEnd(f: F, start: number): void {
    const { ctx, t, w, h, box, b, B, v } = f;
    const P = v.palette;
    const e = v.end;
    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, w, h);
    glow(f, box.x + box.w / 2, box.y + box.h * 0.42, box.w * 0.6, P.glow, 0.7);

    local(f, () => {
        ctx.globalAlpha = 0.14;
        text(
            ctx,
            upper(f, v.cover.masthead),
            S / 2,
            200,
            serif(f, 270, P.fg, { align: "center", baseline: "alphabetic", track: -0.035, maxW: S - 40 }),
        );
        ctx.globalAlpha = 1;

        const mark = f.images.brand;
        const k = pop(t, start, 0.36);
        if (mark) {
            scaled(f, k, S / 2, 380, 0.4, () => {
                ctx.drawImage(mark, S / 2 - 110, 270, 220, 220);
            });
        }
        rise(f, enter(t, start + b), () => {
            text(
                ctx,
                upper(f, v.cover.brand),
                S / 2,
                560,
                display(f, 64, P.accent, { align: "center", track: 0.16, maxW: S - 2 * M }),
            );
        });
        rise(f, enter(t, start + 2 * b), () => {
            text(
                ctx,
                upper(f, e.cta),
                S / 2,
                650,
                display(f, 38, P.fg, { align: "center", track: 0.08, maxW: S - 2 * M }),
            );
        });
        rise(f, enter(t, start + B), () => {
            text(ctx, e.url, S / 2, 740, serif(f, 76, P.fg, { align: "center", maxW: S - 2 * M }));
        });
        rise(f, enter(t, start + B + 2 * b), () => {
            ctx.fillStyle = P.accent;
            ctx.fillRect(S / 2 - 160, 870, 320, 3);
            text(
                ctx,
                upper(f, e.nextLabel),
                S / 2,
                910,
                display(f, 22, P.accent, { align: "center", track: 0.18, maxW: S - 2 * M }),
            );
            text(
                ctx,
                e.next,
                S / 2,
                956,
                serif(f, 32, P.fg, { weight: 500, italic: true, align: "center", maxW: S - 2 * M }),
            );
        });
    });
    gloss(f, null);
}
