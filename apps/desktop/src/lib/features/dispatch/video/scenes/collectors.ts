import { SLEEVE } from "../../kinds/collectors/layout";
import { TEAR_MS, tearFrame } from "../../kinds/collectors/tear";
import { clamp01, easeInOut, easeOutCubic } from "../kit/ease";
import { seeded } from "../kit/rng";
import type { Ctx } from "../kit/types";
import type { Scene, SceneAssets } from "../scene";
import { drawBag } from "./collectors/bag";
import { drawChart, type Region } from "./collectors/chart";
import {
    COVER_H,
    COVER_W,
    drawGloss,
    drawPlate,
    drawRays,
    drawSweep,
    recordText,
    renderCover,
} from "./collectors/cover";
import { fill, type CollectorsSceneData } from "./collectors/legacy-data";
import { INK, drawContained, fit, foilText, font, roundRect, type Fonts } from "./collectors/paint";
import {
    climbTiming,
    collectorsPlan,
    countUp,
    drawnMatches,
    heroCue,
    HERO_SLIDE_BEATS,
    outBack,
    punch,
    recordCues,
    segmentAt,
    slideIn,
    stamp,
    type SegmentId,
} from "./collectors/legacy-plan";

/** The tear's own clock runs six beats at 155 BPM; the video plays it beat for beat at any tempo. */
const TEAR_BEATS = 6;
/** The rip starts this far into the tear's clock, so it lands on the downbeat. */
const RIP_AT_MS = 120;

interface Stage {
    k: number;
    cx: number;
    cy: number;
    /** Usable half-width and half-height around the centre, in units (1 unit = 1 px of a 1080 short side). */
    hw: number;
    hh: number;
    /** `hh / 500`: layouts written for ±500 units stretch by this to fill a tall frame. */
    v: number;
    wide: boolean;
}

interface Shot {
    ctx: Ctx;
    t: number;
    data: CollectorsSceneData;
    fonts: Fonts;
    images: SceneAssets["images"];
    /** Beats into the segment. */
    beats: number;
    /** The segment's length in beats. */
    length: number;
    stage: Stage;
    cover: OffscreenCanvas;
    beatSeconds: number;
}

/**
 * 9:16 sits a little above the middle and keeps its key text inside y 270-1460 of 1920, clear of the TikTok and
 * Shorts captions and buttons at the bottom.
 */
function stageOf(w: number, h: number): Stage {
    const k = Math.min(w, h) / 1080;
    const tall = h / w > 1.3;
    const wide = w / h > 1.3;
    const hh = tall ? 590 : 500;
    return { k, cx: w / 2, cy: tall ? h * 0.45 : h / 2, hw: w / 2 / k - (wide ? 90 : 60), hh, v: hh / 500, wide };
}

const covers = new WeakMap<object, Map<number, OffscreenCanvas>>();

/** The printed cover is the same in every frame, so it is drawn once per export and size. */
function coverFor(assets: SceneAssets, data: CollectorsSceneData, k: number): OffscreenCanvas {
    let sizes = covers.get(assets);
    if (!sizes) covers.set(assets, (sizes = new Map()));
    let canvas = sizes.get(k);
    if (!canvas) sizes.set(k, (canvas = renderCover(data, assets.images, assets.fonts, k * 1.25)));
    return canvas;
}

const DUST = (() => {
    const rnd = seeded(20261105);
    return Array.from({ length: 110 }, () => ({
        x: rnd(),
        y: rnd(),
        r: 0.8 + rnd() * 2.2,
        speed: 0.004 + rnd() * 0.012,
        phase: rnd() * Math.PI * 2,
        twinkle: 0.6 + rnd() * 1.8,
    }));
})();

function background(ctx: Ctx, w: number, h: number, s: Stage, t: number, beatSeconds: number) {
    ctx.fillStyle = INK.night;
    ctx.fillRect(0, 0, w, h);
    const reach = Math.max(w, h) * 0.75;
    const glow = ctx.createRadialGradient(s.cx, s.cy, 0, s.cx, s.cy, reach);
    glow.addColorStop(0, "#3a2a1055");
    glow.addColorStop(0.45, "#1a120820");
    glow.addColorStop(1, "#00000000");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    const beat = (t / beatSeconds) % 1;
    const pulse = Math.exp(-beat * 5);
    ctx.fillStyle = "#f3d98c";
    for (const d of DUST) {
        const y = (((d.y - t * d.speed) % 1) + 1) % 1;
        const a = (0.25 + 0.55 * Math.abs(Math.sin(t * d.twinkle + d.phase))) * (0.8 + 0.4 * pulse);
        ctx.globalAlpha = Math.min(1, a);
        ctx.beginPath();
        ctx.arc(d.x * w, y * h, d.r * s.k, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, reach * 1.1);
    vignette.addColorStop(0, "#00000000");
    vignette.addColorStop(1, "#000000cc");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
}

/** A jolt that dies away within `beats`, the same every time for the same moment. */
function shake(sinceBeats: number, size: number, beats = 0.75): [number, number] {
    if (sinceBeats < 0 || sinceBeats > beats) return [0, 0];
    const fall = Math.exp(-sinceBeats * 6);
    return [Math.sin(sinceBeats * 47) * size * fall, Math.cos(sinceBeats * 39) * size * fall];
}

function bagScale(st: Stage) {
    return Math.min((2 * st.hh - 60) / SLEEVE.height, (2 * st.hw) / (SLEEVE.width + 28));
}

function coverScale(st: Stage) {
    return Math.min((2 * st.hh - 40) / COVER_H, (2 * st.hw) / COVER_W);
}

function sealed(s: Shot) {
    const { ctx, beats, length } = s;
    const p = punch(beats);
    const scale = bagScale(s.stage) * (0.94 + 0.06 * easeInOut(beats / length)) * (p.alpha ? p.scale * 0.2 + 0.8 : 1);
    const lastBar = beats >= length - 4;
    const frac = beats % 1;
    const nudge =
        beats >= length - 1 ? 16 * easeOutCubic((beats - (length - 1)) / 0.5) : lastBar ? 7 * Math.exp(-frac * 6) : 0;
    ctx.save();
    ctx.rotate(((1.2 * Math.PI) / 180) * Math.sin((beats / length) * Math.PI * 2));
    ctx.scale(scale, scale);
    ctx.translate(-SLEEVE.width / 2, -SLEEVE.height / 2);
    drawBag(ctx, s.cover, s.data, s.fonts, { tear: null, ripMs: 0, sheen: (beats - 1.5) / 3, nudge });
    ctx.restore();
}

function tear(s: Shot) {
    const { ctx, beats } = s;
    const ms = (beats * TEAR_MS) / TEAR_BEATS + RIP_AT_MS;
    const [dx, dy] = shake(beats, 14);
    const scale = bagScale(s.stage);
    ctx.save();
    ctx.translate(dx, dy);
    ctx.scale(scale, scale);
    ctx.translate(-SLEEVE.width / 2, -SLEEVE.height / 2);
    drawBag(ctx, s.cover, s.data, s.fonts, { tear: tearFrame(ms), ripMs: ms - RIP_AT_MS, sheen: -1, nudge: 0 });
    ctx.restore();
}

function cover(s: Shot) {
    const { ctx, beats, length, data, fonts } = s;
    const from = bagScale(s.stage);
    const to = coverScale(s.stage);
    const settle = outBack(beats / 1.2);
    const hit = length >= 8 ? 4 : length / 2;
    const plate = stamp(beats - hit);
    const [dx, dy] = shake(beats - hit, 8, 0.5);
    const push = 1 + 0.04 * clamp01((beats - hit) / Math.max(1, length - hit));
    const scale = (from + (to - from) * settle) * push;
    ctx.save();
    ctx.translate(dx, dy);
    ctx.scale(scale, scale);
    ctx.translate(-COVER_W / 2, -COVER_H / 2);
    ctx.save();
    ctx.shadowColor = "#000000c0";
    ctx.shadowBlur = 50;
    ctx.shadowOffsetY = 26;
    ctx.drawImage(s.cover, 0, 0, COVER_W, COVER_H);
    ctx.restore();
    drawGloss(ctx, 0.15 + 0.7 * clamp01(beats / length), 0.22 + 0.1 * Math.sin(beats / 2), 0.5);
    drawSweep(ctx, (beats - 0.4) / 2.2);
    drawPlate(ctx, data, fonts, plate.scale, plate.alpha);
    if (beats >= hit && beats < hit + 1.2) {
        const r = (beats - hit) / 1.2;
        ctx.strokeStyle = `rgba(255, 240, 200, ${0.7 * (1 - r)})`;
        ctx.lineWidth = 6 * (1 - r) + 1;
        ctx.beginPath();
        ctx.ellipse(593, 1006, 90 + r * 140, 40 + r * 70, 0, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();
}

function kicker(ctx: Ctx, text: string, fonts: Fonts, x: number, y: number, max: number, size = 26) {
    ctx.fillStyle = INK.goldDeep;
    ctx.letterSpacing = `${size * 0.22}px`;
    fit(ctx, text.toUpperCase(), 700, size, fonts.display, max, size * 0.5);
    ctx.fillText(text.toUpperCase(), x, y);
    ctx.letterSpacing = "0px";
}

/** Draws with `p` scaling about (x, y); nothing while `p.alpha` is 0. */
function popped(ctx: Ctx, p: { scale: number; alpha: number }, x: number, y: number, draw: () => void) {
    if (p.alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha *= p.alpha;
    ctx.translate(x, y);
    ctx.scale(p.scale, p.scale);
    ctx.translate(-x, -y);
    draw();
    ctx.restore();
}

function climb(s: Shot) {
    const { ctx, beats, length, data, fonts, stage } = s;
    const chart = data.chart!;
    const t2 = data.text;
    const bars = length / 4;
    const total = chart.steps.length;
    const timing = climbTiming(bars, chart.peakIndex, total);
    const bar = beats / 4;
    const drawn = drawnMatches(bar, timing, chart.peakIndex, total);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const head = punch(beats);
    const v = stage.v;
    popped(ctx, head, 0, -390 * v, () => {
        kicker(ctx, t2.kicker, fonts, 0, -462 * v, 2 * stage.hw, 24);
        ctx.letterSpacing = "3px";
        fit(ctx, t2.climbTitle.toUpperCase(), 700, 128, fonts.pulp, 2 * stage.hw, 60);
        foilText(ctx, t2.climbTitle.toUpperCase(), 0, -380 * v, 0.25 + 0.2 * Math.sin(s.t * 0.9));
        ctx.letterSpacing = "0px";
    });

    const region: Region = { x: -stage.hw, y: -250 * v, w: 2 * stage.hw, h: 600 * v };
    const now = drawChart(ctx, data, chart, fonts, s.images, region, {
        drawn,
        frame: clamp01((beats - 0.3) / 2.5),
        sincePeak: (bar - timing.peak) * 4,
    });

    const n = new Intl.NumberFormat(data.locale);
    if (beats >= 1) {
        ctx.save();
        ctx.globalAlpha = clamp01(beats - 1);
        ctx.textAlign = "left";
        ctx.fillStyle = INK.cream;
        const counter = fill(t2.matchOf, { n: n.format(Math.max(1, now.matches)), total: n.format(total) });
        fit(ctx, counter, 600, 34, fonts.body, stage.hw, 16);
        ctx.fillText(counter, -stage.hw, -292 * v);
        ctx.textAlign = "right";
        ctx.font = font(700, 40, fonts.pulp);
        const downs = `▼ ${n.format(now.downs)}`;
        ctx.fillStyle = INK.down;
        ctx.fillText(downs, stage.hw, -292 * v);
        const dw = ctx.measureText(downs).width;
        ctx.fillStyle = INK.up;
        ctx.fillText(`▲ ${n.format(now.ups)}`, stage.hw - dw - 30, -292 * v);
        ctx.restore();
    }

    const done = (bar - timing.to) * 4;
    if (done >= 0 && data.hasClimb) {
        ctx.save();
        ctx.globalAlpha = 1 - slideIn(done - 0.5);
        ctx.textAlign = "center";
        const line = t2.climb ? `${t2.startLabel} → ${t2.endLabel} · ${t2.climb}` : `${t2.startLabel} → ${t2.endLabel}`;
        ctx.fillStyle = INK.gold;
        fit(ctx, line, 700, 40, fonts.display, 2 * stage.hw, 18);
        ctx.fillText(line, 0, region.y + region.h + 60);
        ctx.restore();
    }
}

function bigNumber(
    ctx: Ctx,
    text: string,
    final: string,
    fonts: Fonts,
    x: number,
    y: number,
    max: number,
    size: number,
    t: number,
) {
    ctx.letterSpacing = "2px";
    // Sized by the final value so the count never changes the type size mid-count.
    const fitted = fit(ctx, final, 700, size, fonts.pulp, max, size * 0.4);
    ctx.font = font(700, fitted, fonts.pulp);
    foilText(ctx, text, x, y, 0.3 + 0.2 * Math.sin(t * 0.8), 0.3);
    ctx.letterSpacing = "0px";
}

function label(ctx: Ctx, text: string, fonts: Fonts, x: number, y: number, max: number, size = 30) {
    ctx.fillStyle = INK.creamSoft;
    ctx.letterSpacing = `${size * 0.2}px`;
    fit(ctx, text.toUpperCase(), 700, size, fonts.display, max, size * 0.5);
    ctx.fillText(text.toUpperCase(), x, y);
    ctx.letterSpacing = "0px";
}

function record(s: Shot) {
    const { ctx, beats, length, data, fonts, stage, t } = s;
    const t2 = data.text;
    const n = new Intl.NumberFormat(data.locale);
    const pct = new Intl.NumberFormat(data.locale, { style: "percent", maximumFractionDigits: 0 });
    const { record: recordHit, rate: rateHit, row: smallHit } = recordCues(length);
    const wide = stage.wide;
    const hasRate = data.winrate !== null;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const recX = wide && hasRate ? -stage.hw * 0.48 : 0;
    const v = stage.v;
    const recY = wide ? -90 : (hasRate ? -250 : -120) * v;
    const colW = wide && hasRate ? stage.hw * 0.9 : 2 * stage.hw;
    popped(ctx, punch(beats), 0, wide ? -400 : -420 * v, () =>
        kicker(ctx, t2.rankedRecord, fonts, 0, wide ? -400 : -420 * v, 2 * stage.hw, 34),
    );
    const p = clamp01(beats / recordHit);
    const value = recordText(data, countUp(data.record.wins, p), countUp(data.record.losses, p));
    popped(ctx, beats >= recordHit ? punch(beats - recordHit) : { scale: 1, alpha: 1 }, recX, recY, () =>
        bigNumber(ctx, value, recordText(data), fonts, recX, recY, colW, wide ? 230 : 250, t),
    );

    if (hasRate) {
        const rateX = wide ? stage.hw * 0.48 : 0;
        const rateY = wide ? -90 : 90 * v;
        const shown = clamp01((beats - recordHit) / (rateHit - recordHit));
        if (beats >= recordHit) {
            const target = Math.round((data.winrate ?? 0) * 100);
            const v = pct.format(countUp(target, shown) / 100);
            popped(ctx, beats >= rateHit ? punch(beats - rateHit) : { scale: 1, alpha: 1 }, rateX, rateY, () =>
                bigNumber(ctx, v, pct.format(target / 100), fonts, rateX, rateY, colW, wide ? 230 : 220, t),
            );
            label(ctx, t2.won, fonts, rateX, rateY + 150, colW);
        }
    }

    const rowY = wide ? 270 : 380 * v;
    const cells: [string, string][] = [
        [n.format(data.streak), t2.bestStreak],
        [n.format(data.matches), t2.rankedMatches],
    ];
    cells.forEach(([v, l], i) => {
        const x = (i === 0 ? -1 : 1) * (wide ? stage.hw * 0.3 : stage.hw * 0.5);
        popped(ctx, punch(beats - smallHit), x, rowY, () => {
            ctx.fillStyle = INK.cream;
            fit(ctx, v, 700, 110, fonts.pulp, stage.hw * 0.9, 40);
            ctx.fillText(v, x, rowY);
            label(ctx, l, fonts, x, rowY + 80, stage.hw * 0.9, 24);
        });
    });
    if (beats >= smallHit) {
        ctx.fillStyle = "rgba(201, 162, 74, 0.6)";
        ctx.fillRect(-1, rowY - 60, 2, 160);
    }
}

function heroes(s: Shot) {
    const { ctx, beats, length, data, fonts, stage, t } = s;
    const wide = stage.wide;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    const v = stage.v;
    popped(ctx, punch(beats), 0, -440 * v, () => kicker(ctx, data.text.carried, fonts, 0, -440 * v, 2 * stage.hw, 36));
    data.heroes.forEach((h, i) => {
        const hit = heroCue(i, length);
        const off = slideIn(beats - hit, HERO_SLIDE_BEATS);
        if (beats < hit - HERO_SLIDE_BEATS) return;
        const image = s.images[`hero:${h.id}`];
        ctx.save();
        ctx.globalAlpha = 1 - off * 0.9;
        if (wide) {
            const x = (i - (data.heroes.length - 1) / 2) * (stage.hw * 0.66) + off * 700;
            portrait(ctx, image, h.name, fonts, x, -110, 0.95, t + i);
            ctx.textAlign = "center";
            ctx.fillStyle = INK.cream;
            ctx.letterSpacing = "2px";
            fit(ctx, h.name.toUpperCase(), 700, 76, fonts.pulp, stage.hw * 0.6, 30);
            foilText(ctx, h.name.toUpperCase(), x, 140, 0.3 + 0.15 * Math.sin(t + i), 0.3);
            ctx.letterSpacing = "0px";
            ctx.fillStyle = INK.creamSoft;
            fit(ctx, h.line, 500, 34, fonts.body, stage.hw * 0.6, 16);
            ctx.fillText(h.line, x, 215);
        } else {
            const y = (-250 + i * 260) * v;
            const card = 0.62 * v;
            const x = -stage.hw + 140 * card + off * 900;
            portrait(ctx, image, h.name, fonts, x, y, card, t + i);
            ctx.textAlign = "left";
            ctx.letterSpacing = "2px";
            fit(ctx, h.name.toUpperCase(), 700, 84 * v, fonts.pulp, 2 * stage.hw - 230, 30);
            foilText(ctx, h.name.toUpperCase(), x + 120 * card + 30, y - 30 * v, 0.3 + 0.15 * Math.sin(t + i), 0.3);
            ctx.letterSpacing = "0px";
            ctx.fillStyle = INK.creamSoft;
            fit(ctx, h.line, 500, 36 * v, fonts.body, 2 * stage.hw - 230, 16);
            ctx.fillText(h.line, x + 120 * card + 34, y + 50 * v);
            ctx.fillStyle = "rgba(201, 162, 74, 0.5)";
            ctx.fillRect(x + 120 * card + 30, y + 110 * v, stage.hw - x - 120 * card - 30, 1.5);
        }
        ctx.restore();
    });
}

/** A hero's card art in a gold frame, centred on (x, y); at most 1.5x the 280×380 art in any export. */
function portrait(
    ctx: Ctx,
    image: ImageBitmap | undefined,
    name: string,
    fonts: Fonts,
    x: number,
    y: number,
    s: number,
    t: number,
) {
    const w = 280 * s;
    const h = 380 * s;
    ctx.save();
    ctx.shadowColor = "#000000aa";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 12;
    const bg = ctx.createLinearGradient(x, y - h / 2, x, y + h / 2);
    bg.addColorStop(0, "#2a1d3a");
    bg.addColorStop(1, "#0d0a14");
    ctx.fillStyle = bg;
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 6);
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 6);
    ctx.clip();
    if (image) ctx.drawImage(image, x - w / 2, y - h / 2, w, h);
    else {
        ctx.fillStyle = INK.gold;
        ctx.textAlign = "center";
        ctx.font = font(700, h * 0.4, fonts.pulp);
        ctx.fillText(name.slice(0, 1).toUpperCase(), x, y);
    }
    const shine = ctx.createLinearGradient(x - w, y - h, x + w, y + h);
    const p = (t * 0.25) % 1;
    shine.addColorStop(Math.max(0, p - 0.1), "rgba(255, 255, 255, 0)");
    shine.addColorStop(p, "rgba(255, 240, 200, 0.18)");
    shine.addColorStop(Math.min(1, p + 0.1), "rgba(255, 255, 255, 0)");
    ctx.fillStyle = shine;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.restore();
    ctx.strokeStyle = INK.goldDeep;
    ctx.lineWidth = 3;
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 6);
    ctx.stroke();
}

interface Run {
    text: string;
    bold: boolean;
}

/** Wraps mixed regular and bold runs onto centred lines no wider than `max`. */
function runLines(ctx: Ctx, runs: Run[], fonts: Fonts, size: number, max: number) {
    const words: Run[] = [];
    for (const r of runs)
        for (const [i, w] of r.text.split(/(\s+)/).entries())
            if (w && (i % 2 === 0 || w.trim() === "")) words.push({ text: w, bold: r.bold });
    const width = (w: Run) => {
        ctx.font = font(w.bold ? 600 : 500, size, fonts.body);
        return ctx.measureText(w.text).width;
    };
    const lines: Run[][] = [[]];
    let used = 0;
    for (const w of words) {
        const ww = width(w);
        if (w.text.trim() && used + ww > max && lines[lines.length - 1].length) {
            lines.push([]);
            used = 0;
        }
        if (!w.text.trim() && used === 0) continue;
        lines[lines.length - 1].push(w);
        used += ww;
    }
    return lines.map((line) => ({ line, width: line.reduce((a, w) => a + width(w), 0) }));
}

function certificate(s: Shot) {
    const { ctx, beats, data, fonts, stage } = s;
    const t2 = data.text;
    const w = stage.wide ? 1180 : Math.min(940, 2 * stage.hw);
    const h = 600 * stage.v;
    const enter = punch(beats);
    popped(ctx, enter, 0, 0, () => {
        ctx.save();
        ctx.rotate((-1.2 * Math.PI) / 180);
        ctx.shadowColor = "#000000cc";
        ctx.shadowBlur = 50;
        ctx.shadowOffsetY = 24;
        const paper = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
        paper.addColorStop(0, "#fbf4df");
        paper.addColorStop(1, "#efe3c2");
        ctx.fillStyle = paper;
        roundRect(ctx, -w / 2, -h / 2, w, h, 8);
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.strokeStyle = "rgba(180, 135, 49, 0.16)";
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 9; i++) {
            ctx.beginPath();
            for (let x = -w / 2; x <= w / 2; x += 8) {
                const y = -h / 2 + 60 + i * 60 + Math.sin(x / 38 + i * 0.7) * 14 + Math.sin(x / 91 - i) * 10;
                if (x === -w / 2) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
        ctx.strokeStyle = "#b48731";
        ctx.lineWidth = 3;
        roundRect(ctx, -w / 2 + 18, -h / 2 + 18, w - 36, h - 36, 4);
        ctx.stroke();
        ctx.lineWidth = 1;
        roundRect(ctx, -w / 2 + 28, -h / 2 + 28, w - 56, h - 56, 2);
        ctx.stroke();

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#6a4a12";
        ctx.letterSpacing = "8px";
        fit(ctx, t2.certTitle.toUpperCase(), 700, 34, fonts.display, w - 120, 16);
        ctx.fillText(t2.certTitle.toUpperCase(), 0, -h / 2 + 90);
        ctx.letterSpacing = "0px";

        const runs: Run[] = [{ text: data.certificate.before, bold: false }];
        if (data.certificate.name !== null) runs.push({ text: data.certificate.name, bold: true });
        runs.push({ text: data.certificate.after, bold: false });
        const size = 38 * stage.v;
        const lines = runLines(ctx, runs, fonts, size, w - 160);
        const base = h / 2 - 110;
        const lead = size * 1.35;
        const top = (-h / 2 + 130 + base - 90) / 2 - ((lines.length - 1) * lead) / 2;
        lines.forEach(({ line, width }, i) => {
            let x = -width / 2;
            const y = top + i * lead;
            ctx.textAlign = "left";
            for (const r of line) {
                ctx.font = font(r.bold ? 600 : 500, size, fonts.body);
                ctx.fillStyle = r.bold ? "#1e1406" : "#3a2a10";
                ctx.fillText(r.text, x, y);
                x += ctx.measureText(r.text).width;
            }
        });

        ctx.textAlign = "left";
        ctx.fillStyle = "#2b1f07";
        fit(ctx, t2.signature, 600, 44, fonts.body, w * 0.36, 20);
        ctx.fillText(t2.signature, -w / 2 + 70, base);
        ctx.fillStyle = "#6a4a12";
        ctx.fillRect(-w / 2 + 70, base + 30, w * 0.36, 1.5);
        ctx.letterSpacing = "3px";
        ctx.font = font(700, 16, fonts.display);
        ctx.fillText(t2.issuedBy.toUpperCase(), -w / 2 + 70, base + 52);
        ctx.textAlign = "center";
        const nx = w * 0.08;
        ctx.fillText(t2.copyNumber.toUpperCase(), nx, base - 34);
        ctx.letterSpacing = "4px";
        ctx.fillStyle = INK.red;
        ctx.font = font(700, 50, fonts.display);
        ctx.fillText(data.serial, nx, base + 14);
        ctx.letterSpacing = "0px";

        const seal = stamp(beats - 2);
        popped(ctx, seal, w / 2 - 120, base, () => goldSeal(ctx, w / 2 - 120, base, 72, fonts));
        if (beats >= 2 && beats < 3.2) {
            const r = (beats - 2) / 1.2;
            ctx.strokeStyle = `rgba(180, 135, 49, ${0.8 * (1 - r)})`;
            ctx.lineWidth = 5 * (1 - r) + 1;
            ctx.beginPath();
            ctx.arc(w / 2 - 120, base, 72 + r * 120, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    });
}

function goldSeal(ctx: Ctx, x: number, y: number, r: number, fonts: Fonts) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((-8 * Math.PI) / 180);
    ctx.shadowColor = "#00000066";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    for (let i = 0; i < 40; i++) {
        const rr = i % 2 ? r * 0.92 : r;
        const a = (i / 40) * Math.PI * 2;
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
    g.addColorStop(0, "#fff1b8");
    g.addColorStop(0.5, "#d9b25c");
    g.addColorStop(1, "#8a6420");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "#7a5716";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.74, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#5a3f0e";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = font(700, r * 0.72, fonts.pulp);
    ctx.fillText("D+", 0, r * 0.04);
    ctx.restore();
}

function end(s: Shot) {
    const { ctx, beats, data, fonts, stage, t } = s;
    const t2 = data.text;
    const max = (2 * stage.hw) / stage.v;
    ctx.save();
    ctx.scale(stage.v, stage.v);
    drawRays(ctx, 0, -120, 1100, 0.08 + 0.2 * Math.exp(-beats * 1.2), t * 0.1);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    popped(ctx, punch(beats), 0, -150, () => {
        if (!drawContained(ctx, s.images.brand, 0, -170, 250)) {
            ctx.fillStyle = INK.gold;
            ctx.font = font(700, 160, fonts.pulp);
            ctx.fillText("D+", 0, -170);
        }
        ctx.letterSpacing = "18px";
        fit(ctx, t2.brand.toUpperCase(), 700, 104, fonts.display, max, 40);
        foilText(ctx, t2.brand.toUpperCase(), 9, 40, 0.3 + 0.2 * Math.sin(t * 0.9), 0.35);
        ctx.letterSpacing = "0px";
    });
    popped(ctx, punch(beats - 1), 0, 150, () => {
        ctx.fillStyle = INK.cream;
        fit(ctx, t2.site, 600, 64, fonts.body, max, 28);
        ctx.fillText(t2.site, 0, 150);
    });
    popped(ctx, punch(beats - 2), 0, 250, () => kicker(ctx, t2.endCta, fonts, 0, 250, max, 30));
    popped(ctx, punch(beats), 0, -440, () => {
        ctx.fillStyle = INK.goldDeep;
        ctx.letterSpacing = "5px";
        fit(ctx, t2.ribbon.toUpperCase(), 700, 26, fonts.display, max, 12);
        ctx.fillText(t2.ribbon.toUpperCase(), 0, -440);
        ctx.letterSpacing = "0px";
    });
    ctx.restore();
}

const SHOTS: Record<SegmentId, (s: Shot) => void> = {
    sealed,
    tear,
    cover,
    climb,
    record,
    heroes,
    certificate,
    end,
};

/** Segments that open on a hard cut get a flash; the tear and the cover run on from the shot before. */
const CUT: Record<SegmentId, boolean> = {
    sealed: false,
    tear: false,
    cover: false,
    climb: true,
    record: true,
    heroes: true,
    certificate: true,
    end: true,
};

export const collectorsScene: Scene = (ctx, t, { w, h }, assets) => {
    const data = assets.data as CollectorsSceneData;
    const { timing } = assets;
    const beatSeconds = timing.barSeconds / 4;
    const plan = collectorsPlan(timing.bars, { chart: data.chart !== null, heroes: data.heroes.length > 0 });
    const { segment, local } = segmentAt(plan, t / timing.barSeconds);
    const stage = stageOf(w, h);
    const beats = local * 4;

    background(ctx, w, h, stage, t, beatSeconds);
    const kick = 1 + 0.012 * Math.exp(-((t / timing.barSeconds) % 1) * 10);
    ctx.save();
    ctx.translate(stage.cx, stage.cy);
    ctx.scale(stage.k * kick, stage.k * kick);
    SHOTS[segment.id]({
        ctx,
        t,
        data,
        fonts: assets.fonts,
        images: assets.images,
        beats,
        length: segment.bars * 4,
        stage,
        cover: coverFor(assets, data, stage.k),
        beatSeconds,
    });
    ctx.restore();

    if (CUT[segment.id] && beats < 0.6) {
        ctx.fillStyle = `rgba(255, 244, 214, ${0.22 * (1 - beats / 0.6)})`;
        ctx.fillRect(0, 0, w, h);
    }
    if (segment.id === "tear" && beats < 1) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.3 * Math.exp(-beats * 5)})`;
        ctx.fillRect(0, 0, w, h);
    }
};
