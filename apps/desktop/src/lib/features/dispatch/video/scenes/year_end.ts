import { drawScraps, makeScraps, type Scrap } from "../../kinds/year_end/scraps";
import type { Scene, SceneAssets } from "../scene";
import { placeholderScene } from "./placeholder";
import { fillCount, presentSections, type YearEndVideo } from "./year_end/data";
import {
    INK,
    coverImage,
    containImage,
    dust,
    feathered,
    goldGradient,
    inkGoldGradient,
    lerp,
    paper,
    room,
    setFont,
    shake,
    sparks,
    text,
    tinted,
    type Ctx,
    type TextStyle,
} from "./year_end/draw";
import {
    clamp01,
    countUp,
    digitLocks,
    easeInOut,
    easeOutBack,
    easeOutCubic,
    flashAt,
    growth,
    rollingDigit,
    sceneFrame,
    yearEndPlan,
    type Rect,
    type SectionId,
    type YearEndPlan,
} from "./year_end/plan";

/** The cover is laid out in the live cover's own 600x900 px, then scaled. */
const COVER = { w: 600, h: 900 };
const SLAM = 0.2;

interface Prepared {
    plan: YearEndPlan;
    scraps: Scrap[];
    num: Intl.NumberFormat;
    pct: Intl.NumberFormat;
    bars: number[];
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
    v: YearEndVideo;
    p: Prepared;
    images: SceneAssets["images"];
    fonts: SceneAssets["fonts"];
}

const prepared = new WeakMap<SceneAssets, Prepared>();

function prepare(assets: SceneAssets, v: YearEndVideo): Prepared {
    let p = prepared.get(assets);
    if (!p) {
        let h = 2166136261;
        for (const c of `${v.cover.issue}${v.cover.player ?? ""}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
        p = {
            plan: yearEndPlan(assets.timing.bars, presentSections(v)),
            scraps: makeScraps(120, 2026),
            num: new Intl.NumberFormat(v.locale),
            pct: new Intl.NumberFormat(v.locale, { style: "percent", maximumFractionDigits: 0 }),
            bars: Array.from({ length: 34 }, (_, i) => 1 + (((h >>> (i % 29)) ^ i) & 3)),
        };
        prepared.set(assets, p);
    }
    return p;
}

const fallback = placeholderScene({ ground: INK.black, accent: INK.gold });

export const yearEndScene: Scene = (ctx, t, size, assets) => {
    const v = assets.data as YearEndVideo | undefined;
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
    const { plan } = f.p;
    const drop = at(f, plan.drop);
    if (t < drop) drawBuild(f);
    else if (t < at(f, plan.drop + 1)) drawUnfold(f);
    else if (t < at(f, plan.end.bar)) drawPoster(f);
    else drawEnd(f);

    if (t >= drop - 0.1) drawBurst(f, drop);
    const white = flashAt(t, drop);
    if (white > 0) {
        ctx.globalAlpha = white;
        ctx.fillStyle = "#fffaf0";
        ctx.fillRect(0, 0, size.w, size.h);
        ctx.globalAlpha = 1;
    }
};

const at = (f: F, bar: number, beat = 0) => (bar + beat / 4) * f.B;
const since = (f: F, s: number) => f.t - s;
const slamScale = (dt: number, from: number) => (dt < 0 ? from : lerp(from, 1, easeOutBack(dt / SLAM)));
const fadeIn = (dt: number, d = 0.08) => clamp01(dt / d);

/* ---------- The build: the cover in the dark ---------- */

interface CoverState {
    frame: number;
    mast: number;
    row: number;
    light: number;
    title: number;
    name: number;
    star: number;
    peel: number;
}

/** Where the cover sits on screen at its rest size, before the camera moves it. */
function coverRect(f: F, zoom = 1): { x: number; y: number; s: number } {
    const s = Math.min((f.box.h * 0.94) / COVER.h, (f.box.w * 0.92) / COVER.w) * zoom;
    const cx = f.box.x + f.box.w / 2;
    const cy = f.box.y + f.box.h / 2;
    return { x: cx - (COVER.w * s) / 2, y: cy - (COVER.h * s) / 2, s };
}

function buildCues(f: F) {
    const { intro } = f.p.plan;
    const mastEnd = intro.mast.bar + intro.mast.bars;
    const twoBars = intro.mast.bars >= 2;
    const frameFrom = twoBars ? at(f, mastEnd - 2) : intro.mast.bars === 1 ? at(f, mastEnd - 1) : -1;
    return {
        frame: [frameFrom, frameFrom + (twoBars ? 4 : 2) * f.b] as const,
        mast: twoBars ? at(f, mastEnd - 1) : at(f, mastEnd - 1, 2),
        row: twoBars ? at(f, mastEnd - 1, 2) : at(f, mastEnd - 1, 3),
        digits: at(f, intro.digits.bar),
        title: at(f, intro.title.bar),
        name: at(f, intro.name.bar),
        star: at(f, intro.name.bar, intro.name.bars >= 2 ? 4 : 2),
        riser: at(f, intro.riser.bar),
        riserBars: intro.riser.bars,
        drop: at(f, f.p.plan.drop),
    };
}

function drawBuild(f: F): void {
    const { ctx, t, u } = f;
    const cue = buildCues(f);
    const locks = digitLocks(f.p.plan, f.v.year.length, f.B);
    const locked = locks.filter((l) => t >= l).length;
    const lastLock = locked > 0 ? locks[locked - 1] : -Infinity;

    // The room comes up a step with each digit, and fully once the year is home.
    const light = t >= cue.title ? 1 : 0.3 + (0.55 * locked) / Math.max(1, locks.length);
    const riser = cue.riserBars > 0 ? clamp01((t - cue.riser) / (cue.drop - cue.riser)) : 0;
    const suck = clamp01((t - (cue.drop - f.b)) / f.b);
    room(f.ctx, f.w, f.h, light * (1 - suck * 0.7));
    dust(ctx, f.w, f.h, t, u, 0.5 + riser * 0.5, riser * 4);

    const state: CoverState = {
        frame: clamp01((t - cue.frame[0]) / (cue.frame[1] - cue.frame[0])),
        mast: clamp01((t - cue.mast) / (f.b * 1.5)),
        row: fadeIn(t - cue.row, 0.2),
        light: light * (1 - suck * 0.6),
        title: t - cue.title,
        name: t - cue.name,
        star: t - cue.star,
        peel: riser,
    };

    // The camera leans in through the riser, a kick on every beat, then pulls back before the drop.
    const beatIn = riser > 0 ? (t - cue.riser) % f.b : Infinity;
    const kick = riser > 0 ? Math.exp(-beatIn / 0.09) * 0.012 * (1 + riser * 2) : 0;
    const zoom = 1 + 0.08 * easeInOut(riser) * (1 - suck) - 0.05 * easeInOut(suck) + kick;
    const rect = coverRect(f, zoom);
    let [sx, sy] = shake(t - lastLock, 9 * u, locked);
    const [nx, ny] = shake(t - cue.name, 14 * u, 7);
    sx += nx;
    sy += ny;
    if (riser > 0 && suck === 0) {
        const r = (5 + 10 * riser) * u * Math.exp(-beatIn / 0.1);
        sx += r * Math.sin(t * 90);
        sy += r * Math.cos(t * 77);
    }
    const ox = rect.x + sx;
    const oy = rect.y + sy;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(rect.s, rect.s);
    drawCover(f, state);
    ctx.restore();

    drawYear(f, { x: ox, y: oy, s: rect.s }, cue, locks);

    // Each beat of the riser flashes a little brighter.
    if (riser > 0 && suck < 1) {
        ctx.globalAlpha = Math.exp(-beatIn / 0.08) * (0.06 + 0.22 * riser) * (1 - suck);
        ctx.fillStyle = "#fff3d6";
        ctx.fillRect(0, 0, f.w, f.h);
        ctx.globalAlpha = 1;
    }
}

function drawCover(f: F, st: CoverState): void {
    const { ctx, v, fonts } = f;
    ctx.fillStyle = INK.black;
    ctx.fillRect(0, 0, COVER.w, COVER.h);

    const starId = v.cover.star?.heroId;
    const backdrop = f.images.backdrop;
    const portrait = starId !== undefined ? f.images[`hero:${starId}`] : undefined;
    ctx.globalAlpha = st.light;
    if (backdrop) {
        coverImage(ctx, tinted(backdrop), 0, 90, COVER.w, COVER.h - 90, 0.8, 0.3);
    } else {
        const g = ctx.createRadialGradient(400, 430, 20, 400, 430, 420);
        g.addColorStop(0, "rgb(158 113 45 / 0.55)");
        g.addColorStop(1, "rgb(158 113 45 / 0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, COVER.w, COVER.h);
    }
    shade(ctx);
    if (portrait) {
        ctx.save();
        ctx.shadowColor = "rgb(0 0 0 / 0.65)";
        ctx.shadowBlur = 22;
        ctx.shadowOffsetY = 10;
        containImage(ctx, feathered(portrait), 238, 214, 322, 437);
        ctx.restore();
    }
    ctx.globalAlpha = 1;
    // Even fully lit, the dark keeps the cover's lower third readable under the type.
    if (st.light < 1) {
        ctx.globalAlpha = (1 - st.light) * 0.5;
        ctx.fillStyle = INK.room;
        ctx.fillRect(0, 0, COVER.w, COVER.h);
        ctx.globalAlpha = 1;
    }

    drawFrame(ctx, st.frame);

    if (st.mast > 0) {
        const name = v.cover.name.toLocaleUpperCase(v.locale);
        const shown = name.slice(0, Math.ceil(name.length * st.mast));
        const style: TextStyle = {
            family: fonts.display,
            weight: 700,
            px: 30,
            track: 0.3,
            fill: INK.gold,
            maxW: 520,
        };
        // Measured on the whole line so the letters type on in their final places.
        const px = textPx(ctx, name, style);
        text(ctx, shown, 300 - measure(ctx, name, { ...style, px }) / 2, 58, { ...style, px, maxW: undefined });
    }
    if (st.row > 0) {
        ctx.globalAlpha = st.row;
        ctx.fillStyle = INK.goldDeep;
        ctx.fillRect(40, 84, 520, 1.5);
        const row: TextStyle = { family: fonts.display, weight: 700, px: 14, track: 0.22, fill: INK.cream, maxW: 250 };
        text(ctx, v.cover.issue.toLocaleUpperCase(v.locale), 40, 104, row);
        text(ctx, v.cover.edition.toLocaleUpperCase(v.locale), 560, 104, { ...row, align: "right" });
        ctx.globalAlpha = 1;
    }

    if (st.title >= 0) drawTitleWords(f, st.title);
    if (st.name >= 0) {
        const name = (v.cover.player ?? v.cover.star?.line ?? "").toLocaleUpperCase(v.locale);
        const k = slamScale(st.name, 2.4);
        const glow = Math.exp(-st.name / 0.25);
        if (glow > 0.02) {
            const g = ctx.createRadialGradient(300, 726, 0, 300, 726, 260);
            g.addColorStop(0, `rgb(255 225 150 / ${0.55 * glow})`);
            g.addColorStop(1, "rgb(255 225 150 / 0)");
            ctx.fillStyle = g;
            ctx.fillRect(0, 560, COVER.w, 330);
        }
        ctx.save();
        ctx.globalAlpha = fadeIn(st.name, 0.05);
        ctx.translate(300, 726);
        ctx.scale(k, k);
        ctx.shadowColor = "rgb(0 0 0 / 0.8)";
        ctx.shadowBlur = 10;
        text(ctx, name, 0, 0, {
            family: fonts.display,
            weight: 700,
            px: 64,
            fill: goldGradient(ctx, 0, -32, 0, 32),
            align: "center",
            maxW: 520,
        });
        ctx.restore();
        sparks(ctx, 300, 726, st.name, 1, 41, 16);
    }
    if (st.star >= 0 && v.cover.player && v.cover.star) {
        ctx.globalAlpha = fadeIn(st.star, 0.2);
        text(ctx, v.cover.star.line.toLocaleUpperCase(v.locale), 300, 782 + 10 * (1 - easeOutCubic(st.star / 0.2)), {
            family: fonts.display,
            weight: 700,
            px: 18,
            track: 0.22,
            fill: INK.cream,
            align: "center",
            maxW: 320,
        });
        ctx.globalAlpha = 1;
    }
    if (st.star >= 0) {
        ctx.globalAlpha = fadeIn(st.star, 0.3);
        drawBarcode(f);
        ctx.globalAlpha = 1;
        drawPeel(f, st.peel, fadeIn(st.star, 0.3));
    }
}

/** The cover's own shading: dark top and foot for the type, dark left for the stats column. */
function shade(ctx: Ctx): void {
    const top = ctx.createLinearGradient(0, 0, 0, COVER.h);
    top.addColorStop(0, INK.black);
    top.addColorStop(0.13, INK.black);
    top.addColorStop(0.28, "rgb(13 11 7 / 0.5)");
    top.addColorStop(0.44, "rgb(13 11 7 / 0)");
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, COVER.w, COVER.h);
    const foot = ctx.createLinearGradient(0, COVER.h, 0, 0);
    foot.addColorStop(0, INK.black);
    foot.addColorStop(0.13, INK.black);
    foot.addColorStop(0.27, "rgb(13 11 7 / 0.86)");
    foot.addColorStop(0.5, "rgb(13 11 7 / 0)");
    ctx.fillStyle = foot;
    ctx.fillRect(0, 0, COVER.w, COVER.h);
}

/** The double gold rule, drawn round from the top-left corner as `p` goes 0 to 1. */
function drawFrame(ctx: Ctx, p: number): void {
    if (p <= 0) return;
    const rule = (inset: number, width: number, color: string) => {
        const x0 = inset;
        const y0 = inset;
        const x1 = COVER.w - inset;
        const y1 = COVER.h - inset;
        const sides = [
            [x0, y0, x1, y0],
            [x1, y0, x1, y1],
            [x1, y1, x0, y1],
            [x0, y1, x0, y0],
        ];
        const perim = 2 * (x1 - x0 + (y1 - y0));
        let left = perim * p;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        for (const [ax, ay, bx, by] of sides) {
            const len = Math.hypot(bx - ax, by - ay);
            const k = Math.min(1, left / len);
            ctx.lineTo(ax + (bx - ax) * k, ay + (by - ay) * k);
            left -= len;
            if (left <= 0) break;
        }
        ctx.stroke();
    };
    rule(17.5, 3, INK.gold);
    rule(24.5, 1, INK.goldDeep);
}

/** "Player of the Year", a word a beat over the title's first bar. */
function drawTitleWords(f: F, dt: number): void {
    const { ctx, v, fonts } = f;
    const style: TextStyle = { family: fonts.body, weight: 600, px: 50, italic: true, fill: INK.cream, maxW: 520 };
    const line = v.cover.title;
    const px = textPx(ctx, line, style);
    const words = line.split(" ");
    const titleBars = f.p.plan.intro.title.bars;
    const step = titleBars > 0 ? Math.min(f.b, (titleBars * 4 * f.b) / 2 / words.length) : 0;
    const full = measure(ctx, line, { ...style, px });
    let x = 300 - full / 2;
    words.forEach((word, i) => {
        const wdt = dt - i * step;
        const prefix = words.slice(0, i + 1).join(" ");
        const next = 300 - full / 2 + measure(ctx, prefix + " ", { ...style, px });
        if (wdt >= 0) {
            ctx.save();
            ctx.globalAlpha = fadeIn(wdt, 0.12);
            ctx.shadowColor = "rgb(0 0 0 / 0.9)";
            ctx.shadowBlur = 6;
            text(ctx, word, x, 652 + 22 * (1 - easeOutCubic(wdt / 0.18)), { ...style, px, maxW: undefined });
            ctx.restore();
        }
        x = next;
    });
}

function drawBarcode(f: F): void {
    const { ctx, p, v, fonts } = f;
    const total = p.bars.reduce((s, w, i) => s + w + ((i * 7) % 3) + 1, 0);
    ctx.fillStyle = INK.cream;
    ctx.fillRect(40, 820, total + 12, 44);
    ctx.fillStyle = INK.ink;
    let x = 46;
    p.bars.forEach((w, i) => {
        ctx.fillRect(x, 824, w, 36);
        x += w + ((i * 7) % 3) + 1;
    });
    text(ctx, v.cover.span.toLocaleUpperCase(v.locale), 40 + total + 26, 852, {
        family: fonts.display,
        weight: 700,
        px: 12,
        track: 0.12,
        fill: INK.gold,
        maxW: 600 - 170 - (40 + total + 26),
    });
}

/** The bottom-right corner folded back to show the poster inside; it lifts through the riser. */
function drawPeel(f: F, lift: number, alpha: number): void {
    const { ctx, v, fonts } = f;
    // Any bigger and the flap runs into the name and the star line.
    const size = 140 + 10 * easeInOut(lift);
    const x0 = COVER.w - size;
    const y0 = COVER.h - size;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(COVER.w, y0);
    ctx.lineTo(COVER.w, COVER.h);
    ctx.lineTo(x0, COVER.h);
    ctx.closePath();
    ctx.fillStyle = "#ece4d2";
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = "rgb(40 36 30 / 0.16)";
    for (let y = y0 + 9; y < COVER.h; y += 11) ctx.fillRect(x0, y, size, 2);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = "rgb(0 0 0 / 0.6)";
    // The flap lifts off the page through the riser: its shadow grows instead of the flap.
    ctx.shadowBlur = 7 + 14 * lift;
    ctx.shadowOffsetX = 5 + 9 * lift;
    ctx.shadowOffsetY = 5 + 9 * lift;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(COVER.w, y0);
    ctx.lineTo(x0, COVER.h);
    ctx.closePath();
    const g = ctx.createLinearGradient(COVER.w, y0, x0, COVER.h);
    g.addColorStop(0, "#ffeeb9");
    g.addColorStop(0.3, INK.gold);
    g.addColorStop(1, "#ad7b2f");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x0 + size * 0.36, y0 + size * 0.36);
    ctx.rotate(-Math.PI / 4);
    text(ctx, v.cover.flap.toLocaleUpperCase(v.locale), 0, 0, {
        family: fonts.display,
        weight: 700,
        px: 12,
        track: 0.12,
        fill: INK.ink,
        align: "center",
        maxW: size * 0.62,
    });
    ctx.restore();
}

/**
 * The year: huge in the dark while its digits lock one per step (the unlocked ones roll like a slot machine),
 * then flown home into the cover's masthead slot when the title starts.
 */
function drawYear(
    f: F,
    cover: { x: number; y: number; s: number },
    cue: ReturnType<typeof buildCues>,
    locks: number[],
): void {
    const { ctx, t, u, fonts } = f;
    const year = f.v.year;
    if (t < cue.digits - f.b) return;
    const base: TextStyle = { family: fonts.pulp, weight: 700, px: 100 };
    setFont(ctx, base);
    const widths = [...year].map((d) => ctx.measureText(d).width);
    const total = widths.reduce((a, b) => a + b, 0);
    const giantPx = Math.min(430 * u, (100 * f.box.w * 0.86) / total);
    const giant = { x: f.box.x + f.box.w / 2, y: f.box.y + f.box.h * 0.36, px: giantPx };
    const slot = { x: cover.x + 300 * cover.s, y: cover.y + 208 * cover.s, px: 178 * cover.s };
    const home = clamp01((t - cue.title) / f.b);
    const fly = easeInOut(home);
    const px = lerp(giant.px, slot.px, fly);
    const cx = lerp(giant.x, slot.x, fly);
    const cy = lerp(giant.y, slot.y, fly);
    const k = px / 100;
    const dim = clamp01((t - (cue.digits - f.b)) / f.b);

    setFont(ctx, base, px);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    let x = cx - (total * k) / 2;
    [...year].forEach((digit, i) => {
        const dw = widths[i] * k;
        const lock = locks[i];
        const dt = t - lock;
        if (dt < 0) {
            // Rolling: the strip of digits scrolls up through the slot.
            const roll = rollingDigit(i * 3 + 1, t, 1 / (f.b / 2));
            const h = px * 0.9;
            ctx.save();
            ctx.beginPath();
            ctx.rect(x - 4 * u, cy - h / 2, dw + 8 * u, h);
            ctx.clip();
            // Faint and smeared, so a rolling slot never reads as a wrong year.
            ctx.fillStyle = INK.goldDeep;
            const off = easeInOut(roll.frac) * h;
            for (const [smear, a] of [
                [0, 0.1],
                [0.08, 0.05],
                [-0.08, 0.05],
            ] as const) {
                ctx.globalAlpha = a * dim;
                ctx.fillText(String(roll.digit), x, cy - off + smear * h);
                ctx.fillText(String(roll.next), x, cy + h - off + smear * h);
            }
            ctx.restore();
        } else {
            const s = slamScale(dt, 1.7);
            ctx.save();
            ctx.translate(x + dw / 2, cy);
            ctx.scale(s, s);
            ctx.shadowColor = "rgb(0 0 0 / 0.6)";
            ctx.shadowBlur = 14 * u;
            ctx.shadowOffsetY = 6 * u;
            ctx.fillStyle = goldGradient(ctx, -dw * 0.1, -px / 2, dw * 0.1, px / 2);
            ctx.fillText(digit, -dw / 2, 0);
            ctx.restore();
            const glow = Math.exp(-dt / 0.18) * (1 - fly);
            if (glow > 0.02) {
                ctx.save();
                ctx.globalAlpha = glow * 0.8;
                ctx.globalCompositeOperation = "lighter";
                const g = ctx.createRadialGradient(x + dw / 2, cy, 0, x + dw / 2, cy, px * 0.8);
                g.addColorStop(0, "rgb(255 220 140 / 0.9)");
                g.addColorStop(1, "rgb(255 220 140 / 0)");
                ctx.fillStyle = g;
                ctx.fillRect(x - px, cy - px, dw + px * 2, px * 2);
                ctx.restore();
            }
            if (fly === 0) sparks(ctx, x + dw / 2, cy, dt, u, 13 + i, 14);
        }
        x += dw;
    });
    ctx.letterSpacing = "0px";
}

function measure(ctx: Ctx, str: string, s: TextStyle): number {
    setFont(ctx, s);
    const w = ctx.measureText(str).width;
    ctx.letterSpacing = "0px";
    return w;
}

function textPx(ctx: Ctx, str: string, s: TextStyle): number {
    const w = measure(ctx, str, s);
    return s.maxW && w > s.maxW ? (s.px * s.maxW) / w : s.px;
}

/* ---------- The drop: flash, burst, the cover swings open ---------- */

function drawBurst(f: F, drop: number): void {
    const dt = f.t - drop;
    if (dt < 0 || dt > 2.6) return;
    const alpha = clamp01((2.6 - dt) / 0.6);
    drawScraps(f.ctx as unknown as CanvasRenderingContext2D, f.p.scraps, {
        t: dt,
        stage: { width: f.w, height: f.h },
        scale: 1.9 * f.u,
        alpha,
        front: true,
    });
}

function drawUnfold(f: F): void {
    const { ctx, t, u, v, fonts } = f;
    const drop = at(f, f.p.plan.drop);
    const beats = (t - drop) / f.b;
    room(ctx, f.w, f.h, 1);
    dust(ctx, f.w, f.h, t, u, 1, 6);
    drawScraps(ctx as unknown as CanvasRenderingContext2D, f.p.scraps, {
        t: t - drop,
        stage: { width: f.w, height: f.h },
        scale: 1.9 * u,
        alpha: 1,
        front: false,
    });

    const rect = coverRect(f, 0.95);
    const pw = COVER.w * rect.s;
    const ph = COVER.h * rect.s;
    const right = easeInOut((beats - 0.15) / 1.5);
    const left = easeInOut((beats - 1.1) / 1.4);
    const spread = easeInOut((beats - 2.5) / 0.6);

    // The paper grows from the opened spread to the whole frame.
    const sx = lerp(rect.x - pw * left, 0, spread);
    const ex = lerp(rect.x + pw + pw * right, f.w, spread);
    const sy = lerp(rect.y, 0, spread);
    const ey = lerp(rect.y + ph, f.h, spread);
    paper(ctx, sx, sy, ex - sx, ey - sy);
    if (spread > 0) {
        ctx.globalAlpha = spread;
        drawBand(f, beats >= 3 ? t - at(f, f.p.plan.drop, 3) : -1);
        ctx.globalAlpha = 1;
    }
    if (spread >= 1) return;

    // Inside flap, hinged on its left edge, swings left.
    const phi = Math.PI * left;
    ctx.save();
    ctx.translate(rect.x, rect.y);
    ctx.scale(Math.cos(phi) * rect.s, rect.s);
    if (Math.cos(phi) >= 0) drawInside(f);
    else paper(ctx, 0, 0, COVER.w, COVER.h);
    ctx.fillStyle = `rgb(0 0 0 / ${0.5 * Math.sin(phi)})`;
    ctx.fillRect(0, 0, COVER.w, COVER.h);
    ctx.restore();

    // The cover, hinged on its right edge, swings right.
    const theta = Math.PI * right;
    ctx.save();
    ctx.translate(rect.x + pw, rect.y);
    ctx.scale(Math.cos(theta) * rect.s, rect.s);
    ctx.translate(-COVER.w, 0);
    if (Math.cos(theta) >= 0) {
        drawCover(f, {
            frame: 1,
            mast: 1,
            row: 1,
            light: 1,
            title: 10,
            name: 10,
            star: 10,
            peel: 1,
        });
        const s = 178;
        setFont(ctx, { family: fonts.pulp, weight: 700, px: s });
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = goldGradient(ctx, 280, 120, 320, 300);
        ctx.fillText(v.year, 300, 208);
    } else {
        paper(ctx, 0, 0, COVER.w, COVER.h);
    }
    ctx.fillStyle = `rgb(0 0 0 / ${0.55 * Math.sin(theta)})`;
    ctx.fillRect(0, 0, COVER.w, COVER.h);
    ctx.restore();
}

/** The back of the inside flap: "Deadlock+ Dispatch presents / The year in review". */
function drawInside(f: F): void {
    const { ctx, v, fonts } = f;
    ctx.fillStyle = INK.black;
    ctx.fillRect(0, 0, COVER.w, COVER.h);
    ctx.save();
    ctx.strokeStyle = "rgb(222 184 102 / 0.08)";
    ctx.lineWidth = 2;
    for (let d = -COVER.h; d < COVER.w; d += 26) {
        ctx.beginPath();
        ctx.moveTo(d, COVER.h);
        ctx.lineTo(d + COVER.h, 0);
        ctx.stroke();
    }
    ctx.restore();
    drawFrame(ctx, 1);
    text(ctx, v.inside.kicker.toLocaleUpperCase(v.locale), 300, 330, {
        family: fonts.display,
        weight: 700,
        px: 18,
        track: 0.26,
        fill: INK.gold,
        align: "center",
        maxW: 500,
    });
    const words = v.inside.title.split(" ");
    const half = Math.ceil(words.length / 2);
    const lines = words.length > 2 ? [words.slice(0, half).join(" "), words.slice(half).join(" ")] : [v.inside.title];
    lines.forEach((line, i) => {
        text(ctx, line, 300, 420 + i * 86 - (lines.length - 1) * 30, {
            family: fonts.body,
            weight: 600,
            px: 78,
            italic: true,
            fill: INK.cream,
            align: "center",
            maxW: 500,
        });
    });
    text(ctx, v.inside.span.toLocaleUpperCase(v.locale), 300, 600, {
        family: fonts.display,
        weight: 700,
        px: 18,
        track: 0.2,
        fill: INK.gold,
        align: "center",
        maxW: 500,
    });
}

/* ---------- The poster ---------- */

/** The black band across the top: kicker row and "2026: the year of NAME". `dt` < 0 holds the title back. */
function bandBottom(f: F): number {
    return f.box.y + 190 * f.u;
}

function drawBand(f: F, dt: number): void {
    const { ctx, u, v, fonts, box } = f;
    const bottom = bandBottom(f);
    const g = ctx.createLinearGradient(0, 0, 0, bottom);
    g.addColorStop(0, INK.band);
    g.addColorStop(1, "#1d1912");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, f.w, bottom);
    ctx.fillStyle = INK.gold;
    ctx.fillRect(0, bottom - 7 * u, f.w, 7 * u);

    const wide = stage(f);
    const left = f.w > f.h ? wide.x : box.x + 48 * u;
    const right = f.w > f.h ? wide.x + wide.w : box.x + box.w - 48 * u;
    const kick: TextStyle = { family: fonts.display, weight: 700, px: 20 * u, track: 0.22, fill: INK.gold };
    text(ctx, v.kicker.name.toLocaleUpperCase(v.locale), left, box.y + 52 * u, { ...kick, maxW: box.w * 0.45 });
    text(ctx, v.kicker.span.toLocaleUpperCase(v.locale), right, box.y + 52 * u, {
        ...kick,
        align: "right",
        maxW: box.w * 0.45,
    });
    if (dt < 0) return;

    const k = slamScale(dt, 1.6);
    const before = v.title.before.toLocaleUpperCase(v.locale);
    const player = v.title.player.toLocaleUpperCase(v.locale);
    const after = v.title.after.toLocaleUpperCase(v.locale);
    const style: TextStyle = { family: fonts.pulp, weight: 700, px: (f.w > f.h ? 100 : 84) * u };
    const whole = measure(ctx, before + player + after, style);
    const maxW = Math.min(f.w - 80 * u, box.w * 1.5);
    const px = whole > maxW ? (style.px * maxW) / whole : style.px;
    const s = { ...style, px };
    const wb = measure(ctx, before, s);
    const wp = measure(ctx, player, s);
    const y = box.y + 122 * u;
    ctx.save();
    ctx.globalAlpha *= fadeIn(dt, 0.05);
    ctx.translate(f.w / 2, y);
    ctx.scale(k, k);
    const x0 = -(wb + wp + measure(ctx, after, s)) / 2;
    text(ctx, before, x0, 0, { ...s, fill: INK.cream });
    if (player) text(ctx, player, x0 + wb, 0, { ...s, fill: goldGradient(ctx, 0, -px / 2, 0, px / 2) });
    if (after) text(ctx, after, x0 + wb + wp, 0, { ...s, fill: INK.cream });
    ctx.restore();
}

/** The area under the band that sections lay out in; 16:9 widens it. */
function stage(f: F): Rect {
    const top = bandBottom(f) + 46 * f.u;
    const w = f.w > f.h ? Math.min(f.w - 160 * f.u, f.box.w * 1.6) : f.box.w - 110 * f.u;
    return { x: (f.w - w) / 2, y: top, w, h: f.box.y + f.box.h - 44 * f.u - top };
}

function drawPoster(f: F): void {
    const { ctx, t, u, v } = f;
    paper(ctx, 0, 0, f.w, f.h);
    // A faint year on the paper's foot, so the room 9:16 leaves under the content reads as print, not empty.
    const foot = f.h - f.box.y - f.box.h;
    if (foot > 200 * u) {
        ctx.save();
        ctx.globalAlpha = 0.07;
        text(ctx, v.year, f.w / 2, f.h - 40 * u, {
            family: f.fonts.pulp,
            weight: 700,
            px: Math.max(320 * u, f.h - f.box.y - f.box.h + 140 * u),
            fill: INK.goldInk,
            align: "center",
            baseline: "alphabetic",
            maxW: f.w * 1.1,
        });
        ctx.restore();
    }

    const section = f.p.plan.sections.find((s) => t >= at(f, s.bar) && t < at(f, s.bar + s.bars));
    if (!section) return drawBand(f, 10);
    const start = at(f, section.bar);
    const dt = t - start;
    // A short punch on every section's downbeat.
    const punch = 1 + 0.035 * Math.exp(-dt / 0.12);
    ctx.save();
    ctx.translate(f.w / 2, f.h * 0.45);
    ctx.scale(punch, punch);
    ctx.translate(-f.w / 2, -f.h * 0.45);
    const draw: Record<SectionId, (f: F, start: number, bars: number) => void> = {
        numbers: drawNumbers,
        heroes: drawHeroes,
        months: drawMonths,
        highlights: drawHighlights,
        people: drawPeople,
    };
    draw[section.id](f, start, section.bars);
    ctx.restore();
    drawBand(f, 10);
}

function sectionTitle(f: F, label: string, x: number, y: number, dt: number, maxW: number): void {
    if (dt < 0) return;
    f.ctx.globalAlpha = fadeIn(dt, 0.1);
    text(f.ctx, label.toLocaleUpperCase(f.v.locale), x - 30 * f.u * (1 - easeOutCubic(dt / 0.2)), y, {
        family: f.fonts.display,
        weight: 700,
        px: 30 * f.u,
        track: 0.22,
        fill: INK.goldInk,
        maxW,
    });
    f.ctx.globalAlpha = 1;
}

/** One tile a beat, each counting up until the next one lands. */
function drawNumbers(f: F, start: number, bars: number): void {
    const { ctx, t, u, v, p } = f;
    const area = stage(f);
    const { tiles, kda } = v.numbers;
    sectionTitle(f, v.numbers.title, area.x, area.y + 16 * u, t - start, area.w);
    const cols = f.w > f.h ? 4 : 2;
    const rows = Math.ceil(tiles.length / cols);
    const step = Math.min(f.b, (bars * 4 * f.b - f.b) / Math.max(1, tiles.length));
    const top = area.y + 60 * u;
    const kdaH = kda ? 110 * u : 0;
    const rowH = Math.min((rows > 2 ? 185 : 250) * u, (area.h - 60 * u - kdaH) / rows);
    const gap = 40 * u;
    const colW = (area.w - gap * (cols - 1)) / cols;
    const valuePx = Math.min(130 * u, rowH * 0.56);

    tiles.forEach((tile, i) => {
        const land = start + i * step;
        const dt = t - land;
        if (dt < 0) return;
        const x = area.x + (i % cols) * (colW + gap);
        const y = top + Math.floor(i / cols) * rowH;
        ctx.fillStyle = INK.ink;
        ctx.fillRect(x, y, colW * easeOutCubic(dt / 0.16), 3 * u);

        const count = tile.count;
        const value = count
            ? fillCount(
                  count.template,
                  count.values.map((n) => countUp(n, t, land, land + step, count.percent ? 100 : 1)),
                  (n) => (count.percent ? p.pct : p.num).format(n),
              )
            : tile.value;
        const k = slamScale(dt, 1.35);
        ctx.save();
        ctx.globalAlpha = fadeIn(dt, 0.06);
        ctx.translate(x, y + 16 * u + valuePx / 2);
        ctx.scale(k, k);
        text(ctx, value, 0, 0, { family: f.fonts.pulp, weight: 700, px: valuePx, fill: INK.ink, maxW: colW });
        ctx.restore();
        ctx.globalAlpha = fadeIn(dt, 0.12);
        text(ctx, tile.label.toLocaleUpperCase(v.locale), x, y + 34 * u + valuePx, {
            family: f.fonts.display,
            weight: 700,
            px: 22 * u,
            track: 0.16,
            fill: INK.inkSoft,
            maxW: colW,
        });
        ctx.globalAlpha = 1;
    });

    if (kda) {
        const land = start + (bars * 4 - 1) * f.b;
        const dt = t - land;
        if (dt >= 0) {
            const y = top + rows * rowH + 20 * u;
            ctx.fillStyle = INK.ink;
            ctx.fillRect(area.x, y, area.w * easeOutCubic(dt / 0.16), 3 * u);
            ctx.globalAlpha = fadeIn(dt, 0.08);
            const label = text(ctx, kda.label.toLocaleUpperCase(v.locale), area.x, y + 52 * u, {
                family: f.fonts.display,
                weight: 700,
                px: 22 * u,
                track: 0.16,
                fill: INK.inkSoft,
                maxW: area.w * 0.4,
            });
            const k = slamScale(dt, 1.3);
            ctx.save();
            ctx.translate(area.x + label.w + 28 * u, y + 52 * u);
            ctx.scale(k, k);
            text(ctx, kda.value, 0, 0, {
                family: f.fonts.pulp,
                weight: 700,
                px: 56 * u,
                fill: INK.ink,
                maxW: area.w - label.w - 28 * u,
            });
            ctx.restore();
            ctx.globalAlpha = 1;
        }
    }
}

/** A hero card: black, the portrait standing in it, a gold or ink border. */
function card(f: F, heroId: number, name: string, x: number, y: number, w: number, h: number, lead: boolean): void {
    const { ctx, u } = f;
    ctx.save();
    ctx.shadowColor = "rgb(0 0 0 / 0.32)";
    ctx.shadowBlur = 20 * u;
    ctx.shadowOffsetY = 8 * u;
    ctx.fillStyle = lead ? INK.gold : INK.ink;
    const border = (lead ? 6 : 3) * u;
    ctx.fillRect(x - border, y - border, w + border * 2, h + border * 2);
    ctx.restore();
    ctx.fillStyle = "#1a160f";
    ctx.fillRect(x, y, w, h);
    const img = f.images[`hero:${heroId}`];
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    if (img) coverImage(ctx, img, x, y, w, h, 0.5, 0.2);
    else {
        text(ctx, name.slice(0, 1).toLocaleUpperCase(f.v.locale), x + w / 2, y + h / 2, {
            family: f.fonts.pulp,
            weight: 700,
            px: h * 0.4,
            fill: INK.goldDeep,
            align: "center",
        });
    }
    ctx.restore();
}

function medal(f: F, n: number, x: number, y: number, r: number, lead: boolean): void {
    const { ctx, u } = f;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (lead) {
        const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, 0, x, y, r);
        g.addColorStop(0, "#fff1c5");
        g.addColorStop(0.45, INK.gold);
        g.addColorStop(1, "#a27734");
        ctx.fillStyle = g;
    } else {
        ctx.fillStyle = INK.paper;
    }
    ctx.fill();
    ctx.lineWidth = 4 * u;
    ctx.strokeStyle = INK.ink;
    ctx.stroke();
    text(ctx, f.p.num.format(n), x, y + r * 0.06, {
        family: f.fonts.pulp,
        weight: 700,
        px: r * 1.05,
        fill: INK.ink,
        align: "center",
    });
}

/** #1 large with its medal, then the next four dropping in a beat apart. */
function drawHeroes(f: F, start: number, bars: number): void {
    const { ctx, t, u, v } = f;
    const area = stage(f);
    const list = v.heroes.list;
    const step = (bars * 4 * f.b) / 8;
    const cue = (i: number) => start + i * step;
    sectionTitle(f, v.heroes.title, area.x, area.y + 16 * u, t - start, area.w);

    const rest = list.slice(1);
    const smallGap = 24 * u;
    const side = f.w > f.h;
    const sideRoom = area.w - (440 * u * 280) / 380 - 56 * u - 420 * u - 30 * u;
    const smallW = Math.min(200 * u, ((side ? sideRoom : area.w) - smallGap * 3) / 4);
    const smallH = (smallW * 380) / 280;
    const namesH = 78 * u;
    const top = area.y + 70 * u;
    // Landscape sets the four beside the hero of the year instead of under it.
    const avail = area.h - 70 * u - (rest.length && !side ? smallH + namesH + 40 * u : 0);
    // The 280x380 portrait goes soft past 1.5x its own size.
    const bigH = Math.min(avail, 440 * u, 380 * 1.5);
    const bigW = (bigH * 280) / 380;
    const lead = list[0];

    const dt0 = t - cue(0);
    if (lead && dt0 >= 0) {
        const k = slamScale(dt0, 1.25);
        ctx.save();
        ctx.globalAlpha = fadeIn(dt0, 0.06);
        ctx.translate(area.x + 8 * u + bigW / 2, top + bigH / 2);
        ctx.scale(k, k);
        card(f, lead.id, lead.name, -bigW / 2, -bigH / 2, bigW, bigH, true);
        ctx.restore();
        ctx.globalAlpha = 1;

        const dt1 = t - cue(1);
        if (dt1 >= 0) {
            const mk = slamScale(dt1, 2.6);
            ctx.save();
            ctx.translate(area.x + 8 * u, top);
            ctx.rotate((1 - easeOutCubic(dt1 / SLAM)) * -0.6);
            ctx.scale(mk, mk);
            medal(f, 1, 0, 0, 44 * u, true);
            ctx.restore();
            sparks(ctx, area.x + 8 * u, top, dt1, u, 77, 12);
        }

        const tx = area.x + bigW + 56 * u;
        const tw = side ? Math.min(420 * u, area.x + area.w - tx) : area.x + area.w - tx;
        if (dt1 >= 0) {
            ctx.globalAlpha = fadeIn(dt1, 0.08);
            setFont(ctx, { family: f.fonts.display, weight: 700, px: 22 * u, track: 0.16 });
            const tag = v.heroes.tag.toLocaleUpperCase(v.locale);
            const tagW = Math.min(tw, ctx.measureText(tag).width + 28 * u);
            ctx.fillStyle = INK.ink;
            ctx.fillRect(tx, top + 20 * u, tagW, 44 * u);
            text(ctx, tag, tx + 14 * u, top + 43 * u, {
                family: f.fonts.display,
                weight: 700,
                px: 22 * u,
                track: 0.16,
                fill: INK.gold,
                maxW: tagW - 28 * u,
            });
            const nk = slamScale(dt1 - 0.04, 1.4);
            ctx.save();
            ctx.translate(tx, top + 130 * u);
            ctx.scale(nk, nk);
            text(ctx, lead.name.toLocaleUpperCase(v.locale), 0, 0, {
                family: f.fonts.pulp,
                weight: 700,
                px: 84 * u,
                fill: INK.ink,
                maxW: tw,
            });
            ctx.restore();
            ctx.globalAlpha = 1;
        }
        const lines = [lead.games, lead.record].filter((l): l is string => !!l);
        lines.forEach((line, i) => {
            const dt = t - cue(2 + i);
            if (dt < 0) return;
            ctx.globalAlpha = fadeIn(dt, 0.1);
            text(ctx, line, tx + 20 * u * (1 - easeOutCubic(dt / 0.2)), top + (215 + i * 50) * u, {
                family: f.fonts.body,
                weight: 500,
                px: 34 * u,
                fill: INK.inkSoft,
                maxW: tw,
            });
            ctx.globalAlpha = 1;
        });
    }

    const rowW = rest.length * smallW + (rest.length - 1) * smallGap;
    const rowX = side ? area.x + area.w - rowW : area.x + (area.w - rowW) / 2;
    const rowY = side ? top + bigH - smallH - namesH + 20 * u : top + bigH + 48 * u;
    rest.forEach((hero, i) => {
        const dt = t - cue(4 + i);
        if (dt < 0) return;
        const x = rowX + i * (smallW + smallGap);
        const drop = (1 - easeOutBack(dt / 0.22)) * -90 * u;
        ctx.globalAlpha = fadeIn(dt, 0.06);
        card(f, hero.id, hero.name, x, rowY + drop, smallW, smallH, false);
        medal(f, i + 2, x + 4 * u, rowY + drop + 4 * u, 24 * u, false);
        text(ctx, hero.name.toLocaleUpperCase(v.locale), x, rowY + smallH + 26 * u, {
            family: f.fonts.display,
            weight: 700,
            px: 22 * u,
            fill: INK.ink,
            maxW: smallW + smallGap * 0.6,
        });
        text(ctx, hero.games, x, rowY + smallH + 56 * u, {
            family: f.fonts.body,
            weight: 500,
            px: 22 * u,
            fill: INK.inkSoft,
            maxW: smallW + smallGap * 0.6,
        });
        ctx.globalAlpha = 1;
    });
}

/** Bars grow from zero a step a beat; the busiest flashes gold on the last beat. */
function drawMonths(f: F, start: number, bars: number): void {
    const { ctx, t, u, v } = f;
    const months = v.months;
    if (!months) return;
    const area = stage(f);
    const dt = t - start;
    const title = `${months.title} · ${months.sub}`;
    sectionTitle(f, title, area.x, area.y + 16 * u, dt, area.w);

    const n = months.bars.length;
    const slot = area.w / n;
    const barW = slot * 0.72;
    const base = area.y + area.h - 70 * u;
    const maxH = Math.min(area.h - 230 * u, 560 * u);
    const grow = growth(t, start, f.b);
    const goldAt = start + (bars * 4 - 1) * f.b;
    const lit = t - goldAt;
    const countsIn = fadeIn(t - (start + 2.4 * f.b), 0.15);

    ctx.fillStyle = INK.ink;
    ctx.fillRect(area.x, base, area.w * easeOutCubic(dt / 0.25), 4 * u);
    months.bars.forEach((m, i) => {
        const cx = area.x + slot * (i + 0.5);
        ctx.globalAlpha = fadeIn(dt - i * 0.015, 0.1);
        text(ctx, m.label.toLocaleUpperCase(v.locale), cx, base + 36 * u, {
            family: f.fonts.display,
            weight: 700,
            px: 22 * u,
            track: 0.1,
            fill: INK.ink,
            align: "center",
            maxW: slot * 0.96,
        });
        ctx.globalAlpha = 1;
        if (m.issue) {
            const h = 70 * u;
            ctx.save();
            ctx.globalAlpha = countsIn;
            ctx.strokeStyle = INK.goldInk;
            ctx.lineWidth = 2 * u;
            ctx.strokeRect(cx - barW / 2, base - h, barW, h);
            ctx.beginPath();
            ctx.rect(cx - barW / 2, base - h, barW, h);
            ctx.clip();
            for (let d = -h; d < barW; d += 9 * u) {
                ctx.beginPath();
                ctx.moveTo(cx - barW / 2 + d, base);
                ctx.lineTo(cx - barW / 2 + d + h, base - h);
                ctx.stroke();
            }
            ctx.restore();
            ctx.globalAlpha = countsIn;
            text(ctx, `★ ${months.issue.toLocaleUpperCase(v.locale)}`, cx, base - h - 22 * u, {
                family: f.fonts.display,
                weight: 700,
                px: 16 * u,
                fill: INK.goldInk,
                align: "center",
                maxW: slot * 1.3,
            });
            ctx.globalAlpha = 1;
            return;
        }
        const h = maxH * m.share * grow;
        if (h <= 0) return;
        const gold = m.busiest && lit >= 0;
        if (gold) {
            const g = ctx.createLinearGradient(0, base - h, 0, base);
            g.addColorStop(0, "#e8cf8c");
            g.addColorStop(0.5, INK.goldFill);
            g.addColorStop(1, "#966b26");
            ctx.fillStyle = g;
        } else {
            ctx.fillStyle = INK.ink;
        }
        const pop = gold ? slamScale(lit, 1.12) : 1;
        ctx.save();
        ctx.translate(cx, base);
        ctx.scale(pop, pop);
        ctx.fillRect(-barW / 2, -h, barW, h);
        if (gold) {
            ctx.lineWidth = 3 * u;
            ctx.strokeStyle = INK.ink;
            ctx.strokeRect(-barW / 2, -h, barW, h);
            const white = Math.exp(-lit / 0.12);
            if (white > 0.02) {
                ctx.fillStyle = `rgb(255 250 235 / ${white})`;
                ctx.fillRect(-barW / 2, -h, barW, h);
            }
        }
        ctx.restore();
        if (gold) sparks(ctx, cx, base - h, lit, u, 99, 14);

        // The busiest month shows its plain count like the rest until it lights up.
        const crowned = gold;
        ctx.globalAlpha = crowned ? 1 : countsIn;
        if (ctx.globalAlpha > 0) {
            const k = crowned ? slamScale(lit, 1.6) : 1;
            ctx.save();
            ctx.translate(cx, base - h - (crowned ? 30 : 22) * u);
            ctx.scale(k, k);
            text(ctx, crowned ? m.count : m.value, 0, 0, {
                family: f.fonts.display,
                weight: 700,
                px: (crowned ? 28 : 24) * u,
                fill: crowned ? INK.goldInk : INK.ink,
                align: "center",
                maxW: crowned ? slot * 2.6 : slot,
            });
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    });
}

/** Best streak on the downbeat, counting up; game of the year on beat 2, its grade stamped on beat 3. */
function drawHighlights(f: F, start: number, bars: number): void {
    const { ctx, t, u, v, p } = f;
    const area = stage(f);
    const { streak, bestGame } = v;
    const span = bars * 4 * f.b;
    const gameAt = streak ? start + span / 2 : start;
    const half = streak && bestGame ? area.h * 0.44 : area.h;

    if (streak) {
        const dt = t - start;
        const value = p.num.format(countUp(streak.count, t, start, start + f.b));
        const px = Math.min(300 * u, half * 0.9);
        const k = slamScale(dt, 1.5);
        ctx.save();
        ctx.translate(area.x, area.y + half / 2);
        ctx.scale(k, k);
        ctx.shadowColor = "rgb(0 0 0 / 0.18)";
        ctx.shadowBlur = 12 * u;
        ctx.shadowOffsetY = 6 * u;
        const num = text(ctx, value, 0, 0, {
            family: f.fonts.pulp,
            weight: 700,
            px,
            fill: inkGoldGradient(ctx, -px / 2, px / 2),
            maxW: area.w * 0.5,
        });
        ctx.restore();
        setFont(ctx, { family: f.fonts.pulp, weight: 700, px });
        const finalW = Math.min(area.w * 0.5, ctx.measureText(p.num.format(streak.count)).width);
        const tx = area.x + Math.max(num.w, finalW) + 40 * u;
        const tw = area.x + area.w - tx;
        const dt1 = t - (start + f.b);
        if (dt1 >= 0) {
            ctx.globalAlpha = fadeIn(dt1, 0.1);
            text(ctx, streak.title.toLocaleUpperCase(v.locale), tx, area.y + half / 2 - 34 * u, {
                family: f.fonts.display,
                weight: 700,
                px: 28 * u,
                track: 0.2,
                fill: INK.goldInk,
                maxW: tw,
            });
            text(ctx, streak.line, tx + 16 * u * (1 - easeOutCubic(dt1 / 0.2)), area.y + half / 2 + 30 * u, {
                family: f.fonts.body,
                weight: 600,
                px: 52 * u,
                italic: true,
                fill: INK.ink,
                maxW: tw,
            });
            ctx.globalAlpha = 1;
        }
        if (bestGame) {
            ctx.fillStyle = INK.ink;
            ctx.fillRect(area.x, area.y + half + 10 * u, area.w * easeOutCubic((t - gameAt) / 0.2), 3 * u);
        }
    }

    if (bestGame) {
        const dt = t - gameAt;
        if (dt < 0) return;
        const y0 = streak ? area.y + half + 40 * u : area.y + area.h * 0.2;
        sectionTitle(f, bestGame.title, area.x, y0 + 18 * u, dt, area.w);
        const thumbH = Math.min(230 * u, area.y + area.h - y0 - 70 * u);
        const thumbW = (thumbH * 280) / 380;
        const ty = y0 + 62 * u;
        const k = slamScale(dt, 1.3);
        ctx.save();
        ctx.globalAlpha = fadeIn(dt, 0.06);
        ctx.translate(area.x + thumbW / 2, ty + thumbH / 2);
        ctx.scale(k, k);
        card(f, bestGame.heroId, bestGame.hero, -thumbW / 2, -thumbH / 2, thumbW, thumbH, true);
        ctx.restore();
        const tx = area.x + thumbW + 40 * u;
        const tw = area.x + area.w - tx;
        text(ctx, `${bestGame.hero.toLocaleUpperCase(v.locale)} · ${bestGame.kda}`, tx, ty + 50 * u, {
            family: f.fonts.pulp,
            weight: 700,
            px: 60 * u,
            fill: INK.ink,
            maxW: tw,
        });
        text(ctx, bestGame.date, tx, ty + 116 * u, {
            family: f.fonts.body,
            weight: 500,
            px: 32 * u,
            fill: INK.inkSoft,
            maxW: tw,
        });
        ctx.globalAlpha = 1;
        if (bestGame.grade) {
            const st = t - (gameAt + (streak ? span / 4 : span / 2));
            if (st >= 0) stamp(f, bestGame.grade, tx + 140 * u, ty + thumbH - 40 * u, st);
        }
    }
}

/** A rubber stamp in gold ink, slammed down at a tilt. */
function stamp(f: F, label: string, x: number, y: number, dt: number): void {
    const { ctx, u, v } = f;
    const k = slamScale(dt, 2.2);
    ctx.save();
    ctx.globalAlpha = fadeIn(dt, 0.05);
    ctx.translate(x, y);
    ctx.rotate(-0.16);
    ctx.scale(k, k);
    setFont(ctx, { family: f.fonts.pulp, weight: 700, px: 46 * u, track: 0.04 });
    const str = label.toLocaleUpperCase(v.locale);
    const w = ctx.measureText(str).width + 44 * u;
    ctx.letterSpacing = "0px";
    ctx.lineWidth = 5 * u;
    ctx.strokeStyle = INK.goldInk;
    ctx.strokeRect(-w / 2, -40 * u, w, 80 * u);
    ctx.lineWidth = 2 * u;
    ctx.strokeRect(-w / 2 + 8 * u, -32 * u, w - 16 * u, 64 * u);
    text(ctx, str, 0, 2 * u, {
        family: f.fonts.pulp,
        weight: 700,
        px: 46 * u,
        track: 0.04,
        fill: INK.goldInk,
        align: "center",
    });
    ctx.restore();
}

/** Mates on the first beats, then the nemesis slammed down as a wanted poster. */
function drawPeople(f: F, start: number, bars: number): void {
    const { ctx, t, u, v } = f;
    const area = stage(f);
    const { mates, nemesis } = v.people;
    const span = bars * 4 * f.b;
    const rows = mates?.rows ?? [];
    const nemAt = rows.length ? start + span / 2 : start;
    const rowStep = rows.length ? Math.min(f.b, span / 2 / rows.length) : 0;
    const side = f.w > f.h && rows.length > 0 && !!nemesis;
    const listH = nemesis && !side ? area.h * 0.46 : area.h;
    const listW = side ? area.w * 0.52 : area.w;

    if (mates && rows.length) {
        sectionTitle(f, mates.title, area.x, area.y + 16 * u, t - start, listW);
        const rowH = Math.min(96 * u, (listH - 60 * u) / rows.length);
        rows.forEach((row, i) => {
            const dt = t - (start + i * rowStep);
            if (dt < 0) return;
            const y = area.y + 60 * u + i * rowH;
            const slide = (1 - easeOutCubic(dt / 0.18)) * 60 * u;
            ctx.globalAlpha = fadeIn(dt, 0.08);
            const name = text(ctx, row.name, area.x + slide, y + rowH * 0.5, {
                family: f.fonts.display,
                weight: 700,
                px: 38 * u,
                fill: INK.ink,
                maxW: listW * 0.5,
            });
            text(ctx, row.line, area.x + listW + slide, y + rowH * 0.5, {
                family: f.fonts.body,
                weight: 500,
                px: 26 * u,
                fill: INK.inkSoft,
                align: "right",
                maxW: listW - name.w - 30 * u,
            });
            ctx.fillStyle = "rgb(24 22 17 / 0.35)";
            for (let x = area.x; x < area.x + listW * easeOutCubic(dt / 0.2); x += 10 * u) {
                ctx.fillRect(x, y + rowH - 6 * u, 5 * u, 2 * u);
            }
            ctx.globalAlpha = 1;
        });
    }

    if (nemesis) {
        const dt = t - nemAt;
        if (dt < 0) return;
        const h = side ? 380 * u : Math.min(area.h - (rows.length ? listH + 20 * u : area.h * 0.12), 330 * u);
        const top = side ? area.y + (area.h - h) / 2 : rows.length ? area.y + listH + 20 * u : area.y + area.h * 0.12;
        const w = side ? area.w - listW - 60 * u : Math.min(area.w, 760 * u);
        const x = side ? area.x + listW + 60 * u : area.x + (area.w - w) / 2;
        const k = slamScale(dt, 1.5);
        ctx.save();
        ctx.globalAlpha = fadeIn(dt, 0.05);
        ctx.translate(x + w / 2, top + h / 2);
        ctx.rotate(-0.03 * easeOutCubic(dt / SLAM));
        ctx.scale(k, k);
        ctx.shadowColor = "rgb(0 0 0 / 0.35)";
        ctx.shadowBlur = 24 * u;
        ctx.shadowOffsetY = 10 * u;
        ctx.fillStyle = INK.black;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.shadowColor = "transparent";
        ctx.strokeStyle = INK.gold;
        ctx.lineWidth = 4 * u;
        ctx.strokeRect(-w / 2 + 12 * u, -h / 2 + 12 * u, w - 24 * u, h - 24 * u);
        text(ctx, nemesis.title.toLocaleUpperCase(v.locale), 0, -h / 2 + 62 * u, {
            family: f.fonts.display,
            weight: 700,
            px: 34 * u,
            track: 0.3,
            fill: INK.gold,
            align: "center",
            maxW: w - 80 * u,
        });
        text(ctx, nemesis.row.name.toLocaleUpperCase(v.locale), 0, 6 * u, {
            family: f.fonts.pulp,
            weight: 700,
            px: Math.min(96 * u, h * 0.3),
            fill: goldGradient(ctx, 0, -40 * u, 0, 40 * u),
            align: "center",
            maxW: w - 80 * u,
        });
        text(ctx, nemesis.row.line, 0, h / 2 - 58 * u, {
            family: f.fonts.body,
            weight: 600,
            px: 32 * u,
            italic: true,
            fill: INK.cream,
            align: "center",
            maxW: w - 80 * u,
        });
        ctx.restore();
        sparks(ctx, x + w / 2, top + h / 2, dt, u, 501, 18);
    }
}

/* ---------- End card ---------- */

function drawEnd(f: F): void {
    const { ctx, t, u, v, box } = f;
    const start = at(f, f.p.plan.end.bar);
    const dt = t - start;
    room(ctx, f.w, f.h, 1);
    dust(ctx, f.w, f.h, t, u, 1);
    const cx = f.w / 2;
    const cy = box.y + box.h * 0.46;

    const brand = f.images.brand;
    const markS = 190 * u;
    const k = slamScale(dt, 1.6);
    ctx.save();
    ctx.globalAlpha = fadeIn(dt, 0.06);
    ctx.translate(cx, cy - 190 * u);
    ctx.scale(k, k);
    if (brand) ctx.drawImage(brand, -markS / 2, -markS / 2, markS, markS);
    ctx.restore();
    ctx.globalAlpha = fadeIn(dt, 0.08);
    text(ctx, "DEADLOCK+", cx, cy - 20 * u, {
        family: f.fonts.display,
        weight: 700,
        px: 64 * u,
        track: 0.12,
        fill: goldGradient(ctx, 0, cy - 52 * u, 0, cy + 12 * u),
        align: "center",
        maxW: box.w - 120 * u,
    });
    ctx.globalAlpha = 1;
    const dt1 = t - (start + f.b);
    if (dt1 >= 0) {
        ctx.globalAlpha = fadeIn(dt1, 0.12);
        text(ctx, v.end.cta, cx, cy + 70 * u + 14 * u * (1 - easeOutCubic(dt1 / 0.2)), {
            family: f.fonts.body,
            weight: 600,
            px: 44 * u,
            italic: true,
            fill: INK.cream,
            align: "center",
            maxW: box.w - 120 * u,
        });
        ctx.globalAlpha = 1;
    }
    const dt2 = t - (start + 2 * f.b);
    if (dt2 >= 0) {
        const uk = slamScale(dt2, 1.4);
        ctx.save();
        ctx.globalAlpha = fadeIn(dt2, 0.06);
        ctx.translate(cx, cy + 160 * u);
        ctx.scale(uk, uk);
        text(ctx, v.end.url, 0, 0, {
            family: f.fonts.display,
            weight: 700,
            px: 58 * u,
            fill: INK.gold,
            align: "center",
            maxW: box.w - 120 * u,
        });
        ctx.restore();
    }
    ctx.globalAlpha = 1;
}
