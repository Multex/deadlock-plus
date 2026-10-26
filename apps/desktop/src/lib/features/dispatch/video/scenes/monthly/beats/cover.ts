import { flashAt } from "../../../kit/beat";
import { feathered } from "../../../kit/bitmap";
import { clamp01, easeInOut, easeOutBack, easeOutCubic, lerp } from "../../../kit/ease";
import { shake } from "../../../kit/motion";
import { setFont, type TextStyle } from "../../../kit/text";
import type { Ctx, Rect } from "../../../kit/types";
import type { SceneAssets, SceneSize } from "../../../scene";
import { coverMoments } from "../data";
import {
    BODY_PX,
    drawBlock,
    drawCover,
    fitBlock,
    flashOverlay,
    grain,
    HEADLINE_PX,
    image,
    imageKeys,
    say,
    stage,
    studioSet,
    tint,
    vignette,
    withCamera,
    type MonthlyDraw,
    type Stage,
} from "./studio";

/** Seconds since each part of the cover landed; negative = not yet. */
export interface CoverClock {
    masthead: number;
    lines: number[];
    title: number;
    /** 0-1 position of the light sweep across the laminate; outside that it is off. */
    glare: number;
}

export const LANDED: CoverClock = { masthead: 9, lines: Array(8).fill(9), title: 9, glare: -1 };

/** Where the cover's parts sit on its page, as fractions of the page; a 9:16 page keeps its words in the safe band. */
export function coverSpots(ratio: number) {
    const tall = ratio > 1.6;
    return tall
        ? { mastTop: 0.128, mastH: 0.135, top: 0.105, lines: 0.32, linesW: 0.5, starTop: 0.17, title: 0.705 }
        : { mastTop: 0.045, mastH: 0.19, top: 0.012, lines: 0.27, linesW: 0.52, starTop: 0.13, title: 0.95 };
}

function fallbackBars(seed: string): number[] {
    let h = 7;
    for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return Array.from({ length: 38 }, (_, i) => 1 + ((h >> (i % 24)) & 3) * (i % 2 === 0 ? 1 : 0.8));
}

/**
 * The issue's cover in `r`, as the print cover lays it out: backdrop collage, the masthead with the star in front
 * of it, coverlines down the left, the title at the foot, barcode, gloss. `floor` is the stage's `u` for the
 * phone-size floors, or 0 when the cover is only an object in the frame.
 */
export function paintCover(
    ctx: Ctx,
    r: Rect,
    d: MonthlyDraw,
    assets: SceneAssets,
    clock: CoverClock,
    floor: number,
    t = 0,
): void {
    const cover = d.video.beats.m_cover;
    const pal = d.palette;
    const fonts = assets.fonts;
    const s = r.w / 1080;
    const sp = coverSpots(r.h / r.w);
    const px = (v: number, min = 0) => Math.max(v * s, min * floor);

    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.fillStyle = pal.bg;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    const glow = ctx.createRadialGradient(
        r.x + r.w * 0.64,
        r.y + r.h * 0.5,
        0,
        r.x + r.w * 0.64,
        r.y + r.h * 0.5,
        r.w * 0.8,
    );
    glow.addColorStop(0, pal.glow);
    glow.addColorStop(1, tint(pal.glow, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    const backdrop = image(assets, imageKeys.backdrop);
    if (backdrop) {
        ctx.save();
        ctx.globalAlpha = 0.85;
        drawCover(ctx, backdrop, r, 0.86 - 0.03 * Math.sin(t * 0.3), 0.3, 1.05);
        ctx.restore();
    }

    const print = d.print;
    const topPx = px(30, 44);
    setFont(ctx, { family: fonts.display, weight: 700, px: topPx, track: 0.14 } as TextStyle, topPx);
    ctx.textBaseline = "top";
    ctx.fillStyle = pal.accent;
    ctx.textAlign = "left";
    ctx.shadowColor = "rgb(0 0 0 / 0.3)";
    ctx.shadowBlur = 8 * s;
    const brand = (print?.brand ?? "Deadlock+").toUpperCase();
    ctx.fillText(brand, r.x + 34 * s, r.y + r.h * sp.top - topPx * 1.3);
    if (print?.issueLine) {
        ctx.fillStyle = pal.fg;
        ctx.textAlign = "right";
        const room = r.w - 68 * s - ctx.measureText(brand).width - 30 * s;
        ctx.fillText(
            print.issueLine.toUpperCase(),
            r.x + r.w - 34 * s,
            r.y + r.h * sp.top - topPx * 1.3,
            Math.max(10, room),
        );
    }
    ctx.shadowColor = "transparent";

    if (clock.masthead >= 0) {
        const k = easeOutBack(clamp01(clock.masthead / 0.24), 2.2);
        const word = (print?.masthead ?? "Dispatch").toUpperCase();
        const want = r.h * sp.mastH;
        ctx.save();
        setFont(ctx, { family: fonts.body, weight: 600, px: want, track: -0.035 } as TextStyle, want);
        const mw = ctx.measureText(word).width;
        const size = Math.min(want * 1.3, (want * r.w * 0.95) / mw);
        setFont(ctx, { family: fonts.body, weight: 600, px: size, track: -0.035 } as TextStyle, size);
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h * sp.mastTop + size * 0.42;
        ctx.translate(cx, cy);
        ctx.scale(1.7 - 0.7 * k, 1.7 - 0.7 * k);
        ctx.globalAlpha = clamp01(clock.masthead / 0.1);
        ctx.fillStyle = pal.fg;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgb(0 0 0 / 0.25)";
        ctx.shadowBlur = 24 * s;
        ctx.shadowOffsetY = 4 * s;
        ctx.fillText(word, 0, size * 0.04);
        ctx.restore();
    }

    // The star stands in front of the masthead: the classic cover overlap.
    const id = cover.heroId;
    const art = id === null ? undefined : (image(assets, imageKeys.gloat(id)) ?? image(assets, imageKeys.hero(id)));
    if (art) {
        const aw = r.w * (r.h / r.w > 1.6 ? 1.05 : 0.86);
        const ah = (aw * art.height) / art.width;
        const breathe = 1 + 0.012 * Math.sin(t * 1.4);
        ctx.save();
        ctx.translate(r.x + r.w * 0.6, r.y + r.h * sp.starTop + ah);
        ctx.scale(breathe, breathe);
        ctx.shadowColor = "rgb(0 0 0 / 0.4)";
        ctx.shadowBlur = 40 * s;
        ctx.shadowOffsetY = 20 * s;
        ctx.drawImage(feathered(art), -aw / 2, -ah, aw, ah);
        ctx.restore();
    }

    const scrim = ctx.createLinearGradient(0, r.y + r.h * 0.55, 0, r.y + r.h);
    scrim.addColorStop(0, tint(pal.bg, 0));
    scrim.addColorStop(0.55, tint(pal.bg, 0.8));
    scrim.addColorStop(1, pal.bg);
    ctx.fillStyle = scrim;
    ctx.fillRect(r.x, r.y + r.h * 0.55, r.w, r.h * 0.45);
    const side = ctx.createLinearGradient(r.x, 0, r.x + r.w * 0.55, 0);
    side.addColorStop(0, tint(pal.bg, 0.78));
    side.addColorStop(1, tint(pal.bg, 0));
    ctx.fillStyle = side;
    ctx.fillRect(r.x, r.y, r.w * 0.55, r.h);

    const lineStyle = { family: fonts.display, weight: 700, fill: pal.fg };
    let y = r.y + r.h * sp.lines;
    const lineW = r.w * sp.linesW;
    cover.lines.forEach((l, i) => {
        const since = clock.lines[i] ?? -1;
        const b = fitBlock(
            ctx,
            say(d, l.copy).toUpperCase(),
            lineStyle,
            { px: px(62, BODY_PX), floor: BODY_PX * floor || px(30), maxW: lineW, maxLines: 3 },
            1.0,
        );
        if (since >= 0) {
            const k = easeOutBack(clamp01(since / 0.22), 2);
            const x = r.x + 34 * s - (1 - clamp01(since / 0.16)) * r.w * 0.25;
            ctx.save();
            ctx.globalAlpha = clamp01(since / 0.08);
            ctx.fillStyle = pal.accent;
            ctx.fillRect(x, y, Math.min(lineW, 90 * s) * k, Math.max(5 * s, 4 * floor));
            withCamera(ctx, { ox: x, oy: y, zoom: 1.25 - 0.25 * k }, () =>
                drawBlock(ctx, b, x, y + 14 * s, lineStyle, { shadow: "rgb(0 0 0 / 0.45)" }),
            );
            ctx.restore();
        }
        y += b.height + 14 * s + px(34, 14);
    });

    const titleStyle = { family: fonts.display, weight: 700, fill: pal.accent };
    if (clock.title >= 0) {
        const tb = fitBlock(
            ctx,
            say(d, cover.title).toUpperCase(),
            titleStyle,
            {
                px: px(150, HEADLINE_PX),
                floor: HEADLINE_PX * floor || px(70),
                maxW: r.w - 68 * s - (r.h / r.w > 1.6 ? 0 : 200 * s),
                maxLines: 2,
            },
            0.95,
        );
        const k = easeOutBack(clamp01(clock.title / 0.25), 2);
        const top = r.y + r.h * sp.title - tb.height;
        withCamera(ctx, { ox: r.x + 34 * s, oy: top + tb.height, zoom: 1.4 - 0.4 * k }, () => {
            ctx.globalAlpha = clamp01(clock.title / 0.1);
            drawBlock(ctx, tb, r.x + 34 * s, top, titleStyle, { shadow: "rgb(0 0 0 / 0.45)" });
            ctx.globalAlpha = 1;
        });
    }

    const bars = print?.barcode.bars ?? fallbackBars(d.video.beats.m_stand.serial);
    const bw = 150 * s;
    const bh = 96 * s;
    const bx = r.x + r.w - bw - 30 * s;
    const by = r.y + r.h - bh - 30 * s;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(bx, by, bw, bh);
    const total = bars.reduce((a, b) => a + b, 0);
    let x = bx + 10 * s;
    bars.forEach((w, i) => {
        const ww = (w / total) * (bw - 20 * s);
        if (i % 2 === 0) {
            ctx.fillStyle = "#111";
            ctx.fillRect(x, by + 8 * s, ww, bh * 0.58);
        }
        x += ww;
    });
    ctx.fillStyle = "#111";
    ctx.font = `600 ${14 * s}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(print?.barcode.digits ?? d.video.beats.m_stand.serial, bx + bw / 2, by + bh - 12 * s);

    const gloss = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    gloss.addColorStop(0, "rgb(255 255 255 / 0.2)");
    gloss.addColorStop(0.2, "rgb(255 255 255 / 0.04)");
    gloss.addColorStop(0.35, "rgb(255 255 255 / 0)");
    gloss.addColorStop(0.85, "rgb(255 255 255 / 0)");
    gloss.addColorStop(1, "rgb(255 255 255 / 0.12)");
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = gloss;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    if (clock.glare >= 0 && clock.glare <= 1) {
        const gx = r.x - r.w * 0.6 + clock.glare * r.w * 2.2;
        const sweep = ctx.createLinearGradient(gx, r.y, gx + r.w * 0.5, r.y + r.h * 0.3);
        sweep.addColorStop(0, "rgb(255 255 255 / 0)");
        sweep.addColorStop(0.5, "rgb(255 255 255 / 0.55)");
        sweep.addColorStop(1, "rgb(255 255 255 / 0)");
        ctx.fillStyle = sweep;
        ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.restore();
}

/** The cover's page in the frame: full bleed on 9:16, a 3:4 page elsewhere. */
export function coverPage(st: Stage): Rect {
    if (st.aspect === "tall") return { x: 0, y: 0, w: st.w, h: st.h };
    const h = st.h * 0.92;
    const w = h * 0.75;
    return { x: (st.w - w) / 2, y: (st.h - h) / 2, w, h };
}

/** The cover assembles: the shot flashes, the masthead slams, the coverlines and the title land, the light sweeps. */
export function draw(
    ctx: Ctx,
    local: number,
    span: number,
    size: SceneSize,
    d: MonthlyDraw,
    assets: SceneAssets,
): void {
    const st = stage(size);
    const bar = assets.timing.barSeconds;
    const n = d.video.beats.m_cover.lines.length;
    const m = coverMoments({ id: "m_cover", kind: "monthly", bar: 0, bars: span / bar, presents: [] }, n, bar);
    const titleAt = (m.lines[n - 1] ?? m.masthead) + bar / 2;
    const clock: CoverClock = {
        masthead: local - m.masthead,
        lines: m.lines.map((x) => local - x),
        title: local - titleAt,
        glare: (local - (titleAt + bar * 0.5)) / (bar * 0.9),
    };
    const page = coverPage(st);
    const pull = easeInOut((local - (span - bar * 0.9)) / (bar * 0.8));
    const hits = [m.masthead, ...m.lines, titleAt];
    const last = Math.max(-9, ...hits.filter((x) => x <= local));
    const [sx, sy] = shake(local - last, 14 * st.u * clamp01(1 - (local - last) / 0.25), 2);

    withCamera(ctx, { ox: st.w / 2, oy: st.h / 2, zoom: 1.02 }, () =>
        studioSet(ctx, st, d.palette, {
            backdrop: image(assets, imageKeys.backdrop),
            light: 0.6,
            art: 0.4,
            drift: local / span,
        }),
    );
    ctx.fillStyle = `rgb(0 0 0 / ${st.aspect === "tall" ? 0.6 * pull : 0.45})`;
    ctx.fillRect(0, 0, st.w, st.h);

    const zoom = lerp(1.04 - 0.04 * easeOutCubic(local / (span * 0.6)), st.aspect === "tall" ? 0.8 : 0.9, pull);
    withCamera(
        ctx,
        { ox: page.x + page.w / 2, oy: page.y + page.h / 2, zoom, dx: sx, dy: sy, rot: -0.03 * pull },
        () => {
            ctx.save();
            ctx.shadowColor = "rgb(0 0 0 / 0.6)";
            ctx.shadowBlur = 60 * st.u;
            ctx.shadowOffsetY = 24 * st.u;
            ctx.fillStyle = d.palette.bg;
            ctx.fillRect(page.x, page.y, page.w, page.h);
            ctx.restore();
            paintCover(ctx, page, d, assets, clock, st.u, local);
        },
    );
    if (st.aspect !== "tall") vignette(ctx, st, 0.4);
    grain(ctx, st, local, 0.06);
    flashOverlay(ctx, st, flashAt(local, m.shutter));
    // A pop of the photographer's flash on every coverline: the shoot is still going.
    const pop = Math.max(0, ...m.lines.map((x) => flashAt(local, x) * 0.18));
    flashOverlay(ctx, st, pop);
}
