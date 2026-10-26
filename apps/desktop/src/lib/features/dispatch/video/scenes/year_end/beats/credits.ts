import { countUp } from "../../../kit/count";
import { clamp01, easeOutCubic } from "../../../kit/ease";
import { sceneFrame } from "../../../kit/frame";
import type { Ctx } from "../../../kit/types";
import type { SceneAssets, SceneSize } from "../../../scene";
import type { CreditRow } from "../data";
import { INK, dust, goldGradient } from "../draw";
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
    spotlight,
    vignette,
    type Look,
    type RichLine,
    type Run,
    type Stage,
} from "./stage";

/** Content units a second the credits rise: a film's end-credit pace, the same from the first frame to the last. */
export const ROLL_SPEED = 84;
/** The fastest a roll may go and still be read on a phone. */
export const ROLL_CAP = 120;
/** Content units between two billings: room enough that only a few share the frame. */
const GAP = 170;

/** Which billing goes first when the beat cannot roll them all; the rest are dropped, not rushed. */
const BILLING = ["starring", "matches", "featuring", "hours", "villain", "with", "days", "heroes"];

/**
 * The rows the roll has time for: the most important first (`priority[i]`, low is first) as long as, stacked `gap`
 * apart in billing order, the last one's top stays within `budget` of the first's. The first billing always plays.
 */
export function pickRows(
    heights: readonly number[],
    priority: readonly number[],
    budget: number,
    gap: number,
): number[] {
    const order = heights.map((_, i) => i).sort((a, b) => priority[a]! - priority[b]! || a - b);
    const lastTop = (rows: number[]) => rows.slice(0, -1).reduce((n, i) => n + heights[i]! + gap, 0);
    let kept: number[] = [];
    for (const i of order) {
        const next = [...kept, i].sort((a, b) => a - b);
        if (kept.length && lastTop(next) > budget) continue;
        kept = next;
    }
    return kept;
}

interface Block {
    row: CreditRow;
    lines: RichLine[];
    /** The label's lines: above the names, or left of them in 16:9. */
    labelLines: RichLine[];
    height: number;
    numberToken: string | null;
}

const slotOf = (row: CreditRow) => row.text.key.split(".").pop()!.replace(/_\d+$/, "");

/**
 * The year's totals as end credits: the header holds while the cast rolls up the frame at one slow, steady speed,
 * a few billings at a time, each total counting up as it comes into view.
 */
export function draw(ctx: Ctx, local: number, span: number, size: SceneSize, data: Stage, assets: SceneAssets): void {
    const { w, h } = size;
    const { u, safe } = sceneFrame(w, h);
    const tall = h > w * 1.2;
    const wide = w > h * 1.2;
    const fonts = assets.fonts;

    ctx.fillStyle = "#050403";
    ctx.fillRect(0, 0, w, h);
    // A projector's beam through the haze, flickering like film, lighting the whole height of the roll.
    beam(ctx, w / 2, -80 * u, w / 2, h + 80 * u, w * (tall ? 0.5 : 0.32), 0.34 * (0.85 + 0.15 * Math.sin(local * 37)));
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

    const all: Block[] = data.awards.credits.rows.map((row) => {
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
                lines,
                labelLines: [],
                height: blockHeight(lines),
                numberToken: at ? text.slice(at.start, at.end) : null,
            };
        }
        const names = row.names.flatMap((n) => layoutRich([{ text: n, px: namePx, tag: "name" }], colW, measure));
        const labelLines = layoutRich([{ text: text.toLocaleUpperCase(), px: labelPx, tag: "label" }], colW, measure);
        const height = wide
            ? Math.max(blockHeight(names, 1.02), blockHeight(labelLines))
            : blockHeight(labelLines) + 14 * u + blockHeight(names, 1.02);
        return { row, lines: names, labelLines, height, numberToken: null };
    });

    const header = say(data, data.awards.credits.title).toLocaleUpperCase();
    const headLines = layoutRich([{ text: header, px: headPx, tag: "head" }], maxW, measure);
    const headTop = tall ? safe.top + 10 * u : 50 * u;
    const headH = blockHeight(headLines);
    const regionTop = headTop + headH + 40 * u;
    const bandBottom = tall ? safe.bottom : h - 40 * u;
    const fadeTop = 150 * u;

    // Frame 0 joins the roll already running: the first billing just under the header's shadow.
    const start = regionTop + fadeTop + 30 * u;
    const rise = ROLL_SPEED * u * local;
    const gap = GAP * u;
    // Every billing that plays comes up into the frame before the beat ends; the roll is cut there, as a film's is.
    const budget = h - 160 * u - start + ROLL_SPEED * u * span;
    const keep = pickRows(
        all.map((b) => b.height),
        all.map((b) => {
            const i = BILLING.indexOf(slotOf(b.row));
            return i < 0 ? BILLING.length : i;
        }),
        budget,
        gap,
    );
    const blocks = keep.map((i) => all[i]!);

    spotlight(ctx, w / 2, (regionTop + bandBottom) / 2, maxW * 0.7, (bandBottom - regionTop) * 0.5, 0.45);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, regionTop, w, h - regionTop);
    ctx.clip();
    let y = start - rise;
    for (const b of blocks) {
        const top = y;
        y += b.height + gap;
        if (top > h || top + b.height < regionTop) continue;
        // Billings fade out under the header and in at the frame's foot; everywhere else they are in full light.
        const cy = top + b.height / 2;
        const alpha = clamp01((cy - regionTop) / fadeTop) * clamp01((h - top) / (90 * u));
        if (alpha <= 0) continue;
        ctx.globalAlpha = alpha;
        if (b.row.figure && b.numberToken) {
            // The total counts up from the moment its row comes up into the frame.
            const enter = (top + rise - h) / (ROLL_SPEED * u);
            const shown = countUp(b.row.figure.value, local, enter, enter + 1.4);
            if (shown === 0) continue;
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
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // The header: a gold rule draws out under it over the first half bar.
    drawRich(ctx, headLines, w / 2, headTop, look);
    const beat = assets.timing.barSeconds > 0 ? assets.timing.barSeconds / 4 : span / 16;
    const rule = Math.min(maxW, 640 * u) * easeOutCubic(local / (beat * 2));
    ctx.fillStyle = goldGradient(ctx, w / 2 - rule / 2, 0, w / 2 + rule / 2, 0);
    ctx.fillRect(w / 2 - rule / 2, headTop + headH + 12 * u, rule, 4 * u);

    vignette(ctx, w, h, 0.45);
    grain(ctx, w, h, local, u, 0.05);
}
