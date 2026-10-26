import { flashAt } from "../../../kit/beat";
import { feathered } from "../../../kit/bitmap";
import { clamp01, easeInOut, easeOutBack, easeOutCubic } from "../../../kit/ease";
import { setFont, type TextStyle } from "../../../kit/text";
import type { Bitmap, Ctx, Rect } from "../../../kit/types";
import type { SceneAssets, SceneSize } from "../../../scene";
import type { FeatureData, ReelMatch } from "../data";
import type { FeatureAngle } from "../slots";
import {
    credit,
    deckStyle,
    drawSpread,
    headlineBlock,
    headStyle,
    INK,
    kicker,
    MARGIN,
    MUTED,
    PAGE_BODY,
    PAGE_H,
    PAGE_W,
    readShift,
    rule,
    spreadLayout,
    type PageCamera,
    type Spread,
} from "./print";
import {
    drawBlock,
    drawCover,
    fitBlock,
    flashOverlay,
    formatNumber,
    grain,
    greasePencil,
    image,
    imageKeys,
    mix,
    PENCIL,
    say,
    stage,
    tint,
    type MonthlyDraw,
    type Stage,
} from "./studio";

/** How the spread pictures its angle. */
export type FeatureArt = "log" | "makeover" | "pair" | "cast" | "number";

export function featureArt(angle: FeatureAngle, reel: number): FeatureArt {
    switch (angle) {
        case "climb":
        case "slide":
            return "makeover";
        case "streak":
        case "losing_then_winning":
        case "marathon":
            return reel > 0 ? "log" : "number";
        case "duo":
        case "nemesis":
            return "pair";
        case "explorer":
            return "cast";
        default:
            return "number";
    }
}

/** How many of `n` log rows fit `room` page units at no less than `minRow` each, and how tall each is. */
export function logRows(n: number, room: number, minRow: number, maxRow: number): { shown: number; rowH: number } {
    if (n <= 0) return { shown: 0, rowH: maxRow };
    const fit = Math.max(1, Math.floor(room / minRow));
    // A run longer than the page closes on a "+N" row, so one row goes to that.
    const shown = n <= fit ? n : fit - 1;
    const rows = shown + (shown < n ? 1 : 0);
    return { shown, rowH: Math.min(maxRow, room / rows) };
}

/** The rows a comeback shows when it is longer than the page: its last losses, then the turn. */
export function logPick(reel: readonly ReelMatch[], shown: number): ReelMatch[] {
    if (reel.length <= shown) return [...reel];
    const losses = reel.findIndex((m) => m.outcome === "win");
    if (losses <= 0) return reel.slice(0, shown);
    const keep = Math.min(losses, Math.max(1, Math.floor(shown / 3)));
    return [...reel.slice(losses - keep, losses), ...reel.slice(losses, losses + shown - keep)];
}

function art(assets: SceneAssets, id: number | null): Bitmap | undefined {
    if (id === null) return undefined;
    return image(assets, imageKeys.gloat(id)) ?? image(assets, imageKeys.hero(id));
}

function card(assets: SceneAssets, id: number): Bitmap | undefined {
    return image(assets, imageKeys.hero(id)) ?? image(assets, imageKeys.gloat(id));
}

export function heroTone(d: MonthlyDraw, id: number | null): string {
    const c = id === null ? null : d.heroes?.[id]?.colour;
    const hex = c ? (c.startsWith("#") ? c : `#${c}`) : d.palette.glow;
    return /^#[0-9a-f]{6}$/i.test(hex) ? hex : d.palette.glow;
}

/**
 * A photograph printed on the page: the hero lit in their own colour against the studio backdrop, `zoom` and
 * `fy` framing the card.
 */
export function pagePhoto(
    ctx: Ctx,
    r: Rect,
    d: MonthlyDraw,
    assets: SceneAssets,
    id: number | null,
    opts: { zoom?: number; fy?: number; backdrop?: Bitmap; fx?: number } = {},
): void {
    const tone = heroTone(d, id);
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    const g = ctx.createRadialGradient(
        r.x + r.w * 0.55,
        r.y + r.h * 0.35,
        0,
        r.x + r.w * 0.5,
        r.y + r.h * 0.5,
        Math.max(r.w, r.h),
    );
    g.addColorStop(0, mix(tone, "#ffffff", 0.3));
    g.addColorStop(0.55, mix(tone, "#000000", 0.35));
    g.addColorStop(1, mix(tone, "#000000", 0.75));
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    if (opts.backdrop) {
        ctx.globalAlpha = 0.45;
        drawCover(ctx, opts.backdrop, r, 0.85, 0.3, 1.05);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "color";
        ctx.fillStyle = tint(tone, 0.4);
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.globalCompositeOperation = "source-over";
    }
    const a = art(assets, id);
    if (a) {
        const zoom = opts.zoom ?? 1;
        const c = Math.max(r.w / a.width, r.h / a.height) * zoom;
        const w = a.width * c;
        const h = a.height * c;
        ctx.shadowColor = "rgb(0 0 0 / 0.45)";
        ctx.shadowBlur = r.w * 0.05;
        ctx.shadowOffsetX = r.w * 0.02;
        ctx.drawImage(feathered(a), r.x + (r.w - w) * (opts.fx ?? 0.5), r.y + (r.h - h) * (opts.fy ?? 0.1), w, h);
        ctx.shadowColor = "transparent";
    }
    ctx.restore();
}

/** A hero's face in a round frame, for a row of the log. */
function thumb(ctx: Ctx, x: number, y: number, r: number, d: MonthlyDraw, assets: SceneAssets, id: number): void {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = mix(heroTone(d, id), "#000000", 0.25);
    ctx.fill();
    ctx.clip();
    const a = card(assets, id);
    if (a) {
        const c = ((r * 2) / a.width) * 1.25;
        ctx.drawImage(a, x - (a.width * c) / 2, y - r * 1.05, a.width * c, a.height * c);
    }
    ctx.restore();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
}

function cell(
    ctx: Ctx,
    text: string,
    x: number,
    y: number,
    s: { family: string; px: number; fill: string; align?: CanvasTextAlign; maxW: number; weight?: number },
): number {
    setFont(ctx, { family: s.family, weight: s.weight ?? 700, px: s.px, track: 0.02 } as TextStyle);
    ctx.fillStyle = s.fill;
    ctx.textAlign = s.align ?? "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y, s.maxW);
    return Math.min(s.maxW, ctx.measureText(text).width);
}

const LOG_TOP_GAP = 34;

/**
 * The run as a game log: one row a match, landing on the beat, each result marked by the editor's red pencil:
 * a ring round a win, a line through a loss. Returns the page row the latest landed row ends at.
 */
function log(
    ctx: Ctx,
    top: number,
    local: number,
    beat: number,
    f: FeatureData,
    d: MonthlyDraw,
    assets: SceneAssets,
): number {
    const fonts = assets.fonts;
    const room = PAGE_H - 120 - top - LOG_TOP_GAP;
    const { shown, rowH } = logRows(f.reel.length, room, 84, 112);
    const rows = logPick(f.reel, shown);
    const more = f.reel.length - rows.length;
    const x0 = MARGIN;
    const x1 = PAGE_W - MARGIN;
    const px = PAGE_BODY;
    let y = top + LOG_TOP_GAP;
    rule(ctx, x0, y - 12, x1 - x0, INK, 4);
    let last = y;
    const start = beat * 2;
    const step = Math.min(beat, (beat * 10) / Math.max(1, rows.length + (more > 0 ? 1 : 0)));
    rows.forEach((m, i) => {
        const at = start + i * step;
        const k = clamp01((local - at) / 0.22);
        if (k <= 0) return;
        const cy = y + rowH / 2;
        ctx.save();
        ctx.globalAlpha = k;
        ctx.translate(0, (1 - easeOutCubic(k)) * 30);
        const r = Math.min(rowH * 0.4, 42);
        cell(ctx, m.date.toUpperCase(), x0, cy, { family: fonts.display, px: px * 0.8, fill: MUTED, maxW: 170 });
        thumb(ctx, x0 + 205, cy, r, d, assets, m.heroId);
        const name = d.heroes?.[m.heroId]?.name ?? "";
        const kda = `${formatNumber(d, m.kda.kills)}/${formatNumber(d, m.kda.deaths)}/${formatNumber(d, m.kda.assists)}`;
        const kdaW = cell(ctx, kda, x1 - 110, cy, { family: fonts.display, px, fill: INK, align: "right", maxW: 250 });
        cell(ctx, name.toUpperCase(), x0 + 205 + r + 22, cy, {
            family: fonts.display,
            px,
            fill: INK,
            maxW: x1 - 110 - kdaW - 24 - (x0 + 205 + r + 22),
        });
        const win = m.outcome === "win";
        const wl = win ? "W" : "L";
        const rx = x1 - 40;
        cell(ctx, wl, rx, cy, {
            family: fonts.body,
            px: px * 1.05,
            fill: win ? INK : MUTED,
            align: "center",
            maxW: 80,
            weight: 600,
        });
        ctx.restore();
        const mk = clamp01((local - at - 0.12) / 0.3);
        if (win) greasePencil(ctx, rx, cy, 40, rowH * 0.36, 400 + i * 13, mk, 7);
        else if (mk > 0) {
            ctx.save();
            ctx.strokeStyle = PENCIL;
            ctx.lineWidth = 7;
            ctx.lineCap = "round";
            ctx.globalAlpha = 0.9;
            ctx.beginPath();
            ctx.moveTo(x0 + 190, cy + 4);
            ctx.lineTo(x0 + 190 + (x1 - 130 - x0 - 190) * mk, cy - 2);
            ctx.stroke();
            ctx.restore();
        }
        ctx.fillStyle = "rgb(22 19 15 / 0.18)";
        ctx.fillRect(x0, y + rowH - 1, x1 - x0, 2);
        y += rowH;
        last = y;
    });
    if (more > 0) {
        const at = start + rows.length * step;
        const k = clamp01((local - at) / 0.22);
        if (k > 0) {
            ctx.save();
            ctx.globalAlpha = k;
            cell(ctx, `+${formatNumber(d, more)}`, x0, y + rowH / 2, {
                family: fonts.body,
                px,
                fill: MUTED,
                maxW: 300,
                weight: 600,
            });
            ctx.restore();
            last = y + rowH;
        }
    }
    return last;
}

/** Before and after: the badge the month opened on, then the one it closed on, pasted in a beat apart. */
function makeover(
    ctx: Ctx,
    top: number,
    local: number,
    beat: number,
    f: FeatureData,
    d: MonthlyDraw,
    assets: SceneAssets,
): number {
    if (!f.badges) return top;
    const fonts = assets.fonts;
    const gap = 60;
    const pw = (PAGE_W - 2 * MARGIN - gap) / 2;
    const ph = Math.min(pw * 1.15, PAGE_H - 130 - top - 200);
    const y = top + 50;
    const up = f.angle === "climb";
    const labels = d.print?.labels;
    const sides: [number, number, string, string][] = [
        [MARGIN, f.badges.start, labels?.rankStart ?? "", String(f.deck.params.start ?? "")],
        [MARGIN + pw + gap, f.badges.end, labels?.rankEnd ?? "", String(f.deck.params.end ?? "")],
    ];
    sides.forEach(([x, badge, label, name], i) => {
        const at = beat * 2 + i * beat * 2;
        const k = easeOutBack(clamp01((local - at) / 0.35), 1.4);
        if (k <= 0) return;
        const r = { x, y, w: pw, h: ph };
        ctx.save();
        ctx.translate(x + pw / 2, y + ph / 2);
        ctx.rotate((i ? 0.02 : -0.025) * k);
        ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k);
        ctx.translate(-(x + pw / 2), -(y + ph / 2));
        ctx.globalAlpha = clamp01(k);
        const after = i === 1;
        const tone = after
            ? up
                ? mix(d.palette.glow, "#ffe7a0", 0.3)
                : mix(d.palette.bg, "#26324a", 0.6)
            : mix(d.palette.bg, "#5a5a5a", 0.5);
        ctx.fillStyle = mix(tone, "#000000", 0.35);
        ctx.fillRect(r.x, r.y, r.w, r.h);
        const img = image(assets, imageKeys.rank(badge));
        if (img) {
            const c = (Math.min(r.w, r.h) * 0.74) / Math.max(img.width, img.height);
            ctx.save();
            if (!after || !up) ctx.filter = after ? "saturate(0.7) brightness(0.85)" : "grayscale(0.6)";
            ctx.drawImage(
                img,
                r.x + (r.w - img.width * c) / 2,
                r.y + (r.h - img.height * c) / 2,
                img.width * c,
                img.height * c,
            );
            ctx.restore();
        } else {
            // No badge art: the rank's number set large, the way a scoreboard would.
            const digit = name.match(/\d+$/)?.[0] ?? "";
            setFont(ctx, { family: fonts.body, weight: 600, px: r.h * 0.6 } as TextStyle);
            ctx.fillStyle = "rgb(255 255 255 / 0.85)";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(digit, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.8);
        }
        ctx.restore();
        const lk = clamp01((local - at - 0.2) / 0.3);
        if (lk > 0) {
            ctx.save();
            ctx.globalAlpha = lk;
            cell(ctx, label.toUpperCase(), x, y + ph + 40, {
                family: fonts.display,
                px: PAGE_BODY * 0.8,
                fill: MUTED,
                maxW: pw,
            });
            const b = fitBlock(
                ctx,
                name,
                headStyle(fonts.body, INK),
                { px: 80, floor: PAGE_BODY, maxW: pw, maxLines: 2 },
                0.95,
            );
            drawBlock(ctx, b, x, y + ph + 70, headStyle(fonts.body, INK));
            ctx.restore();
        }
    });
    const ak = clamp01((local - beat * 3.4) / (beat * 1.2));
    if (ak > 0) {
        const x0 = MARGIN + pw * 0.6;
        const x1 = MARGIN + pw + gap + pw * 0.35;
        const yy = y - 10;
        ctx.save();
        ctx.strokeStyle = PENCIL;
        ctx.lineWidth = 10;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x0, yy);
        ctx.quadraticCurveTo((x0 + x1) / 2, yy - 70, x0 + (x1 - x0) * ak, yy + (up ? -10 : 20) * ak);
        ctx.stroke();
        ctx.restore();
    }
    return y + ph + 220;
}

/** You and the other one: your cover star's portrait and theirs, which nobody shot, side by side. */
function pair(
    ctx: Ctx,
    top: number,
    local: number,
    beat: number,
    f: FeatureData,
    d: MonthlyDraw,
    assets: SceneAssets,
): number {
    const fonts = assets.fonts;
    const gap = 30;
    const pw = (PAGE_W - 2 * MARGIN - gap) / 2;
    const ph = Math.min(pw * 1.3, PAGE_H - 140 - top - 140);
    const y = top + 50;
    const duo = f.angle === "duo";
    const other = String(
        f.headline.params.mate ?? f.headline.params.rival ?? f.deck.params.mate ?? f.deck.params.rival ?? "",
    );
    const you = d.heroes?.[f.heroId ?? -1]?.name ?? "";
    [0, 1].forEach((i) => {
        const at = beat * 2 + i * beat * 2;
        const k = easeOutBack(clamp01((local - at) / 0.35), 1.4);
        if (k <= 0) return;
        const r = { x: MARGIN + i * (pw + gap), y, w: pw, h: ph };
        ctx.save();
        ctx.globalAlpha = clamp01(k);
        ctx.translate(r.x + pw / 2, r.y + ph / 2);
        ctx.scale(0.88 + 0.12 * k, 0.88 + 0.12 * k);
        ctx.translate(-(r.x + pw / 2), -(r.y + ph / 2));
        if (i === 0) pagePhoto(ctx, r, d, assets, f.heroId, { zoom: 1.15 });
        else {
            ctx.fillStyle = duo ? mix(d.palette.accent, "#ffffff", 0.2) : "#2a0f12";
            ctx.fillRect(r.x, r.y, r.w, r.h);
            ctx.fillStyle = duo ? "rgb(20 16 12 / 0.75)" : "rgb(0 0 0 / 0.85)";
            const cx = r.x + r.w / 2;
            ctx.beginPath();
            ctx.arc(cx, r.y + r.h * 0.38, r.w * 0.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(cx, r.y + r.h * 0.98, r.w * 0.42, r.h * 0.36, 0, Math.PI, 0);
            ctx.fill();
        }
        ctx.restore();
        const lk = clamp01((local - at - 0.25) / 0.3);
        if (lk > 0) {
            ctx.save();
            ctx.globalAlpha = lk;
            const b = fitBlock(
                ctx,
                (i === 0 ? you : other).toUpperCase(),
                { family: fonts.display, weight: 700, fill: INK },
                { px: 70, floor: PAGE_BODY, maxW: pw, maxLines: 2 },
                0.95,
            );
            drawBlock(ctx, b, r.x, y + ph + 20, { family: fonts.display, weight: 700, fill: INK });
            ctx.restore();
        }
    });
    const k = clamp01((local - beat * 5) / (beat * 1.5));
    const right = { x: MARGIN + pw + gap, y, w: pw, h: ph };
    if (duo) heart(ctx, PAGE_W / 2, y + ph * 0.12, 70, k);
    else greasePencil(ctx, right.x + pw / 2, y + ph / 2, pw * 0.6, ph * 0.56, 71, k, 10);
    return y + ph + 140;
}

function heart(ctx: Ctx, cx: number, cy: number, s: number, k: number): void {
    if (k <= 0) return;
    const N = 60;
    ctx.save();
    ctx.strokeStyle = PENCIL;
    ctx.lineWidth = 11;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i <= Math.ceil(N * k); i++) {
        const t = (i / N) * Math.PI * 2;
        const x = 16 * Math.sin(t) ** 3;
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        ctx.lineTo(cx + (x * s) / 16, cy - (y * s) / 16);
    }
    ctx.stroke();
    ctx.restore();
}

/** The month's cast: every hero tried, a contact strip of different faces with their names. */
function cast(ctx: Ctx, top: number, local: number, beat: number, d: MonthlyDraw, assets: SceneAssets): number {
    const ids = d.video.beats.m_wardrobe?.swatches.map((s) => s.heroId) ?? [];
    const fonts = assets.fonts;
    const cols = 3;
    const gap = 26;
    const tw = (PAGE_W - 2 * MARGIN - gap * (cols - 1)) / cols;
    const capH = 70;
    const rows = Math.ceil(ids.length / cols);
    const room = PAGE_H - 140 - top - 40;
    const th = Math.max(150, Math.min(tw * 1.05, room / Math.max(1, rows) - capH));
    const fit = Math.max(1, Math.floor(room / (th + capH)));
    const shown = ids.slice(0, Math.min(rows, fit) * cols);
    shown.forEach((id, i) => {
        const at = beat * 2 + i * beat * 0.75;
        const k = easeOutBack(clamp01((local - at) / 0.3), 1.6);
        if (k <= 0) return;
        const r = {
            x: MARGIN + (i % cols) * (tw + gap),
            y: top + 40 + Math.floor(i / cols) * (th + capH),
            w: tw,
            h: th,
        };
        ctx.save();
        ctx.globalAlpha = clamp01(k);
        ctx.translate(r.x + tw / 2, r.y + th / 2);
        ctx.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k);
        ctx.translate(-(r.x + tw / 2), -(r.y + th / 2));
        pagePhoto(ctx, r, d, assets, id, { zoom: 1.2 });
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = clamp01(k);
        cell(ctx, (d.heroes?.[id]?.name ?? "").toUpperCase(), r.x, r.y + th + capH * 0.48, {
            family: fonts.display,
            px: PAGE_BODY * 0.85,
            fill: INK,
            maxW: tw,
        });
        ctx.restore();
    });
    return top + 40 + Math.min(rows, fit) * (th + capH);
}

/** The angle's number set as the page's art: huge, in the month's ink, over the hero's photo. */
function number(
    ctx: Ctx,
    top: number,
    local: number,
    beat: number,
    f: FeatureData,
    d: MonthlyDraw,
    assets: SceneAssets,
): number {
    const fonts = assets.fonts;
    const ph = Math.min(560, PAGE_H - 140 - top - 40);
    const r = { x: PAGE_W - MARGIN - 470, y: top + 40, w: 470, h: ph };
    const k = easeOutCubic(clamp01((local - beat) / 0.5));
    ctx.save();
    ctx.globalAlpha = k;
    pagePhoto(ctx, r, d, assets, f.heroId, { zoom: 1.1 });
    ctx.restore();
    const big = f.stats[0] ? formatNumber(d, f.stats[0].value) : "";
    if (big) {
        const nk = easeOutBack(clamp01((local - beat * 2) / 0.3), 2);
        const px = Math.min(520, ph * 0.95);
        ctx.save();
        setFont(ctx, { family: fonts.body, weight: 600, px, track: -0.04 } as TextStyle);
        const w = ctx.measureText(big).width;
        const size = w > PAGE_W - 2 * MARGIN ? (px * (PAGE_W - 2 * MARGIN)) / w : px;
        setFont(ctx, { family: fonts.body, weight: 600, px: size, track: -0.04 } as TextStyle);
        ctx.translate(MARGIN, r.y + r.h * 0.95);
        ctx.scale(1.3 - 0.3 * nk, 1.3 - 0.3 * nk);
        ctx.globalAlpha = clamp01(nk);
        ctx.fillStyle = d.palette.ink;
        ctx.textBaseline = "alphabetic";
        ctx.shadowColor = "rgb(249 247 242 / 0.9)";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 8;
        ctx.shadowOffsetY = 8;
        ctx.fillText(big, 0, 0);
        ctx.restore();
    }
    return r.y + r.h;
}

/** The opener's left page: the hero full bleed, the angle's number huge across it, a credit up the edge. */
function opener(ctx: Ctx, local: number, span: number, f: FeatureData, d: MonthlyDraw, assets: SceneAssets): void {
    const r = { x: 0, y: 0, w: PAGE_W, h: PAGE_H };
    const kb = 1.12 - 0.08 * easeOutCubic(local / span);
    pagePhoto(ctx, r, d, assets, f.heroId, { zoom: kb, fy: 0.05, backdrop: image(assets, imageKeys.backdrop) });
    const v = ctx.createLinearGradient(0, PAGE_H * 0.5, 0, PAGE_H);
    v.addColorStop(0, "rgb(0 0 0 / 0)");
    v.addColorStop(1, "rgb(0 0 0 / 0.55)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    const big = f.stats[0] ? formatNumber(d, f.stats[0].value) : "";
    if (big) {
        const k = easeOutBack(clamp01((local - 0.1) / 0.3), 1.8);
        const px = 760;
        ctx.save();
        setFont(ctx, { family: assets.fonts.body, weight: 600, px, track: -0.05 } as TextStyle);
        const w = ctx.measureText(big).width;
        const size = Math.min(px, (px * (PAGE_W - 120)) / w);
        setFont(ctx, { family: assets.fonts.body, weight: 600, px: size, track: -0.05 } as TextStyle);
        ctx.translate(60, PAGE_H - 140);
        ctx.scale(1.25 - 0.25 * k, 1.25 - 0.25 * k);
        ctx.globalAlpha = clamp01(k);
        ctx.fillStyle = d.palette.accent;
        ctx.shadowColor = "rgb(0 0 0 / 0.4)";
        ctx.shadowBlur = 30;
        ctx.textBaseline = "alphabetic";
        ctx.fillText(big, 0, 0);
        ctx.restore();
    }
    credit(
        ctx,
        d.print?.brand ? `${d.print.brand} Studio` : "",
        PAGE_W - 44,
        PAGE_H - 120,
        assets.fonts.display,
        "rgb(255 255 255 / 0.7)",
    );
}

export const PAGED: ReadonlySet<string> = new Set(["m_feature", "m_wardrobe", "m_interview", "m_shot"]);

/** The page number of a paged beat's left page, by its place in the issue. */
export function folioOf(d: MonthlyDraw, id: string): number {
    const order = d.video.cast.beats.map((b) => b.id).filter((b) => PAGED.has(b));
    return 2 + 2 * Math.max(0, order.indexOf(id as never));
}

export function featureCamera(st: Stage, sp: Spread, local: number, span: number, shift: number): PageCamera {
    const push = easeInOut(local / span);
    const focus = st.aspect === "tall" ? sp.right : { ...sp.left, w: sp.left.w + sp.right.w };
    return {
        ox: focus.x + focus.w / 2,
        oy: st.h / 2,
        zoom: 1 + 0.035 * push,
        dx: 0,
        dy: shift,
        rot: 0,
    };
}

/** The feature spread: the opener photo on the left, the story on the right with its own picture of the angle. */
export function draw(
    ctx: Ctx,
    local: number,
    span: number,
    size: SceneSize,
    d: MonthlyDraw,
    assets: SceneAssets,
): void {
    const f = d.video.beats.m_feature;
    if (!f) return;
    const st = stage(size);
    const sp = spreadLayout(st);
    const fonts = assets.fonts;
    const beat = assets.timing.barSeconds / 4;
    const kind = featureArt(f.angle, f.reel.length);
    const w = PAGE_W - 2 * MARGIN;

    const head = headlineBlock(ctx, say(d, f.headline), fonts.body, w, 2, 170);
    const deck = fitBlock(
        ctx,
        say(d, f.deck),
        deckStyle(fonts.body),
        { px: 66, floor: PAGE_BODY, maxW: w, maxLines: 3 },
        1.12,
    );
    const headTop = 90 + PAGE_BODY;
    const deckTop = headTop + head.height + 24;
    const modTop = deckTop + deck.height + 20;

    const paintModule = (c: Ctx) => {
        if (kind === "log") log(c, modTop, local, beat, f, d, assets);
        else if (kind === "makeover") makeover(c, modTop, local, beat, f, d, assets);
        else if (kind === "pair") pair(c, modTop, local, beat, f, d, assets);
        else if (kind === "cast") cast(c, modTop, local, beat, d, assets);
        else number(c, modTop, local, beat, f, d, assets);
    };
    // On 9:16 the page follows the reader's eye down to the newest row of the log.
    const probe = moduleReach(kind, modTop, local, beat, f);
    const shift = readShift(st, sp, Math.max(0, probe - (st.safe.bottom - st.safe.top) / sp.s + 40), probe);
    const smooth = shift * easeInOut(clamp01((local - beat * 2) / (beat * 2)));
    drawSpread(ctx, st, sp, d, assets, {
        left: (c) => opener(c, local, span, f, d, assets),
        right: (c) => {
            kicker(c, say(d, f.kicker), MARGIN, 90, w, fonts.display, d.palette.ink, clamp01(local / 0.3));
            const hk = easeOutBack(clamp01(local / 0.28), 1.8);
            c.save();
            c.translate(MARGIN, headTop + head.height / 2);
            c.scale(1.15 - 0.15 * hk, 1.15 - 0.15 * hk);
            c.translate(-MARGIN, -(headTop + head.height / 2));
            c.globalAlpha = clamp01(local / 0.1);
            drawBlock(c, head, MARGIN, headTop, headStyle(fonts.body, INK));
            c.restore();
            drawBlock(c, deck, MARGIN, deckTop, deckStyle(fonts.body), {
                reveal: clamp01((local - beat) / (beat * 2)),
            });
            paintModule(c);
        },
        folio: folioOf(d, "m_feature"),
        section: d.print?.labels?.coverStory ?? "",
        cam: featureCamera(st, sp, local, span, smooth),
    });
    grain(ctx, st, local, 0.05);
    flashOverlay(ctx, st, flashAt(local, 0) * 0.25);
}

/** Where the module's newest landed row ends, without drawing it. */
function moduleReach(kind: FeatureArt, top: number, local: number, beat: number, f: FeatureData): number {
    if (kind !== "log") return Math.min(PAGE_H - 120, top + 700);
    const room = PAGE_H - 120 - top - LOG_TOP_GAP;
    const { shown, rowH } = logRows(f.reel.length, room, 84, 112);
    const n = shown + (f.reel.length > shown ? 1 : 0);
    const step = Math.min(beat, (beat * 10) / Math.max(1, n));
    const landed = clamp01((local - beat * 2) / (step * Math.max(1, n - 1) + 0.01));
    return top + LOG_TOP_GAP + rowH * Math.max(1, Math.ceil(landed * n));
}
