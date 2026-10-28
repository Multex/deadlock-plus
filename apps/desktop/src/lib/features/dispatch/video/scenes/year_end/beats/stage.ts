import { seeded } from "../../../kit/rng";
import type { Ctx } from "../../../kit/types";
import type { CopyRef, YearEndAwards } from "../data";
import { INK } from "../draw";

/**
 * What every Awards Night beat draws from: the night's data and each of its lines already translated on the main
 * thread (the worker has no i18n), keyed by `lineId`.
 */
export interface Stage {
    awards: YearEndAwards;
    lines: Readonly<Record<string, string>>;
}

/** Two refs to one key differ by count or params (two months with the same wins), so all three make the id. */
export function lineId(ref: CopyRef): string {
    return JSON.stringify([ref.key, ref.count ?? null, ref.params]);
}

export function say(stage: Stage, ref: CopyRef | null | undefined): string {
    return ref ? (stage.lines[lineId(ref)] ?? "") : "";
}

const GROUPED = /\d+(?:[.,'   ’]\d{3})*/g;

/** Where `value` sits in a translated line, however the locale groups its digits; null when it is not there. */
export function numberSpan(text: string, value: number): { start: number; end: number } | null {
    const want = String(Math.round(value));
    for (const m of text.matchAll(GROUPED)) {
        if (m[0].replace(/\D/g, "") === want) return { start: m.index, end: m.index + m[0].length };
    }
    return null;
}

/** `value` grouped the way `token` (the same line's final number) groups its digits, for a count-up. */
export function countedToken(token: string, value: number): string {
    const sep = /\D/.exec(token)?.[0];
    const digits = String(Math.round(value));
    if (!sep) return digits;
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

export interface Run {
    text: string;
    px: number;
    tag?: string;
}

export interface Word {
    text: string;
    px: number;
    tag?: string;
    /** A space sits before it on its line. */
    space: boolean;
    x: number;
    w: number;
}

export interface RichLine {
    words: Word[];
    width: number;
    /** The tallest size on the line. */
    height: number;
}

/**
 * Words of mixed sizes onto lines no wider than `max`. A word that runs across two runs with no space between
 * (a name, then its full stop) never breaks; a word wider than `max` takes a line alone.
 */
export function layoutRich(
    runs: readonly Run[],
    max: number,
    measure: (s: string, px: number, tag?: string) => number,
): RichLine[] {
    const words: Omit<Word, "x" | "w">[] = [];
    let gap = false;
    for (const run of runs) {
        for (const m of run.text.matchAll(/(\s+)|(\S+)/g)) {
            if (m[1]) {
                gap = true;
                continue;
            }
            words.push({ text: m[2], px: run.px, tag: run.tag, space: gap && words.length > 0 });
            gap = false;
        }
    }
    const chunks: (typeof words)[] = [];
    for (const w of words) {
        if (w.space || !chunks.length) chunks.push([w]);
        else chunks.at(-1)!.push(w);
    }
    const lines: RichLine[] = [];
    let line: RichLine | null = null;
    for (const chunk of chunks) {
        const space = measure(" ", chunk[0].px, chunk[0].tag);
        const width = chunk.reduce((n, w) => n + measure(w.text, w.px, w.tag), 0);
        if (!line || (line.words.length && line.width + space + width > max)) {
            line = { words: [], width: 0, height: 0 };
            lines.push(line);
        }
        chunk.forEach((w, i) => {
            const lead = i === 0 && line!.words.length > 0;
            if (lead) line!.width += space;
            const ww = measure(w.text, w.px, w.tag);
            line!.words.push({ ...w, space: lead, x: line!.width, w: ww });
            line!.width += ww;
            line!.height = Math.max(line!.height, w.px);
        });
    }
    return lines;
}

export interface Look {
    family: string;
    weight: number;
    fill: string | CanvasGradient;
    track?: number;
    /** A warm glow behind the letters, in px of blur. */
    glow?: number;
    glowColor?: string;
}

function font(ctx: Ctx, look: Look, px: number): void {
    ctx.font = `${look.weight} ${px}px "${look.family}"`;
    ctx.letterSpacing = `${(look.track ?? 0) * px}px`;
}

export function richMeasure(ctx: Ctx, look: (tag?: string) => Look) {
    return (s: string, px: number, tag?: string) => {
        font(ctx, look(tag), px);
        const w = ctx.measureText(s).width;
        ctx.letterSpacing = "0px";
        return w;
    };
}

/** Lines from `layoutRich` set from `top`, each centred on `x` (or starting or ending at it); returns the block's height. */
export function drawRich(
    ctx: Ctx,
    lines: readonly RichLine[],
    x: number,
    top: number,
    look: (tag?: string) => Look,
    o: { align?: "center" | "left" | "right"; leading?: number } = {},
): number {
    const leading = o.leading ?? 1.08;
    let y = top;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    for (const line of lines) {
        const left = o.align === "left" ? x : o.align === "right" ? x - line.width : x - line.width / 2;
        const base = y + line.height * 0.8;
        for (const w of line.words) {
            const l = look(w.tag);
            font(ctx, l, w.px);
            if (l.glow) {
                ctx.shadowColor = l.glowColor ?? "rgb(255 196 92 / 0.7)";
                ctx.shadowBlur = l.glow;
            }
            ctx.fillStyle = l.fill;
            ctx.fillText(w.text, left + w.x, base);
            ctx.shadowBlur = 0;
            ctx.shadowColor = "transparent";
        }
        ctx.letterSpacing = "0px";
        y += line.height * leading;
    }
    return y - top;
}

export function blockHeight(lines: readonly RichLine[], leading = 1.08): number {
    return lines.reduce((n, l) => n + l.height * leading, 0);
}

/**
 * One marquee bulb: a dark socket, and when lit (0 to 1) a hot white core with a gold bloom added onto the frame.
 */
export function bulb(ctx: Ctx, x: number, y: number, r: number, lit: number): void {
    ctx.fillStyle = "#1b1307";
    ctx.beginPath();
    ctx.arc(x, y, r * 1.15, 0, Math.PI * 2);
    ctx.fill();
    const k = Math.max(0, Math.min(1, lit));
    const glass = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    glass.addColorStop(0, k > 0.05 ? `rgb(255 250 228 / ${0.35 + 0.65 * k})` : "#5a4420");
    glass.addColorStop(1, k > 0.05 ? `rgb(232 170 70 / ${0.5 + 0.5 * k})` : "#2a1f10");
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (k <= 0.05) return;
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    const bloom = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 4.2);
    bloom.addColorStop(0, `rgb(255 214 130 / ${0.55 * k})`);
    bloom.addColorStop(1, "rgb(255 180 80 / 0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(x - r * 4.2, y - r * 4.2, r * 8.4, r * 8.4);
    ctx.globalCompositeOperation = prev;
}

/** A pool of stage light, added onto the frame: an ellipse at (`x`, `y`). */
export function spotlight(ctx: Ctx, x: number, y: number, rx: number, ry: number, alpha: number, warm = true): void {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    const c = warm ? "255 222 160" : "235 240 255";
    g.addColorStop(0, `rgb(${c} / ${0.42 * alpha})`);
    g.addColorStop(0.55, `rgb(${c} / ${0.16 * alpha})`);
    g.addColorStop(1, `rgb(${c} / 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
}

/** A beam from a rig above the frame to a pool at (`x1`, `y1`), widening as it falls, added onto the frame. */
export function beam(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, width: number, alpha: number): void {
    if (alpha <= 0) return;
    const a = Math.atan2(y1 - y0, x1 - x0);
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, `rgb(255 232 180 / ${0.3 * alpha})`);
    g.addColorStop(1, `rgb(255 220 150 / ${0.06 * alpha})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0 + nx * width * 0.08, y0 + ny * width * 0.08);
    ctx.lineTo(x1 + nx * width, y1 + ny * width);
    ctx.lineTo(x1 - nx * width, y1 - ny * width);
    ctx.lineTo(x0 - nx * width * 0.08, y0 - ny * width * 0.08);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

/**
 * A velvet curtain panel hanging in `x..x+w`: deep red folds shaded across their width, swaying by `sway` px at
 * the hem, with a gold fringe along the bottom.
 */
export function curtain(ctx: Ctx, x: number, y: number, w: number, h: number, u: number, sway = 0): void {
    if (w <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = "#2a0508";
    ctx.fillRect(x, y, w, h);
    const fold = 92 * u;
    const g = ctx.createLinearGradient(x, 0, x + fold, 0);
    g.addColorStop(0, "rgb(0 0 0 / 0.55)");
    g.addColorStop(0.3, "rgb(150 26 34 / 0.55)");
    g.addColorStop(0.5, "rgb(196 48 52 / 0.5)");
    g.addColorStop(0.75, "rgb(90 10 18 / 0.4)");
    g.addColorStop(1, "rgb(0 0 0 / 0.55)");
    ctx.fillStyle = g;
    const start = x - (((x % fold) + fold) % fold);
    for (let fx = start; fx < x + w; fx += fold) {
        ctx.save();
        ctx.translate(fx - x, 0);
        ctx.transform(1, 0, sway / Math.max(1, h), 1, 0, 0);
        ctx.fillRect(x, y, fold, h);
        ctx.restore();
    }
    const shade = ctx.createLinearGradient(0, y, 0, y + h);
    shade.addColorStop(0, "rgb(0 0 0 / 0.5)");
    shade.addColorStop(0.35, "rgb(0 0 0 / 0)");
    shade.addColorStop(1, "rgb(0 0 0 / 0.35)");
    ctx.fillStyle = shade;
    ctx.fillRect(x, y, w, h);
    const hem = y + h - 26 * u;
    ctx.fillStyle = INK.goldDeep;
    ctx.fillRect(x, hem, w, 6 * u);
    ctx.fillStyle = INK.gold;
    for (let fx = x + 4 * u; fx < x + w; fx += 9 * u) ctx.fillRect(fx, hem + 6 * u, 3 * u, 20 * u);
    ctx.restore();
}

/** Film grain for frame `t`: a few hundred specks, a fresh pattern every frame of a 30 fps export. */
export function grain(ctx: Ctx, w: number, h: number, t: number, u: number, alpha = 0.06): void {
    const r = seeded(Math.floor(t * 30) * 7919 + 13);
    ctx.fillStyle = `rgb(255 240 210 / ${alpha})`;
    for (let i = 0; i < 360; i++) {
        const s = (1 + r() * 2.2) * u;
        ctx.fillRect(r() * w, r() * h, s, s);
    }
}

export function vignette(ctx: Ctx, w: number, h: number, strength = 0.75): void {
    const r = Math.hypot(w, h) / 2;
    const g = ctx.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r);
    g.addColorStop(0, "rgb(0 0 0 / 0)");
    g.addColorStop(1, `rgb(0 0 0 / ${strength})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
}

/** A stable seed from a string: the same player always gets the same flashes and confetti. */
export function seedOf(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
}
