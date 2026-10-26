import { flashAt } from "../../../kit/beat";
import { feathered } from "../../../kit/bitmap";
import { countUp } from "../../../kit/count";
import { clamp01, easeInOut, easeOutCubic, lerp } from "../../../kit/ease";
import { setFont, type TextStyle } from "../../../kit/text";
import type { Bitmap, Ctx, Rect } from "../../../kit/types";
import type { SceneAssets, SceneSize } from "../../../scene";
import type { ShotData } from "../data";
import {
    BODY_PX,
    coverRect,
    drawBlock,
    fitBlock,
    flashOverlay,
    formatNumber,
    grain,
    greasePencil,
    HEADLINE_PX,
    heroPhoto,
    image,
    imageKeys,
    mix,
    netWorthCopy,
    PENCIL,
    photoPrint,
    say,
    sheetLayout,
    stage,
    studioSet,
    vignette,
    withCamera,
    type MonthlyDraw,
    type Stage,
} from "./studio";
import { drawSheet, takesGeometry } from "./takes";

/** When each part of the shot lands, in seconds into the beat; the shutter is on the second bar line. */
export function shotTimes(bar: number, span: number) {
    const shutter = Math.min(bar, span * 0.4);
    const rest = span - shutter;
    return {
        pencil: [shutter * 0.08, shutter * 0.78] as const,
        shutter,
        blowUp: 0.35,
        stamp: shutter + rest * 0.1,
        kda: shutter + rest * 0.18,
        grade: shutter + rest * 0.32,
        worth: shutter + rest * 0.42,
        caption: shutter + rest * 0.52,
    };
}

export interface ShotLayout {
    /** The hero's cut-out. */
    art: Rect;
    stamp: { x: number; y: number };
    grade: { x: number; y: number; r: number };
    /** The stack of K/D/A, net worth and caption, laid from `text.y` down. */
    text: Rect;
}

export function shotLayout(st: Stage): ShotLayout {
    const { u, m, w, h, safe } = st;
    if (st.aspect === "wide") {
        const artH = h * 1.08;
        const artW = (artH * 280) / 380;
        return {
            art: { x: w * 0.27 - artW / 2, y: h * 0.02, w: artW, h: artH },
            stamp: { x: w * 0.53 + 200 * u, y: h * 0.17 },
            grade: { x: w * 0.46, y: h * 0.24, r: 110 * u },
            text: { x: w * 0.53, y: h * 0.34, w: w * 0.47 - m, h: h * 0.6 },
        };
    }
    const tall = st.aspect === "tall";
    const artW = (tall ? 980 : 860) * u;
    const artH = (artW * 380) / 280;
    const textH = (tall ? 360 : 380) * u;
    return {
        art: { x: (w - artW) / 2, y: safe.top + (tall ? 120 : 40) * u, w: artW, h: artH },
        stamp: { x: m + 230 * u, y: safe.top + 80 * u },
        grade: { x: w - m - 120 * u, y: safe.top + (tall ? 270 : 230) * u, r: 115 * u },
        text: { x: m, y: (tall ? safe.bottom - 10 * u : h - m) - textH, w: w - 2 * m, h: textH },
    };
}

/** The circled frame on the sheet, then the flash, then the frame blown up to a full photograph. */
export function draw(ctx: Ctx, local: number, span: number, size: SceneSize, d: MonthlyDraw, assets: SceneAssets): void {
    const data = d.video.beats.m_shot;
    if (!data) return;
    const st = stage(size);
    const times = shotTimes(assets.timing.barSeconds, span);
    if (local < times.shutter) circle(ctx, st, local, times, data, d, assets);
    else photo(ctx, st, local, times, data, d, assets);
    grain(ctx, st, local, 0.08);
    flashOverlay(ctx, st, flashAt(local, times.shutter));
}

function circle(ctx: Ctx, st: Stage, local: number, times: ReturnType<typeof shotTimes>, data: ShotData, d: MonthlyDraw, assets: SceneAssets): void {
    const takes = d.video.beats.m_takes;
    studioSet(ctx, st, d.palette, { backdrop: image(assets, imageKeys.backdrop), light: 0.55, art: 0.35 });
    ctx.fillStyle = "rgb(0 0 0 / 0.35)";
    ctx.fillRect(0, 0, st.w, st.h);
    const push = easeInOut(local / times.shutter);
    let target: Rect;
    let paint: () => void;
    if (takes && data.frame !== null) {
        const { sheet: area, cols } = takesGeometry(ctx, st, d, assets)!.lay;
        target = sheetLayout(takes.frames.length, area, cols).frames[data.frame]!;
        paint = () => drawSheet(ctx, st, d, assets, takes.frames, area, cols, { develop: () => 1, rot: -0.012, dy: 0 });
    } else {
        // No sheet to circle on: one loose print on the table.
        const pw = Math.min(st.w, st.h) * 0.55;
        target = { x: (st.w - pw) / 2, y: (st.h - pw / 1.5) / 2, w: pw, h: pw / 1.5 };
        paint = () =>
            photoPrint(ctx, target, (r) => heroPhoto(ctx, r, heroArt(assets, data.heroId), d.palette.glow, { fy: 0.12 }), {
                border: 16 * st.u,
                rot: -0.03,
                shadow: 30 * st.u,
            });
    }
    const tx = target.x + target.w / 2;
    const ty = target.y + target.h / 2;
    const zoom = lerp(1, Math.min(3, (st.w * 0.42) / target.w), push);
    const cam = { ox: tx, oy: ty, zoom, dx: (st.w / 2 - tx) * push, dy: (st.h * 0.45 - ty) * push };
    withCamera(ctx, cam, () => {
        paint();
        const k = (local - times.pencil[0]) / (times.pencil[1] - times.pencil[0]);
        greasePencil(ctx, tx, ty, target.w * 0.72, target.h * 0.82, data.heroId + 17, k, Math.max(4, target.w * 0.06));
    });
}

function heroArt(assets: SceneAssets, heroId: number): Bitmap | undefined {
    return image(assets, imageKeys.gloat(heroId)) ?? image(assets, imageKeys.hero(heroId));
}

function photo(ctx: Ctx, st: Stage, local: number, times: ReturnType<typeof shotTimes>, data: ShotData, d: MonthlyDraw, assets: SceneAssets): void {
    const u = st.u;
    const fonts = assets.fonts;
    const since = local - times.shutter;
    const lay = shotLayout(st);
    const blow = easeOutCubic(since / times.blowUp);
    const border = 34 * u;
    const scale = lerp(0.82, 1, blow);
    const full = { x: -border, y: -border, w: st.w + 2 * border, h: st.h + 2 * border };
    const cx = st.w / 2;
    const cy = st.h / 2;
    ctx.fillStyle = "#0b0a09";
    ctx.fillRect(0, 0, st.w, st.h);
    withCamera(ctx, { ox: cx, oy: cy, zoom: scale, rot: lerp(0.05, 0, blow) }, () =>
        photoPrint(
            ctx,
            full,
            () => {
                const backdrop = image(assets, imageKeys.heroBackdrop(data.heroId)) ?? image(assets, imageKeys.backdrop);
                studioSet(ctx, st, d.palette, { backdrop, light: 1, drift: since / 4, art: 0.8 });
                const art = heroArt(assets, data.heroId);
                const kb = 1.07 - 0.07 * easeOutCubic(since / 3);
                if (art) {
                    const r = lay.art;
                    const c = coverRect(art.width, art.height, r);
                    withCamera(ctx, { ox: r.x + r.w / 2, oy: r.y + r.h, zoom: kb }, () => {
                        ctx.save();
                        ctx.shadowColor = "rgb(0 0 0 / 0.55)";
                        ctx.shadowBlur = 60 * u;
                        ctx.shadowOffsetX = 24 * u;
                        ctx.drawImage(feathered(art), c.x, c.y, c.w, c.h);
                        ctx.restore();
                    });
                }
                scrim(ctx, st, lay);
                vignette(ctx, st, 0.45);
            },
            { border, shadow: 50 * u, sheen: clamp01(since / 1.2) },
        ),
    );

    stampLabel(ctx, st, say(d, data.label), lay, since - (times.stamp - times.shutter), fonts.display);
    if (data.grade) grade(ctx, st, data, lay, local - times.grade, d, fonts.display, assets.timing.barSeconds);

    const kdaStyle = { family: fonts.display, weight: 700, fill: "#ffffff" };
    const k = data.kda;
    const t0 = times.kda;
    const parts = [k.kills, k.deaths, k.assists].map((v) => formatNumber(d, countUp(v, local, t0, t0 + 0.6)));
    const kdaText = parts.join(" / ");
    const finalText = [k.kills, k.deaths, k.assists].map((v) => formatNumber(d, v)).join(" / ");
    const kda = fitBlock(ctx, finalText, kdaStyle, { px: 170 * u, floor: HEADLINE_PX * u, maxW: lay.text.w, maxLines: 1 });
    const kdaFit = { ...kda, lines: [kdaText] };

    const worthStyle = { family: fonts.body, weight: 600, fill: d.palette.accent };
    const worth = data.netWorth
        ? fitBlock(ctx, say(d, netWorthCopy(formatNumber(d, data.netWorth.value))), worthStyle, {
              px: 60 * u,
              floor: BODY_PX * u,
              maxW: lay.text.w,
              maxLines: 1,
          })
        : null;
    const capStyle = { family: fonts.body, weight: 600, fill: "#f4efe4" };
    const cap = fitBlock(ctx, say(d, data.caption), capStyle, {
        px: 52 * u,
        floor: BODY_PX * u,
        maxW: lay.text.w,
        maxLines: 2,
    });
    const gap = 14 * u;
    const total = kda.height + (worth ? worth.height + gap : 0) + gap + cap.height;
    let y = st.aspect === "wide" ? lay.text.y : lay.text.y + lay.text.h - total;
    const show = (at: number) => clamp01((local - at) / 0.35);
    if (local >= t0) drawBlock(ctx, kdaFit, lay.text.x, y, kdaStyle, { reveal: show(t0) });
    y += kda.height + gap;
    if (worth) {
        drawBlock(ctx, worth, lay.text.x, y, worthStyle, { reveal: show(times.worth) });
        y += worth.height + gap;
    }
    drawBlock(ctx, cap, lay.text.x, y, capStyle, { reveal: show(times.caption) });
}

/** Darkens behind the words so they read on any art. */
function scrim(ctx: Ctx, st: Stage, lay: ShotLayout): void {
    if (st.aspect === "wide") {
        const g = ctx.createLinearGradient(lay.text.x - 200 * st.u, 0, st.w, 0);
        g.addColorStop(0, "rgb(0 0 0 / 0)");
        g.addColorStop(0.35, "rgb(0 0 0 / 0.55)");
        g.addColorStop(1, "rgb(0 0 0 / 0.7)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, st.w, st.h);
        return;
    }
    const g = ctx.createLinearGradient(0, lay.text.y - 260 * st.u, 0, lay.text.y + lay.text.h);
    g.addColorStop(0, "rgb(0 0 0 / 0)");
    g.addColorStop(0.5, "rgb(0 0 0 / 0.6)");
    g.addColorStop(1, "rgb(0 0 0 / 0.78)");
    ctx.fillStyle = g;
    ctx.fillRect(0, lay.text.y - 260 * st.u, st.w, st.h);
}

function stampLabel(ctx: Ctx, st: Stage, label: string, lay: ShotLayout, k: number, family: string): void {
    if (k < 0) return;
    const e = clamp01(k / 0.14);
    const scale = 1.5 - 0.5 * e;
    const px = 84 * st.u;
    ctx.save();
    setFont(ctx, { family, weight: 700, px, track: 0.08 } as TextStyle, px);
    const maxW = st.aspect === "wide" ? st.w * 0.3 : st.w * 0.55;
    let w = ctx.measureText(label).width;
    let size = px;
    if (w > maxW) {
        size = Math.max(HEADLINE_PX * st.u * 0.75, (px * maxW) / w);
        setFont(ctx, { family, weight: 700, px: size, track: 0.08 } as TextStyle, size);
        w = ctx.measureText(label).width;
    }
    const pad = size * 0.35;
    const bw = w + 2 * pad;
    const bh = size * 1.35;
    const x = st.aspect === "wide" ? lay.text.x + bw / 2 : Math.max(st.m + bw / 2, lay.stamp.x);
    ctx.translate(x, lay.stamp.y);
    ctx.rotate(-0.06);
    ctx.scale(scale, scale);
    ctx.globalAlpha = Math.min(1, e * 1.4);
    ctx.fillStyle = PENCIL;
    ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    ctx.strokeStyle = "rgb(255 255 255 / 0.85)";
    ctx.lineWidth = size * 0.05;
    ctx.strokeRect(-bw / 2 + size * 0.12, -bh / 2 + size * 0.12, bw - size * 0.24, bh - size * 0.24);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, size * 0.04, size * 0.06);
    ctx.restore();
}

/** The grade as a teacher marks it: the letter, then the red circle drawn round it. */
function grade(ctx: Ctx, st: Stage, data: ShotData, lay: ShotLayout, k: number, d: MonthlyDraw, family: string, bar: number): void {
    if (k < 0) return;
    const { x, y, r } = lay.grade;
    const px = 190 * st.u;
    const e = easeOutCubic(k / 0.25);
    ctx.save();
    ctx.globalAlpha = e;
    setFont(ctx, { family, weight: 700, px } as TextStyle, px);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgb(0 0 0 / 0.5)";
    ctx.shadowBlur = 20 * st.u;
    ctx.fillStyle = mix(d.palette.accent, "#ffffff", 0.1);
    ctx.fillText(data.grade!, x, y + px * 0.05);
    ctx.restore();
    greasePencil(ctx, x, y, r, r * 0.86, data.heroId + 31, clamp01((k - 0.1) / (bar * 0.45)), 10 * st.u);
}
