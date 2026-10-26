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
    studioSet,
    withCamera,
    type Block,
    type MonthlyDraw,
    type SheetLayout,
    type Stage,
} from "./studio";

export interface TakesLayout {
    title: Rect;
    sheet: Rect;
    caption: Rect;
    /** Frames per strip: fewer on 9:16 so each frame reads bigger. */
    cols: number;
}

/**
 * Title, then the caption's room, then the sheet; the sheet may run below the safe band (it holds no words).
 * On 16:9 the sheet takes the left and the words the right.
 */
export function takesLayout(st: Stage, titleH: number, capH: number): TakesLayout {
    const { u, m, w, h, safe } = st;
    if (st.aspect === "wide") {
        const col = w * 0.6;
        const textW = w - col - m * 1.5;
        const top = (h - titleH - 40 * u - capH) / 2;
        return {
            sheet: { x: m * 0.5, y: m * 0.6, w: col - m * 1.1, h: h - 1.2 * m },
            title: { x: col + m * 0.5, y: top, w: textW, h: titleH },
            caption: { x: col + m * 0.5, y: top + titleH + 40 * u, w: textW, h: capH },
            cols: 7,
        };
    }
    const tall = st.aspect === "tall";
    const top = safe.top + 16 * u;
    const capY = top + titleH + 18 * u;
    const sheetY = capY + capH + 44 * u;
    return {
        title: { x: m, y: top, w: w - 2 * m, h: titleH },
        caption: { x: m, y: capY, w: w - 2 * m, h: capH },
        sheet: { x: m * 0.35, y: sheetY, w: w - m * 0.7, h: (tall ? h - 70 * u : h - m * 0.6) - sheetY },
        cols: tall ? 5 : 7,
    };
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
    const titleStyle = { family: assets.fonts.display, weight: 700, fill: d.palette.fg };
    const title = fitBlock(ctx, say(d, data.title), titleStyle, {
        px: 116 * st.u,
        floor: HEADLINE_PX * st.u,
        maxW: textW,
        maxLines: 2,
    });
    const captionStyle = { family: assets.fonts.body, weight: 600, fill: "#ffffff" };
    const caption = fitBlock(ctx, say(d, data.caption), captionStyle, {
        px: 58 * st.u,
        floor: BODY_PX * st.u,
        maxW: textW,
        maxLines: wide ? 4 : 2,
    });
    return { lay: takesLayout(st, title.height, caption.height), title, caption, titleStyle, captionStyle };
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
export function drawSheet(ctx: Ctx, st: Stage, d: MonthlyDraw, assets: SceneAssets, frames: TakeFrame[], area: Rect, cols: number, o: SheetOpts): SheetLayout {
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
    lay.strips.forEach((r, i) => filmStrip(ctx, r, lay.band, { u: st.u, edge: `DISPATCH 400   ${i * cols + 1}A`, holes: PAPER }));
    const fallback = d.video.beats.m_flash.heroId;
    frames.forEach((f, i) => {
        const r = lay.frames[i]!;
        ctx.fillStyle = "#1b1713";
        ctx.fillRect(r.x, r.y, r.w, r.h);
        const k = f.matches > 0 ? clamp01(o.develop(i)) : 0;
        if (k > 0) {
            ctx.save();
            ctx.globalAlpha = k;
            const id = f.heroId ?? fallback;
            heroPhoto(ctx, r, id === null ? undefined : image(assets, imageKeys.hero(id)), frameTone(d, f), { fy: 0.12 });
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

export function draw(ctx: Ctx, local: number, span: number, size: SceneSize, d: MonthlyDraw, assets: SceneAssets): void {
    const data = d.video.beats.m_takes;
    if (!data) return;
    const st = stage(size);
    const bar = assets.timing.barSeconds;
    const times = takesTimes(bar, span, data.frames.length);
    const geo = takesGeometry(ctx, st, d, assets)!;
    const lay = geo.lay;

    studioSet(ctx, st, d.palette, { backdrop: image(assets, imageKeys.backdrop), light: 0.55, art: 0.35, drift: local / span });
    ctx.fillStyle = "rgb(0 0 0 / 0.35)";
    ctx.fillRect(0, 0, st.w, st.h);

    const slideK = easeOutCubic(local / times.slide);
    const sheet = { rot: lerp(-0.07, -0.012, slideK), dy: (1 - slideK) * st.h * 0.5 };
    const sheetLay = sheetLayout(data.frames.length, lay.sheet, lay.cols);
    const target = sheetLay.frames[data.loupe] ?? sheetLay.frames[0]!;
    const tx = target.x + target.w / 2;
    const ty = target.y + target.h / 2;
    const develop = (i: number) => (local - times.develop(i)) / times.developFor;

    const push = easeInOut(local / span);
    const cam = { ox: tx, oy: ty, zoom: 1 + 0.07 * push };
    const paintSheet = () => {
        drawSheet(ctx, st, d, assets, data.frames, lay.sheet, lay.cols, { develop, ...sheet });
        const dry = data.signal === "dry_spell" ? blankRun(data.frames) : null;
        if (dry) {
            const a = sheetLay.frames[dry[0]];
            const b = sheetLay.frames[dry[1]];
            const k = clamp01((local - times.land) / (bar * 0.4));
            if (a && b && k > 0) {
                ctx.save();
                ctx.strokeStyle = PENCIL;
                ctx.lineWidth = 7 * st.u;
                ctx.lineCap = "round";
                ctx.beginPath();
                const y = a.y + a.h * 0.5;
                ctx.moveTo(a.x, y);
                ctx.lineTo(lerp(a.x, b.x + b.w, k), y + (b.y - a.y) * k);
                ctx.stroke();
                ctx.restore();
            }
        }
    };
    withCamera(ctx, cam, paintSheet);

    // The loupe glides in from the lower right and settles on the frame on the bar line.
    const lk = easeInOut((local - times.loupeFrom) / (times.land - times.loupeFrom));
    if (local >= times.loupeFrom) {
        const r = Math.min(170 * st.u, target.w * 1.25);
        const sx = (tx - cam.ox) * cam.zoom + cam.ox;
        const sy = (ty - cam.oy) * cam.zoom + cam.oy;
        const fromX = st.w + r;
        const fromY = sy + st.h * 0.25;
        const hover = local > times.land ? Math.sin((local - times.land) * 2.2) * 4 * st.u : 0;
        const lx = lerp(fromX, sx, lk) + hover;
        const ly = lerp(fromY, sy, lk) - Math.sin(lk * Math.PI) * 80 * st.u;
        // Kept whole on screen once it lands; it still looks at the frame under it.
        const edge = r + st.m * 0.25;
        const keep = (v: number, lo: number, hi: number) => lerp(v, Math.min(hi, Math.max(lo, v)), lk);
        loupe(ctx, keep(lx, edge, st.w - edge), keep(ly, edge, st.h - edge), r, 2.3, () => withCamera(ctx, cam, paintSheet), {
            x: lx,
            y: ly,
        });
    }

    drawBlock(ctx, geo.title, lay.title.x, lay.title.y, geo.titleStyle, { reveal: 0.3 + 0.7 * clamp01(local / (bar * 0.3)) });
    const capK = clamp01((local - times.land) / (bar * 0.35));
    if (capK > 0) {
        ctx.save();
        ctx.fillStyle = `rgb(0 0 0 / ${0.4 * capK})`;
        ctx.fillRect(0, lay.caption.y - 14 * st.u, st.w, geo.caption.height + 28 * st.u);
        ctx.restore();
        drawBlock(ctx, geo.caption, lay.caption.x, lay.caption.y, geo.captionStyle, { reveal: capK });
    }
    grain(ctx, st, local, 0.08);
}
