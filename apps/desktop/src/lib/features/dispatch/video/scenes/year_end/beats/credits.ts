import { countUp } from "../../../kit/count";
import { clamp01, easeInOut, easeOutCubic } from "../../../kit/ease";
import { sceneFrame } from "../../../kit/frame";
import type { Ctx } from "../../../kit/types";
import type { SceneAssets, SceneSize } from "../../../scene";
import type { CreditRow } from "../data";
import { INK, dust, goldGradient } from "../draw";
import { crowd } from "./award-paint";
import {
    beam,
    blockHeight,
    countedToken,
    drawRich,
    grain,
    layoutRich,
    numberSpan,
    richMeasure,
    say,
    seedOf,
    spotlight,
    vignette,
    type Look,
    type RichLine,
    type Run,
    type Stage,
} from "./stage";

const GLIDE = 0.42;

/**
 * Which row is on the focus line at `t` (fractional mid-glide): row `floor(k)` gliding toward the next. Each row gets a whole number of beats, the
 * first held from frame 0, and every glide starts on a beat.
 */
export function rollAt(t: number, span: number, beat: number, rows: number): number {
    if (rows <= 1) return 0;
    const step = stepSeconds(span, beat, rows);
    const glide = Math.min(GLIDE, step * 0.7);
    const i = Math.floor(t / step);
    if (i >= rows - 1) return rows - 1;
    const into = t - i * step - (step - glide);
    return i + (into > 0 ? easeInOut(into / glide) : 0);
}

/** Seconds each row holds the focus line, glide included: a whole number of beats, the last row held at least one. */
export function stepSeconds(span: number, beat: number, rows: number): number {
    return Math.max(1, Math.floor((span - beat) / beat / Math.max(1, rows - 1) + 1e-9)) * beat;
}

/** When row `i` lands on the focus line. */
export function arrival(i: number, span: number, beat: number, rows: number): number {
    if (i <= 0 || rows <= 1) return 0;
    return i * stepSeconds(span, beat, rows);
}

interface Block {
    row: CreditRow;
    label: string;
    lines: RichLine[];
    /** The label's lines when it sits above the names (narrow frames). */
    labelLines: RichLine[];
    height: number;
    numberToken: string | null;
}

/**
 * The year's totals as end credits: the header holds while the cast rolls up a row per beat-step, each total
 * counting up as it reaches the light, names in large type under their billing.
 */
export function draw(ctx: Ctx, local: number, span: number, size: SceneSize, data: Stage, assets: SceneAssets): void {
    const { w, h } = size;
    const { u, safe } = sceneFrame(w, h);
    const tall = h > w * 1.2;
    const wide = w > h * 1.2;
    const fonts = assets.fonts;
    const bar = assets.timing.barSeconds > 0 ? assets.timing.barSeconds : span / 4;
    const beat = bar / 4;

    ctx.fillStyle = "#050403";
    ctx.fillRect(0, 0, w, h);
    // A projector's beam through the haze, flickering like film.
    beam(ctx, w / 2, -80 * u, w / 2, h, w * (tall ? 0.42 : 0.3), 0.32 * (0.85 + 0.15 * Math.sin(local * 37)));
    dust(ctx, w, h, local + 7, u, 0.45, 0.2);

    const headPx = (tall ? 104 : 96) * u;
    const labelPx = 46 * u;
    const namePx = (tall ? 112 : 104) * u;
    const bodyPx = (tall ? 60 : 56) * u;
    const numPx = (tall ? 170 : 140) * u;
    const maxW = tall ? w - 120 * u : wide ? Math.min(1500 * u, w - 240 * u) : w - 160 * u;
    const colW = wide ? maxW / 2 - 40 * u : maxW;

    const look = (tag?: string): Look => {
        if (tag === "num") return { family: fonts.display, weight: 700, fill: INK.gold, glow: 24 * u };
        if (tag === "name") return { family: fonts.display, weight: 700, fill: INK.cream, track: 0.02 };
        if (tag === "label") return { family: fonts.display, weight: 700, fill: INK.gold, track: 0.22 };
        if (tag === "head") return { family: fonts.display, weight: 700, fill: INK.cream, track: 0.04 };
        return { family: fonts.body, weight: 600, fill: INK.cream };
    };
    const measure = richMeasure(ctx, look);

    const blocks: Block[] = data.awards.credits.rows.map((row) => {
        const text = say(data, row.text);
        if (row.figure) {
            const at = numberSpan(text, row.figure.value);
            const runs: Run[] = at
                ? [
                      { text: text.slice(0, at.start), px: bodyPx },
                      { text: text.slice(at.start, at.end), px: numPx, tag: "num" },
                      { text: text.slice(at.end), px: bodyPx },
                  ]
                : [{ text, px: bodyPx }];
            const lines = layoutRich(runs, maxW, measure);
            return {
                row,
                label: "",
                lines,
                labelLines: [],
                height: blockHeight(lines),
                numberToken: at ? text.slice(at.start, at.end) : null,
            };
        }
        const label = text.toLocaleUpperCase();
        const names = row.names.flatMap((n, i) =>
            layoutRich([{ text: n, px: namePx, tag: "name" }], colW, measure).map((l) => ({ l, i })),
        );
        const lines = names.map((n) => n.l);
        const labelLines = layoutRich([{ text: label, px: labelPx, tag: "label" }], colW, measure);
        const height = wide
            ? Math.max(blockHeight(lines, 1.02), blockHeight(labelLines))
            : blockHeight(labelLines) + 14 * u + blockHeight(lines, 1.02);
        return { row, label, lines, labelLines, height, numberToken: null };
    });

    const header = say(data, data.awards.credits.title).toLocaleUpperCase();
    const headLines = layoutRich([{ text: header, px: headPx, tag: "head" }], maxW, measure);
    const headTop = tall ? safe.top + 10 * u : 50 * u;
    const headH = blockHeight(headLines);
    const regionTop = headTop + headH + 60 * u;
    // On a phone the credits rise from the foot of the frame, past the house, to a focus line in the safe band.
    const regionBottom = h - 40 * u;
    const focus = tall ? (regionTop + safe.bottom) / 2 : (regionTop + regionBottom) / 2;

    const gap = (tall ? 90 : 70) * u;
    const centres: number[] = [];
    let y = 0;
    for (const b of blocks) {
        centres.push(y + b.height / 2);
        y += b.height + gap;
    }
    const k = rollAt(local, span, beat, blocks.length);
    const k0 = Math.floor(k);
    const k1 = Math.min(blocks.length - 1, k0 + 1);
    const at = centres.length ? centres[k0] + (centres[k1] - centres[k0]) * (k - k0) : 0;
    const shift = focus - at;

    spotlight(ctx, w / 2, focus, maxW * 0.7, (focus - regionTop) * 0.8, 0.55);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, regionTop - 20 * u, w, regionBottom - regionTop + 40 * u);
    ctx.clip();
    blocks.forEach((b, i) => {
        const cy = centres[i] + shift;
        const top = cy - b.height / 2;
        if (top > regionBottom + 20 * u || top + b.height < regionTop - 20 * u) return;
        // Rows dim as they leave the light: full at the focus line, gone by the region's edge.
        const reach = cy < focus ? focus - regionTop : regionBottom - focus;
        const alpha = clamp01(1.15 - (Math.abs(cy - focus) / reach) ** 1.3 * 1.4);
        if (alpha <= 0) return;
        ctx.globalAlpha = alpha;
        if (b.row.figure && b.numberToken) {
            const land = arrival(i, span, beat, blocks.length);
            // Counts from the moment the row starts its glide in, so no row ever sits on screen at zero.
            const step = stepSeconds(span, beat, blocks.length);
            const shown = i === 0 ? b.row.figure.value : countUp(b.row.figure.value, local, land - step, land + 0.1);
            if (shown === 0) return;
            const token = countedToken(b.numberToken, shown);
            const lines = b.lines.map((l) => ({
                ...l,
                words: l.words.map((wd) => (wd.tag === "num" ? { ...wd, text: token } : wd)),
            }));
            drawRich(ctx, lines, w / 2, top, (tag) =>
                tag === "num" ? { ...look(tag), fill: goldGradient(ctx, 0, top, 0, top + numPx) } : look(tag),
            );
        } else if (b.row.figure) {
            drawRich(ctx, b.lines, w / 2, top, look);
        } else if (wide) {
            const lh = blockHeight(b.labelLines);
            drawRich(ctx, b.labelLines, w / 2 - 40 * u, cy - lh / 2, look, { align: "right" });
            drawRich(ctx, b.lines, w / 2 + 40 * u, top, look, { align: "left", leading: 1.02 });
            ctx.fillStyle = INK.goldDeep;
            ctx.fillRect(w / 2 - 1.5 * u, top + 10 * u, 3 * u, b.height - 20 * u);
        } else {
            const lh = drawRich(ctx, b.labelLines, w / 2, top, look);
            drawRich(ctx, b.lines, w / 2, top + lh + 14 * u, look, { leading: 1.02 });
        }
    });
    ctx.restore();
    ctx.globalAlpha = 1;

    if (tall) crowd({ ctx, w, h, u, t: local, seed: seedOf(`${data.awards.player ?? ""}|credits`), tall }, 0, false);

    // The header: a gold rule draws out under it on frame 0's beat.
    drawRich(ctx, headLines, w / 2, headTop, look);
    const rule = Math.min(maxW, 640 * u) * easeOutCubic(local / (beat * 2));
    ctx.fillStyle = goldGradient(ctx, w / 2 - rule / 2, 0, w / 2 + rule / 2, 0);
    ctx.fillRect(w / 2 - rule / 2, headTop + headH + 12 * u, rule, 4 * u);

    vignette(ctx, w, h, 0.6);
    grain(ctx, w, h, local, u, 0.05);
}
