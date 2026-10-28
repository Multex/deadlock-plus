import { clamp01, easeInOut, easeOutCubic, lerp } from "../../../kit/ease";
import type { TextStyle } from "../../../kit/text";
import type { Ctx, Rect } from "../../../kit/types";
import type { SceneAssets, SceneSize } from "../../../scene";
import type { TakeFrame } from "../data";
import {
    BODY_PX,
    drawBlock,
    filmStrip,
    fitBlock,
    grain,
    HEADLINE_PX,
    heroPhoto,
    image,
    imageKeys,
    loupe,
    mix,
    PAPER,
    PENCIL,
    say,
    sheetLayout,
    stage,
    type Block,
    type MonthlyDraw,
    type SheetLayout,
    type Stage,
} from "./studio";

export interface TakesLayout {
    title: Rect;
    sheet: Rect;
    caption: Rect;
    /** Frames per strip. */
    cols: number;
    /** What of the frame the sheet is seen through; the sheet may be taller and pans inside it. */
    view: Rect;
    /** Where the loupe may sit, clear of every word. */
    lens: Rect;
}

/** Frames as wide as the width allows: the sheet runs past the frame's foot and the camera pans down it. */
function sheetArea(x: number, y: number, w: number, frames: number, cols: number): Rect {
    const probe = sheetLayout(frames, { x, y, w, h: 1e6 }, cols);
    const last = probe.strips[probe.strips.length - 1]!;
    return { x, y, w, h: last.y + last.h - probe.strips[0]!.y };
}

/**
 * Title, then the caption's room, then the sheet. On 16:9 the sheet takes the left and the words the right. The
 * sheet holds no words, so it may run below the safe band.
 */
export function takesLayout(st: Stage, titleH: number, capH: number, frames = 31): TakesLayout {
    const { u, m, w, h, safe } = st;
    if (st.aspect === "wide") {
        const col = w * 0.6;
        const textW = w - col - m * 1.5;
        const top = (h - titleH - 40 * u - capH) / 2;
        const view = { x: 0, y: 0, w: col, h };
        return {
            sheet: sheetArea(m * 0.5, m * 0.6, col - m * 1.1, frames, 5),
            title: { x: col + m * 0.5, y: top, w: textW, h: titleH },
            caption: { x: col + m * 0.5, y: top + titleH + 40 * u, w: textW, h: capH },
            cols: 5,
            view,
            lens: view,
        };
    }
    const tall = st.aspect === "tall";
    const top = tall ? safe.top + 16 * u : m * 0.6;
    const capY = top + titleH + 18 * u;
    const sheetY = capY + capH + 44 * u;
    const cols = tall ? 4 : 6;
    const view = { x: 0, y: sheetY - 30 * u, w, h: h - sheetY + 30 * u };
    return {
        title: { x: m, y: top, w: w - 2 * m, h: titleH },
        caption: { x: m, y: capY, w: w - 2 * m, h: capH },
        sheet: sheetArea(m * 0.35, sheetY, w - m * 0.7, frames, cols),
        cols,
        view,
        lens: { x: 0, y: capY + capH + 20 * u, w, h: h - (capY + capH + 20 * u) },
    };
}

/** How far up the sheet has panned at `k` (0-1) on its way to showing `target` in the middle of the view. */
export function sheetPan(lay: TakesLayout, target: Rect, k: number): number {
    const overflow = Math.max(0, lay.sheet.y + lay.sheet.h - (lay.view.y + lay.view.h) + 40);
    const want = target.y + target.h / 2 - (lay.view.y + lay.view.h * 0.5);
    return -Math.min(overflow, Math.max(0, want)) * easeInOut(k);
}

export interface TakesGeometry {
    lay: TakesLayout;
    title: Block;
    caption: Block;
    titleStyle: Omit<TextStyle, "px">;
    captionStyle: Omit<TextStyle, "px">;
}

/** The takes' words fitted and the layout they leave: the shot uses it to find the same frame on the same sheet. */
export function takesGeometry(ctx: Ctx, st: Stage, d: MonthlyDraw, assets: SceneAssets): TakesGeometry | null {
    const data = d.video.beats.m_takes;
    if (!data) return null;
    const wide = st.aspect === "wide";
    const textW = wide ? st.w * 0.4 - st.m * 1.5 : st.w - 2 * st.m;
    const titleStyle = { family: assets.fonts.body, weight: 600, fill: d.palette.fg, track: -0.02 };
    const title = fitBlock(ctx, say(d, data.title), titleStyle, {
        px: 116 * st.u,
        floor: HEADLINE_PX * st.u,
        maxW: textW,
        maxLines: 2,
    });
    const captionStyle = { family: assets.fonts.body, weight: 500, fill: "#ffffff", italic: true };
    const caption = fitBlock(ctx, say(d, data.caption), captionStyle, {
        px: 58 * st.u,
        floor: BODY_PX * st.u,
        maxW: textW,
        maxLines: wide ? 4 : 2,
    });
    return {
        lay: takesLayout(st, title.height, caption.height, data.frames.length),
        title,
        caption,
        titleStyle,
        captionStyle,
    };
}

/** How a day's frame is lit: gold for a winning day, a cool shadow for a losing one. */
export function frameTone(d: MonthlyDraw, f: TakeFrame): string {
    const won = f.wins / Math.max(1, f.matches);
    return won >= 0.5 ? mix(d.palette.glow, "#ffd27a", 0.45) : mix(d.palette.bg, "#2b3448", 0.55);
}

export interface SheetOpts {
    /** 0-1 per frame: how far the frame has developed. */
    develop: (i: number) => number;
    /** Paper tilt in radians. */
    rot: number;
    dy: number;
}

/** The contact sheet: photo paper, strips of film, one frame per day; played days show the day's hero. */
export function drawSheet(
    ctx: Ctx,
    st: Stage,
    d: MonthlyDraw,
    assets: SceneAssets,
    frames: TakeFrame[],
    area: Rect,
    cols: number,
    o: SheetOpts,
): SheetLayout {
    const lay = sheetLayout(frames.length, area, cols);
    const s0 = lay.strips[0]!;
    const sN = lay.strips[lay.strips.length - 1]!;
    const pad = 22 * st.u;
    const paper = { x: s0.x - pad, y: s0.y - pad, w: s0.w + 2 * pad, h: sN.y + sN.h - s0.y + 2 * pad };
    const cx = paper.x + paper.w / 2;
    const cy = paper.y + paper.h / 2;
    ctx.save();
    ctx.translate(cx, cy + o.dy);
    ctx.rotate(o.rot);
    ctx.translate(-cx, -cy);
    ctx.save();
    ctx.shadowColor = "rgb(0 0 0 / 0.55)";
    ctx.shadowBlur = 40 * st.u;
    ctx.shadowOffsetY = 18 * st.u;
    ctx.fillStyle = PAPER;
    ctx.fillRect(paper.x, paper.y, paper.w, paper.h);
    ctx.restore();
    lay.strips.forEach((r, i) =>
        filmStrip(ctx, r, lay.band, { u: st.u, edge: `DISPATCH 400   ${i * cols + 1}A`, holes: PAPER }),
    );
    const fallback = d.video.beats.m_flash.heroId;
    frames.forEach((f, i) => {
        const r = lay.frames[i]!;
        // A day off is the empty set: the paper sweep with nobody on it, under-exposed, the date pencilled in.
        const empty = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
        empty.addColorStop(0, mix(d.palette.bg, "#000000", 0.78));
        empty.addColorStop(0.62, mix(d.palette.bg, "#000000", 0.62));
        empty.addColorStop(1, mix(d.palette.bg, "#000000", 0.85));
        ctx.fillStyle = empty;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        if (f.matches === 0) {
            ctx.save();
            ctx.font = `700 ${Math.round(r.h * 0.42)}px "${assets.fonts.display}"`;
            ctx.fillStyle = "rgb(255 255 255 / 0.13)";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(f.day), r.x + r.w / 2, r.y + r.h * 0.54);
            ctx.restore();
        }
        const k = f.matches > 0 ? clamp01(o.develop(i)) : 0;
        if (k > 0) {
            ctx.save();
            ctx.globalAlpha = k;
            const id = f.heroId ?? fallback;
            heroPhoto(ctx, r, id === null ? undefined : image(assets, imageKeys.hero(id)), frameTone(d, f), {
                fy: 0.12,
            });
            // A developing print runs hot before it settles.
            ctx.fillStyle = `rgb(255 245 220 / ${(1 - k) * 0.6})`;
            ctx.fillRect(r.x, r.y, r.w, r.h);
            tally(ctx, r, f, d);
            ctx.restore();
        }
        ctx.fillStyle = "#e8913a";
        ctx.font = `700 ${Math.max(9, lay.band * 0.5)}px monospace`;
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillText(String(f.day), r.x + r.w * 0.04, r.y + r.h + lay.band * 0.5);
    });
    ctx.restore();
    return lay;
}

/** One dot per match along the frame's foot: filled for a win, open for a loss. */
function tally(ctx: Ctx, r: Rect, f: TakeFrame, d: MonthlyDraw): void {
    const n = Math.min(f.matches, 8);
    const dot = Math.min(r.w / 12, r.h / 7);
    const y = r.y + r.h - dot * 1.2;
    ctx.save();
    ctx.fillStyle = "rgb(0 0 0 / 0.45)";
    ctx.fillRect(r.x, y - dot, r.w, dot * 2.2);
    for (let i = 0; i < n; i++) {
        const x = r.x + dot * 1.3 + i * dot * 1.45;
        ctx.beginPath();
        ctx.arc(x, y, dot * 0.5, 0, Math.PI * 2);
        if (i < f.wins) {
            ctx.fillStyle = d.palette.accent;
            ctx.fill();
        } else {
            ctx.strokeStyle = "#f4efe4";
            ctx.lineWidth = dot * 0.18;
            ctx.stroke();
        }
    }
    ctx.restore();
}

/** Seconds the sheet takes to slide in, and when each played frame develops. */
export function takesTimes(bar: number, span: number, frames: number) {
    const slide = Math.min(0.45 * bar, span * 0.25);
    const land = Math.min(bar, span * 0.5);
    return {
        slide,
        develop: (i: number) => slide * 0.4 + (i / Math.max(1, frames)) * slide * 1.3,
        developFor: 0.35,
        loupeFrom: land * 0.45,
        land,
    };
}

/** The dry spell on the sheet: the longest run of blank frames between two played days. */
export function blankRun(frames: readonly TakeFrame[]): [number, number] | null {
    let best: [number, number] | null = null;
    let from = -1;
    let seen = false;
    frames.forEach((f, i) => {
        if (f.matches > 0) {
            if (seen && from >= 0 && (!best || i - from > best[1] - best[0] + 1)) best = [from, i - 1];
            seen = true;
            from = -1;
        } else if (seen && from < 0) from = i;
    });
    return best;
}

/**
 * How the sheet is seen: sheet point `focus` sits at screen point `at`, `zoom` times its size, the lens (if any)
 * at `lens` looking at screen point `look`, the words at `words` opacity.
 */
export interface SheetView {
    focus: { x: number; y: number };
    at: { x: number; y: number };
    zoom: number;
    lens: { x: number; y: number; r: number; look: { x: number; y: number } } | null;
    words: number;
    /** How far the sheet has slid in, 0-1, and the busiest day's pan. */
    slide: number;
    pan: number;
}

export function viewCamera(ctx: Ctx, v: SheetView, paint: () => void): void {
    ctx.save();
    ctx.translate(v.at.x, v.at.y);
    ctx.scale(v.zoom, v.zoom);
    ctx.translate(-v.focus.x, -v.focus.y);
    paint();
    ctx.restore();
}

/** Where a sheet point lands on screen under `v`. */
export function onScreen(v: SheetView, p: { x: number; y: number }): { x: number; y: number } {
    return { x: (p.x - v.focus.x) * v.zoom + v.at.x, y: (p.y - v.focus.y) * v.zoom + v.at.y };
}

/** The takes' own choreography at `local`: the sheet slides up, pans to the busiest day, the loupe lands on it. */
export function takesView(
    st: Stage,
    geo: TakesGeometry,
    frames: number,
    loupeAt: number,
    local: number,
    span: number,
    bar: number,
): SheetView {
    const lay = geo.lay;
    const times = takesTimes(bar, span, frames);
    const sheetLay = sheetLayout(frames, lay.sheet, lay.cols);
    const target = sheetLay.frames[loupeAt] ?? sheetLay.frames[0]!;
    const pan = sheetPan(lay, target, local / times.land);
    const slide = easeOutCubic(local / times.slide);
    const t = { x: target.x + target.w / 2, y: target.y + target.h / 2 + pan };
    const zoom = 1 + 0.07 * easeInOut(local / span);
    const v: SheetView = { focus: t, at: t, zoom, lens: null, words: 1, slide, pan };
    if (local >= times.loupeFrom) {
        const lk = easeInOut((local - times.loupeFrom) / (times.land - times.loupeFrom));
        const r = Math.min(190 * st.u, target.w * 1.1);
        const s = onScreen(v, t);
        const hover = local > times.land ? Math.sin((local - times.land) * 2.2) * 4 * st.u : 0;
        const lx = lerp(st.w + r, s.x, lk) + hover;
        const ly = lerp(s.y + st.h * 0.25, s.y, lk) - Math.sin(lk * Math.PI) * 80 * st.u;
        const kept = keepLens(lx, ly, r + 6 * st.u, lay.lens);
        v.lens = { x: lerp(lx, kept.x, lk), y: lerp(ly, kept.y, lk), r, look: { x: lx, y: ly } };
    }
    return v;
}

/** The light table with the sheet on it under `v`, the loupe and the words. */
export function paintTakes(
    ctx: Ctx,
    st: Stage,
    d: MonthlyDraw,
    assets: SceneAssets,
    geo: TakesGeometry,
    v: SheetView,
    local: number,
    extra?: () => void,
): void {
    const data = d.video.beats.m_takes!;
    const lay = geo.lay;
    const bar = assets.timing.barSeconds;
    const times = takesTimes(bar, 1e9, data.frames.length);
    lightTable(ctx, st, d);
    const sheetLay = sheetLayout(data.frames.length, lay.sheet, lay.cols);
    const develop = (i: number) => (local - times.develop(i)) / times.developFor;
    const sheet = { rot: lerp(-0.07, -0.012, v.slide), dy: (1 - v.slide) * st.h * 0.5 + v.pan };
    const paintSheet = () => {
        drawSheet(ctx, st, d, assets, data.frames, lay.sheet, lay.cols, { develop, ...sheet });
        const dry = data.signal === "dry_spell" ? blankRun(data.frames) : null;
        if (dry) {
            const a = sheetLay.frames[dry[0]];
            const b = sheetLay.frames[dry[1]];
            const k = clamp01((local - takesTimes(bar, 1e9, 0).land) / (bar * 0.4));
            if (a && b && k > 0) {
                ctx.save();
                ctx.strokeStyle = PENCIL;
                ctx.lineWidth = 7 * st.u;
                ctx.lineCap = "round";
                ctx.beginPath();
                const y = a.y + a.h * 0.5 + v.pan;
                ctx.moveTo(a.x, y);
                ctx.lineTo(lerp(a.x, b.x + b.w, k), y + (b.y - a.y) * k);
                ctx.stroke();
                ctx.restore();
            }
        }
        extra?.();
    };
    viewCamera(ctx, v, paintSheet);
    if (v.lens)
        loupe(
            ctx,
            v.lens.x,
            v.lens.y,
            v.lens.r,
            2.1,
            () => {
                lightTable(ctx, st, d);
                viewCamera(ctx, v, paintSheet);
            },
            v.lens.look,
        );
    if (v.words > 0) {
        ctx.save();
        ctx.globalAlpha = v.words;
        ctx.fillStyle = "rgb(12 10 8 / 0.62)";
        ctx.fillRect(0, 0, st.w, lay.caption.y + geo.caption.height + 28 * st.u);
        drawBlock(ctx, geo.title, lay.title.x, lay.title.y, geo.titleStyle, {
            reveal: 0.3 + 0.7 * clamp01(local / (bar * 0.3)),
        });
        const capK = clamp01((local - times.land) / (bar * 0.35));
        if (capK > 0) drawBlock(ctx, geo.caption, lay.caption.x, lay.caption.y, geo.captionStyle, { reveal: capK });
        ctx.restore();
    }
}

/** The editor's light table: an opal glass box glowing from under the sheet, the month's colour at its edges. */
function lightTable(ctx: Ctx, st: Stage, d: MonthlyDraw): void {
    const g = ctx.createRadialGradient(
        st.w * 0.5,
        st.h * 0.55,
        0,
        st.w * 0.5,
        st.h * 0.55,
        Math.hypot(st.w, st.h) * 0.6,
    );
    g.addColorStop(0, "#f7f3ea");
    g.addColorStop(0.55, mix("#e9e2d2", d.palette.glow, 0.12));
    g.addColorStop(1, mix(d.palette.bg, "#000000", 0.55));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, st.w, st.h);
}

export function draw(
    ctx: Ctx,
    local: number,
    span: number,
    size: SceneSize,
    d: MonthlyDraw,
    assets: SceneAssets,
): void {
    const data = d.video.beats.m_takes;
    if (!data) return;
    const st = stage(size);
    const geo = takesGeometry(ctx, st, d, assets)!;
    const v = takesView(st, geo, data.frames.length, data.loupe, local, span, assets.timing.barSeconds);
    paintTakes(ctx, st, d, assets, geo, v, local);
    grain(ctx, st, local, 0.06);
}

/** A lens of radius `r` moved the least it takes to sit wholly inside `area`. */
export function keepLens(x: number, y: number, r: number, area: Rect): { x: number; y: number } {
    const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
    return { x: clamp(x, area.x + r, area.x + area.w - r), y: clamp(y, area.y + r, area.y + area.h - r) };
}
