import { feathered } from "../../../kit/bitmap";
import { clamp01, easeInOut, easeOutBack, easeOutCubic, lerp } from "../../../kit/ease";
import { setFont, type TextStyle } from "../../../kit/text";
import type { Bitmap, Ctx, Rect } from "../../../kit/types";
import type { SceneAssets, SceneSize } from "../../../scene";
import {
    BODY_PX,
    drawBlock,
    drawCover,
    fitBlock,
    formatNumber,
    grain,
    HEADLINE_PX,
    image,
    imageKeys,
    mix,
    PENCIL,
    say,
    stage,
    stamp,
    studioSet,
    vignette,
    withCamera,
    type MonthlyDraw,
    type Stage,
} from "./studio";

/**
 * Swatch widths along a rail `avail` long with `gap` between them: each at least `minW` (less when the rail is
 * too short for that), the rest shared out by `shares`.
 */
export function railWidths(shares: number[], avail: number, minW: number, gap: number): number[] {
    const n = shares.length;
    if (n === 0) return [];
    const room = Math.max(0, avail - gap * (n - 1));
    const floor = Math.min(minW, room / n);
    const spare = room - floor * n;
    const total = shares.reduce((a, b) => a + Math.max(0, b), 0);
    return shares.map((s) => floor + (total > 0 ? (spare * Math.max(0, s)) / total : spare / n));
}

export interface WardrobeLayout {
    title: Rect;
    railY: number;
    rail: { x0: number; x1: number };
    /** How far the fabric hangs below the hanger. */
    drop: number;
    caption: Rect;
    /** Where the pulled garment hangs once it is out in front. */
    front: Rect;
}

export function wardrobeLayout(st: Stage, titleH: number, capH: number): WardrobeLayout {
    const { u, m, w, h, safe } = st;
    const top = st.aspect === "tall" ? safe.top + 16 * u : m * 0.8;
    const bottom = st.aspect === "tall" ? safe.bottom : h - m * 0.8;
    const railY = top + titleH + 60 * u;
    const capY = bottom - capH;
    const drop = Math.max(260 * u, capY - railY - 120 * u);
    const fw = st.aspect === "wide" ? w * 0.3 : w * 0.56;
    const fh = Math.min(drop * 1.05, capY - railY - 40 * u);
    return {
        title: { x: m, y: top, w: w - 2 * m, h: titleH },
        railY,
        rail: { x0: m * 0.6, x1: w - m * 0.6 },
        drop,
        caption: { x: m, y: capY, w: w - 2 * m, h: capH },
        front: { x: (w - fw) / 2, y: railY - 30 * u, w: fw, h: fh },
    };
}

/** A garment hung `local` seconds after the rail stopped at `stop`: a swing that dies away. */
function swing(local: number, stop: number, i: number): number {
    const k = local - stop;
    if (k < 0) return 0.16 * Math.sin(local * 9 + i);
    return (
        0.16 * Math.exp(-k * 2.6) * Math.cos(k * (7.5 + i * 0.6) + i * 0.3) + 0.012 * Math.sin(local * 1.7 + i * 1.3)
    );
}

function heroColour(d: MonthlyDraw, id: number, i: number): string {
    const c = d.heroes?.[id]?.colour;
    if (c) return c;
    return mix(d.palette.accent, i % 2 ? "#3a3f55" : "#7a5a3a", 0.35 + (i % 3) * 0.15);
}

/** Fabric: the colour, folds as soft vertical bands, a scalloped hem, and the hero printed across it. */
function fabric(
    ctx: Ctx,
    r: Rect,
    colour: string,
    art: Bitmap | undefined,
    u: number,
    seed: number,
    print: number,
): void {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(r.x + r.w * 0.08, r.y);
    ctx.lineTo(r.x + r.w * 0.92, r.y);
    ctx.lineTo(r.x + r.w, r.y + r.h * 0.12);
    const folds = Math.max(2, Math.round(r.w / (70 * u)));
    for (let i = folds; i >= 0; i--) {
        const x = r.x + (r.w * i) / folds;
        const dip = (i % 2 ? 1 : -1) * 14 * u * (0.6 + 0.4 * Math.sin(seed + i));
        ctx.lineTo(x, r.y + r.h + dip);
    }
    ctx.lineTo(r.x, r.y + r.h * 0.12);
    ctx.closePath();
    ctx.shadowColor = "rgb(0 0 0 / 0.55)";
    ctx.shadowBlur = 30 * u;
    ctx.shadowOffsetY = 16 * u;
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.clip();
    if (art && print > 0) {
        ctx.globalAlpha = print;
        ctx.globalCompositeOperation = "luminosity";
        drawCover(ctx, art, { x: r.x, y: r.y + r.h * 0.08, w: r.w, h: r.h * 0.92 }, 0.5, 0.12);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.fillStyle = mix(colour, colour, 0, 0.35);
        ctx.fillRect(r.x, r.y, r.w, r.h + 20 * u);
    }
    const g = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
    for (let i = 0; i <= folds * 2; i++) {
        const k = i / (folds * 2);
        g.addColorStop(k, i % 2 ? "rgb(255 255 255 / 0.13)" : "rgb(0 0 0 / 0.3)");
    }
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, r.h + 20 * u);
    const top = ctx.createLinearGradient(0, r.y, 0, r.y + r.h * 0.25);
    top.addColorStop(0, "rgb(0 0 0 / 0.35)");
    top.addColorStop(1, "rgb(0 0 0 / 0)");
    ctx.fillStyle = top;
    ctx.fillRect(r.x, r.y, r.w, r.h * 0.25);
    ctx.restore();
}

function hanger(ctx: Ctx, cx: number, railY: number, top: number, halfW: number, u: number): void {
    ctx.save();
    ctx.strokeStyle = "#cfd3d8";
    ctx.lineWidth = 5 * u;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, railY + 2 * u, 14 * u, Math.PI * 1.05, Math.PI * 2.2);
    ctx.moveTo(cx + 13 * u, railY + 8 * u);
    ctx.lineTo(cx, top - 26 * u);
    ctx.moveTo(cx, top - 26 * u);
    ctx.lineTo(cx - halfW, top + 4 * u);
    ctx.lineTo(cx + halfW, top + 4 * u);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
}

/** The count printed down the garment's edge with the hero's name: the size label. */
function label(ctx: Ctx, r: Rect, name: string, games: string, family: string, u: number): void {
    const px = Math.max(BODY_PX * u, Math.min(64 * u, r.w * 0.34));
    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + r.h * 0.2);
    ctx.shadowColor = "rgb(0 0 0 / 0.65)";
    ctx.shadowBlur = 14 * u;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffffff";
    setFont(ctx, { family, weight: 700, px: px * 1.5 } as TextStyle, px * 1.5);
    ctx.fillText(games, 0, 0);
    ctx.rotate(-Math.PI / 2);
    setFont(ctx, { family, weight: 700, px, track: 0.04 } as TextStyle, px);
    let size = px;
    const room = r.h * 0.6;
    const w = ctx.measureText(name.toUpperCase()).width;
    if (w > room) size = Math.max(BODY_PX * u, (px * room) / w);
    setFont(ctx, { family, weight: 700, px: size, track: 0.04 } as TextStyle, size);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(name.toUpperCase(), -px * 1.9, 0);
    ctx.restore();
}

export function draw(
    ctx: Ctx,
    local: number,
    span: number,
    size: SceneSize,
    d: MonthlyDraw,
    assets: SceneAssets,
): void {
    const data = d.video.beats.m_wardrobe;
    if (!data) return;
    const st = stage(size);
    const u = st.u;
    const bar = assets.timing.barSeconds;
    const fonts = assets.fonts;

    const titleStyle = { family: fonts.display, weight: 700, fill: d.palette.fg };
    const title = fitBlock(ctx, say(d, data.title), titleStyle, {
        px: 120 * u,
        floor: HEADLINE_PX * u,
        maxW: st.w - 2 * st.m,
        maxLines: 1,
    });
    const capStyle = { family: fonts.display, weight: 700, fill: "#ffffff" };
    const cap = fitBlock(ctx, say(d, data.caption), capStyle, {
        px: 76 * u,
        floor: BODY_PX * u,
        maxW: st.w - 2 * st.m,
        maxLines: 2,
    });
    const lay = wardrobeLayout(st, title.height, cap.height);

    const slide = Math.min(0.75, bar * 0.5);
    const pull = Math.min(span * 0.42, bar * 1.25);
    const pullK = easeInOut((local - pull) / (bar * 0.45));
    const cam = { ox: st.w / 2, oy: lay.railY + lay.drop / 2, zoom: 1 + 0.04 * (local / span) };

    withCamera(ctx, cam, () => {
        studioSet(ctx, st, d.palette, {
            backdrop: image(assets, imageKeys.backdrop),
            light: 0.7,
            art: 0.3,
            drift: local / span,
        });
        ctx.fillStyle = "rgb(0 0 0 / 0.25)";
        ctx.fillRect(0, 0, st.w, st.h);
    });

    const sw = data.swatches;
    const widths = railWidths(
        sw.map((s) => s.share),
        lay.rail.x1 - lay.rail.x0 - 40 * u,
        (st.aspect === "tall" ? 120 : 140) * u,
        18 * u,
    );
    const slideX = (1 - easeOutCubic(local / slide)) * st.w * 0.9;
    const hangTop = lay.railY + 60 * u;

    withCamera(ctx, cam, () => {
        ctx.save();
        const rail = ctx.createLinearGradient(0, lay.railY - 9 * u, 0, lay.railY + 9 * u);
        rail.addColorStop(0, "#f5f7fa");
        rail.addColorStop(0.5, "#8b9097");
        rail.addColorStop(1, "#3b3f45");
        ctx.fillStyle = rail;
        ctx.shadowColor = "rgb(0 0 0 / 0.5)";
        ctx.shadowBlur = 16 * u;
        ctx.shadowOffsetY = 8 * u;
        ctx.fillRect(
            lay.rail.x0 - 200 * u + slideX * 0.3,
            lay.railY - 9 * u,
            lay.rail.x1 - lay.rail.x0 + 400 * u,
            18 * u,
        );
        ctx.restore();

        let x = lay.rail.x0 + 20 * u + slideX;
        sw.forEach((s, i) => {
            const wdt = widths[i]!;
            const isLead = s.heroId === data.lead;
            const cx = x + wdt / 2;
            x += wdt + 18 * u;
            if (isLead && pullK > 0.98) return;
            const len = lay.drop * (0.86 + (0.14 * ((i * 37) % 7)) / 6);
            const r = { x: cx - wdt / 2, y: hangTop, w: wdt, h: len };
            ctx.save();
            ctx.translate(cx, lay.railY);
            ctx.rotate(swing(local, slide, i));
            ctx.translate(-cx, -lay.railY);
            if (isLead) ctx.globalAlpha = 1 - pullK;
            hanger(ctx, cx, lay.railY, hangTop, wdt * 0.42, u);
            fabric(ctx, r, heroColour(d, s.heroId, i), image(assets, imageKeys.hero(s.heroId)), u, i * 1.7, 0.55);
            label(ctx, r, d.heroes?.[s.heroId]?.name ?? "", formatNumber(d, s.games.value), fonts.display, u);
            if (s.debut && data.debutTag) {
                stamp(
                    ctx,
                    say(d, data.debutTag),
                    cx,
                    r.y + r.h * 0.82,
                    {
                        family: fonts.display,
                        px: BODY_PX * u,
                        colour: PENCIL,
                        rot: -0.2,
                        maxW: Math.max(wdt * 1.4, 160 * u),
                    },
                    local - (slide + 0.15 + i * 0.12),
                );
            }
            ctx.restore();
        });
    });

    if (pullK > 0) {
        ctx.save();
        ctx.fillStyle = `rgb(0 0 0 / ${0.55 * pullK})`;
        ctx.fillRect(0, 0, st.w, st.h);
        ctx.restore();
        const idx = Math.max(
            0,
            sw.findIndex((s) => s.heroId === data.lead),
        );
        const lead = sw[idx]!;
        const fx = lay.rail.x0 + 20 * u + widths.slice(0, idx).reduce((a, b) => a + b + 18 * u, 0);
        const f = { x: fx, y: hangTop, w: widths[idx]!, h: lay.drop };
        const r = {
            x: lerp(f.x, lay.front.x, pullK),
            y: lerp(f.y, lay.front.y + 40 * u, pullK),
            w: lerp(f.w, lay.front.w, pullK),
            h: lerp(f.h, lay.front.h, pullK),
        };
        const sway = Math.sin(local * 2.1) * 0.015 * pullK;
        withCamera(ctx, { ox: r.x + r.w / 2, oy: r.y, zoom: 1, rot: sway }, () => {
            hanger(ctx, r.x + r.w / 2, r.y - 60 * u, r.y, r.w * 0.42, u);
            const art = image(assets, imageKeys.gloat(lead.heroId)) ?? image(assets, imageKeys.hero(lead.heroId));
            fabric(ctx, r, heroColour(d, lead.heroId, idx), undefined, u, idx * 1.7, 0);
            if (art) {
                ctx.save();
                ctx.globalAlpha = pullK;
                const ar = { x: r.x + r.w * 0.04, y: r.y + r.h * 0.1, w: r.w * 0.92, h: r.h * 0.86 };
                ctx.beginPath();
                ctx.rect(ar.x, ar.y, ar.w, ar.h);
                ctx.clip();
                const c = Math.min(ar.w / art.width, ar.h / art.height) * 1.15;
                ctx.drawImage(
                    feathered(art),
                    ar.x + (ar.w - art.width * c) / 2,
                    ar.y + ar.h - art.height * c * 0.98,
                    art.width * c,
                    art.height * c,
                );
                ctx.restore();
            }
            label(
                ctx,
                { ...r, x: r.x + r.w * 0.36, w: r.w * 0.3 },
                "",
                formatNumber(d, lead.games.value),
                fonts.display,
                u,
            );
        });
        const tagK = easeOutBack(clamp01((local - pull - bar * 0.4) / 0.3));
        if (tagK > 0 && d.heroes?.[lead.heroId]) {
            const name = d.heroes[lead.heroId]!.name.toUpperCase();
            const px = 64 * u;
            ctx.save();
            setFont(ctx, { family: fonts.display, weight: 700, px, track: 0.06 } as TextStyle, px);
            const tw = Math.min(ctx.measureText(name).width + 50 * u, st.w - 2 * st.m);
            const tx = Math.min(r.x + r.w - 20 * u, st.w - st.m - tw);
            const ty = r.y + r.h * 0.12;
            ctx.translate(tx, ty);
            ctx.rotate(0.08);
            ctx.scale(tagK, tagK);
            ctx.fillStyle = "#f6f1e5";
            ctx.shadowColor = "rgb(0 0 0 / 0.5)";
            ctx.shadowBlur = 18 * u;
            ctx.fillRect(0, 0, tw, px * 1.5);
            ctx.shadowColor = "transparent";
            ctx.fillStyle = "#16130f";
            ctx.textBaseline = "middle";
            ctx.fillText(name, 25 * u, px * 0.78, tw - 50 * u);
            ctx.restore();
        }
    }

    vignette(ctx, st, 0.35);
    drawBlock(ctx, title, lay.title.x, lay.title.y, titleStyle, {
        reveal: clamp01(local / (bar * 0.3)) * 0.7 + 0.3,
        shadow: "rgb(0 0 0 / 0.5)",
    });
    const capK = clamp01((local - pull - bar * 0.2) / (bar * 0.35));
    if (capK > 0) {
        ctx.save();
        const g = ctx.createLinearGradient(0, lay.caption.y - 120 * u, 0, lay.caption.y + lay.caption.h + 40 * u);
        g.addColorStop(0, "rgb(0 0 0 / 0)");
        g.addColorStop(0.4, `rgb(0 0 0 / ${0.6 * capK})`);
        g.addColorStop(1, `rgb(0 0 0 / ${0.7 * capK})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, lay.caption.y - 120 * u, st.w, lay.caption.h + 160 * u);
        ctx.restore();
        drawBlock(ctx, cap, lay.caption.x, lay.caption.y, capStyle, { reveal: capK, shadow: "rgb(0 0 0 / 0.6)" });
    }
    grain(ctx, st, local, 0.07);
}
