import type { Ctx } from "../../kit/types";
import type { SCENE_FONTS } from "../../scene";

export type Fonts = typeof SCENE_FONTS;

export const INK = {
    night: "#07060a",
    gold: "#f1d688",
    goldDeep: "#c9a24a",
    goldDark: "#7a5716",
    cream: "#f4e9cc",
    creamSoft: "#eadbb4",
    paper: "#f6efdc",
    red: "#b3261e",
    up: "#7fd18b",
    down: "#e8776c",
} as const;

const GOLD_STOPS: [number, string][] = [
    [0, "#6e4f14"],
    [0.12, "#c99a3e"],
    [0.24, "#f7e7ae"],
    [0.38, "#b88a33"],
    [0.52, "#e6c56f"],
    [0.6, "#fff6d0"],
    [0.76, "#9a7425"],
    [0.9, "#e6c56f"],
    [1, "#7d5a17"],
];
const RAINBOW = ["#ff8fd0", "#ffd77a", "#8dffcf", "#7fd0ff", "#c49bff", "#ff8fd0"];

export function font(weight: number, size: number, family: string): string {
    return `${weight} ${size}px "${family}"`;
}

/** Shrinks `size` until `text` fits `max`; never below `min`. */
export function fit(ctx: Ctx, text: string, weight: number, size: number, family: string, max: number, min = 8) {
    let s = size;
    ctx.font = font(weight, s, family);
    const width = ctx.measureText(text).width;
    if (width > max) s = Math.max(min, (s * max) / width);
    ctx.font = font(weight, s, family);
    return s;
}

/** A gold foil gradient across `[x0, x1]`, its shine shifted by `shift` (0 to 1). */
export function goldAcross(ctx: Ctx, x0: number, x1: number, shift = 0.3): CanvasGradient {
    const span = (x1 - x0) * 2.4;
    const start = x0 - span * shift * 0.6;
    const g = ctx.createLinearGradient(start, 0, start + span, span * 0.18);
    for (const [o, c] of GOLD_STOPS) g.addColorStop(o, c);
    return g;
}

export function rainbowAcross(ctx: Ctx, x0: number, x1: number, shift: number): CanvasGradient {
    const span = (x1 - x0) * 3;
    const start = x0 - span * shift * 0.66;
    const g = ctx.createLinearGradient(start, 0, start + span, span * 0.3);
    RAINBOW.forEach((c, i) => g.addColorStop(i / (RAINBOW.length - 1), c));
    return g;
}

/**
 * Gold foil type with a rainbow wash and a dark drop, as the cover prints it. `align` and `baseline` are set by
 * the caller's `ctx`.
 */
export function foilText(ctx: Ctx, text: string, x: number, y: number, shift = 0.3, rainbow = 0.35) {
    const w = ctx.measureText(text).width;
    const left = ctx.textAlign === "center" ? x - w / 2 : ctx.textAlign === "right" ? x - w : x;
    ctx.save();
    ctx.fillStyle = "#231803";
    ctx.globalAlpha *= 0.75;
    ctx.fillText(text, x, y + 4);
    ctx.restore();
    ctx.fillStyle = goldAcross(ctx, left, left + w, shift);
    ctx.fillText(text, x, y);
    if (rainbow > 0) {
        ctx.save();
        ctx.globalAlpha *= rainbow;
        ctx.globalCompositeOperation = "soft-light";
        ctx.fillStyle = rainbowAcross(ctx, left, left + w, shift);
        ctx.fillText(text, x, y);
        ctx.restore();
    }
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
}

/** A five-point star of outer radius `r` at the origin. */
export function starPath(ctx: Ctx, r: number, inner = 0.42) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * inner : r;
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
}

/** Draws `image` contained in the square of side `size` centred on (x, y); false when there is none. */
export function drawContained(ctx: Ctx, image: ImageBitmap | undefined, x: number, y: number, size: number) {
    if (!image) return false;
    const s = size / Math.max(image.width, image.height);
    ctx.drawImage(image, x - (image.width * s) / 2, y - (image.height * s) / 2, image.width * s, image.height * s);
    return true;
}

/** A rank diamond in the tier's colour, for a badge without art. */
export function badgeFallback(ctx: Ctx, x: number, y: number, size: number, color: string) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    const s = size * 0.42;
    const g = ctx.createLinearGradient(-s, -s, s, s);
    g.addColorStop(0, "#fff");
    g.addColorStop(0.35, color);
    g.addColorStop(1, "#000");
    ctx.fillStyle = g;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.strokeStyle = INK.gold;
    ctx.lineWidth = size * 0.02;
    ctx.strokeRect(-s / 2, -s / 2, s, s);
    ctx.restore();
}

export const mix = (a: number, b: number, p: number) => a + (b - a) * p;
