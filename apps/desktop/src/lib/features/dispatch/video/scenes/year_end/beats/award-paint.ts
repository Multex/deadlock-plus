import type { SceneAssets } from "../../../scene";
import { feathered } from "../../../kit/bitmap";
import { clamp01, easeOutCubic } from "../../../kit/ease";
import { seeded } from "../../../kit/rng";
import type { Bitmap, Ctx, Rect } from "../../../kit/types";
import type { Award, Nominee } from "../data";
import { INK } from "../draw";
import type { AwardTimes } from "./award-kit";
import type { Stage } from "./stage";

/** One frame of an award beat: where it is, what it shows and how far it has got. */
export interface F {
    ctx: Ctx;
    /** Seconds into the beat. */
    t: number;
    span: number;
    w: number;
    h: number;
    u: number;
    box: Rect;
    safe: { top: number; bottom: number };
    tall: boolean;
    wide: boolean;
    /** A bar and a beat, in seconds. */
    B: number;
    b: number;
    at: AwardTimes;
    award: Award;
    stage: Stage;
    images: SceneAssets["images"];
    fonts: SceneAssets["fonts"];
    seed: number;
    /** The player's own most played hero, for the faces a category pulls on the player. */
    star: number | null;
    /** Where the header's last line ends, once the title has laid itself out this frame. */
    headBottom?: number;
}

/** How a nominee card stands at this frame. */
export interface CardState {
    winner: boolean;
    /** Seconds since the card landed; negative before. */
    landed: number;
    /** 0 before the spotlight finds the winner, 1 once it has. */
    revealed: number;
    /** The nominee's place in the data: 0 is the winner. */
    index: number;
}

/**
 * A category's own look. Every award runs the same ceremony, but the room, the title card, the nominee object and
 * the winner's flourish are the category's, so no two awards in a night look alike.
 */
export interface Look {
    /** The colour the category lights its room with, as "r g b". */
    light: string;
    titleFill: (f: F, y0: number, y1: number) => string | CanvasGradient;
    /** The room behind everything; `k` is the beat's progress from 0 to 1. */
    room: (f: F) => void;
    /** The title card's set piece, while the title holds the frame (`k` from 0 to 1, then on to 1). */
    title: (f: F, k: number, cx: number, cy: number) => void;
    card: (f: F, r: Rect, n: Nominee, s: CardState) => void;
    /** Whether the card carries the nominee's label itself, so none is set under it. */
    labelled?: boolean;
    /** The winner's headline: its label (a name), or its line when the label is only a date the card already shows. */
    headline?: "label" | "line";
    /** Behind the winner's card once the spotlight finds it, `dt` seconds on. */
    flourish: (f: F, r: Rect, dt: number) => void;
    /** In front of the winner's card once the spotlight finds it. */
    stamp?: (f: F, r: Rect, dt: number) => void;
    /** How far the card's frame stands outside its box, in content units, so neighbours keep a clean gutter. */
    bleed?: number;
    /** Cards come up from under the stage instead of dropping in. */
    rise?: boolean;
    /** Where the spotlights hang: the rig above, or footlights below. */
    from?: "above" | "below";
    /** The title's light, 0 to 1, for a category whose title stutters on. */
    flicker?: (f: F) => number;
}

/** The face a hero card shows: the plain card until the reveal, then smug for the winner and beaten for the rest. */
export function face(f: F, n: Nominee, s: CardState): Bitmap | null {
    return art(f, n.heroId, s.revealed > 0.5 ? (s.winner ? "gloat" : "critical") : null);
}

export const since = (f: F, at: number) => f.t - at;

export function art(f: F, heroId: number | null, mood: "gloat" | "critical" | null): Bitmap | null {
    if (heroId === null) return null;
    const img = (mood && f.images[`mood:${heroId}:${mood}`]) || f.images[`hero:${heroId}`];
    return img ?? null;
}

/** The hero card art cut to `r`, its edges feathered; a plain bust silhouette when there is no art. */
export function heroArt(f: F, r: Rect, img: Bitmap | null, alpha = 1): void {
    const { ctx } = f;
    ctx.save();
    ctx.globalAlpha *= alpha;
    if (img) {
        const k = Math.max(r.w / img.width, r.h / img.height);
        const w = img.width * k;
        const h = img.height * k;
        ctx.drawImage(feathered(img), r.x + (r.w - w) / 2, r.y + r.h - h, w, h);
    } else bust(ctx, r, "#2a2116");
    ctx.restore();
}

/** A head-and-shoulders shape filling the bottom of `r`. */
export function bust(ctx: Ctx, r: Rect, fill: string): void {
    const cx = r.x + r.w / 2;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(cx, r.y + r.h * 0.42, r.w * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(r.x + r.w * 0.08, r.y + r.h);
    ctx.quadraticCurveTo(r.x + r.w * 0.12, r.y + r.h * 0.66, cx, r.y + r.h * 0.64);
    ctx.quadraticCurveTo(r.x + r.w * 0.88, r.y + r.h * 0.66, r.x + r.w * 0.92, r.y + r.h);
    ctx.closePath();
    ctx.fill();
}

export function rgba(rgb: string, a: number): string {
    return `rgb(${rgb} / ${Math.max(0, Math.min(1, a))})`;
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
}

/** A soft glow added onto the frame round a point. */
export function glow(ctx: Ctx, x: number, y: number, r: number, rgb: string, a: number): void {
    if (a <= 0 || r <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(rgb, a));
    g.addColorStop(1, rgba(rgb, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
}

/** Rays turning slowly behind a point: the trophy shine. */
export function rays(f: F, x: number, y: number, r: number, rgb: string, a: number, n = 18, turn = 0.15): void {
    if (a <= 0) return;
    const { ctx } = f;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(x, y);
    ctx.rotate(f.t * turn);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, rgba(rgb, 0.32 * a));
    g.addColorStop(1, rgba(rgb, 0));
    ctx.fillStyle = g;
    for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = a0 + (Math.PI / n) * 0.55;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, r, a0, a1);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
}

/** What the house needs of a frame; a beat outside the awards passes just these. */
export type House = Pick<F, "ctx" | "w" | "h" | "u" | "t" | "seed" | "tall">;

/**
 * The house: rows of heads and shoulders along the bottom of the frame, rim-lit by the stage. `up` (0 to 1) stands
 * them for an ovation and `full` fills the seats. On a phone the house is closer and deeper, filling the bottom of
 * the frame under the caption band.
 */
export function crowd(f: House, up: number, full: boolean): void {
    const { ctx, w, h, u } = f;
    const r = seeded(f.seed ^ 0x51ed);
    const rows = (full ? 2 : 1) + (f.tall ? 1 : 0);
    const near = f.tall ? 1.75 : 1;
    if (full && up > 0) {
        // The house lights come up on the ovation.
        const top = h * 0.72;
        const g = ctx.createLinearGradient(0, top, 0, h);
        g.addColorStop(0, "rgb(120 84 30 / 0)");
        g.addColorStop(1, `rgb(120 84 30 / ${0.45 * up})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, top, w, h - top);
    }
    const base = f.tall ? h : h + 30 * u;
    for (let row = rows - 1; row >= 0; row--) {
        const size = (full ? 64 : 54) * u * near * (1 - row * 0.18);
        const step = size * 1.5;
        const y0 = base - row * size * 1.1;
        for (let x = -step / 2 + (row * step) / 2; x < w + step; x += step) {
            const jitter = (r() - 0.5) * size * 0.5;
            const bob = up > 0 ? Math.max(0, Math.sin(f.t * 9 + x * 0.013)) * 10 * u * up : 0;
            const hy = y0 - size * (1.05 + r() * 0.25) - up * size * 0.45 - bob;
            ctx.fillStyle = row === 0 ? "#050403" : "#0b0906";
            ctx.beginPath();
            ctx.ellipse(x + jitter, hy, size * 0.36, size * 0.44, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.roundRect(x + jitter - size * 0.72, hy + size * 0.36, size * 1.44, size * 2, size * 0.5);
            ctx.fill();
            if (row === 0) {
                ctx.strokeStyle = `rgb(222 184 102 / ${0.22 + 0.4 * up})`;
                ctx.lineWidth = 2 * u;
                ctx.beginPath();
                ctx.ellipse(x + jitter, hy, size * 0.36, size * 0.44, 0, Math.PI * 1.1, Math.PI * 1.9);
                ctx.stroke();
            }
            if (up > 0 && r() < 0.28) {
                // Hands up, clapping.
                const clap = Math.abs(Math.sin(f.t * 14 + x)) * 6 * u;
                ctx.fillStyle = row === 0 ? "#050403" : "#0b0906";
                ctx.fillRect(
                    x + jitter - size * 0.5 - clap,
                    hy - size * 0.9 * up,
                    size * 0.22,
                    size * 0.9 * up + size * 0.4,
                );
                ctx.fillRect(
                    x + jitter + size * 0.28 + clap,
                    hy - size * 0.9 * up,
                    size * 0.22,
                    size * 0.9 * up + size * 0.4,
                );
            }
        }
    }
}

/**
 * The front of the stage on a phone: a gold-trimmed lip under the caption band with a row of footlights, the boards
 * above it catching the category's light, brighter once the winner is lit (`lit`, 0 to 1).
 */
export function apron(f: F, light: string, lit: number): void {
    const { ctx, w, h, u } = f;
    const lip = f.safe.bottom + 40 * u;
    const boards = ctx.createLinearGradient(0, lip - 300 * u, 0, lip);
    boards.addColorStop(0, rgba(light, 0));
    boards.addColorStop(1, rgba(light, 0.08 + 0.1 * lit));
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = boards;
    ctx.fillRect(0, lip - 300 * u, w, 300 * u);
    ctx.restore();
    const face = ctx.createLinearGradient(0, lip, 0, h);
    face.addColorStop(0, "#1a1007");
    face.addColorStop(0.25, "#0a0603");
    face.addColorStop(1, "#030201");
    ctx.fillStyle = face;
    ctx.fillRect(0, lip, w, h - lip);
    // Spill from the stage hazes the house, so the audience reads as silhouettes against it.
    const haze = ctx.createLinearGradient(0, lip, 0, h);
    haze.addColorStop(0, rgba(light, 0.2 + 0.12 * lit));
    haze.addColorStop(0.5, rgba(light, 0.1 + 0.06 * lit));
    haze.addColorStop(1, rgba(light, 0.04));
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = haze;
    ctx.fillRect(0, lip, w, h - lip);
    ctx.restore();
    ctx.fillStyle = INK.goldDeep;
    ctx.fillRect(0, lip, w, 7 * u);
    ctx.fillStyle = INK.gold;
    ctx.fillRect(0, lip, w, 2 * u);
    const step = 96 * u;
    for (let x = step / 2; x < w; x += step) {
        ctx.fillStyle = "#2a1c0a";
        ctx.beginPath();
        ctx.ellipse(x, lip + 26 * u, 26 * u, 10 * u, 0, 0, Math.PI * 2);
        ctx.fill();
        glow(ctx, x, lip + 18 * u, 70 * u, light, 0.35 + 0.35 * lit);
        ctx.fillStyle = rgba("255 244 214", 0.7 + 0.3 * lit);
        ctx.beginPath();
        ctx.ellipse(x, lip + 20 * u, 12 * u, 5 * u, 0, 0, Math.PI * 2);
        ctx.fill();
    }
}

/** Camera flashes popping in the house after the reveal; more of them for the night's biggest award. */
export function flashbulbs(f: F, from: number, count: number): void {
    const dt = f.t - from;
    if (dt < 0) return;
    const r = seeded(f.seed ^ 0xf1a5);
    const top = f.tall ? f.h * 0.78 : f.h * 0.8;
    for (let i = 0; i < count; i++) {
        const x = r() * f.w;
        const y = top + r() * (f.h - top);
        const at = r() * 2.6;
        const k = dt - at;
        if (k < 0 || k > 0.25) continue;
        const a = 1 - k / 0.25;
        glow(f.ctx, x, y, 70 * f.u, "255 250 235", 0.9 * a);
        f.ctx.fillStyle = `rgb(255 255 255 / ${a})`;
        f.ctx.fillRect(x - 3 * f.u, y - 3 * f.u, 6 * f.u, 6 * f.u);
    }
}

/** Gold foil streamers falling from the rig after the night's last envelope. */
export function streamers(f: F, from: number): void {
    const dt = f.t - from;
    if (dt < 0) return;
    const { ctx, u } = f;
    const r = seeded(f.seed ^ 0x57ae);
    for (let i = 0; i < 30; i++) {
        const x0 = r() * f.w;
        const speed = (380 + r() * 420) * u;
        const delay = r() * 0.5;
        const len = (60 + r() * 90) * u;
        const phase = r() * Math.PI * 2;
        const k = dt - delay;
        if (k < 0) continue;
        const y = -len + speed * k;
        if (y > f.h + len) continue;
        const sway = Math.sin(k * 3 + phase) * 40 * u;
        const twist = Math.abs(Math.cos(k * 7 + phase));
        ctx.save();
        ctx.translate(x0 + sway, y);
        ctx.rotate(Math.sin(k * 2 + phase) * 0.6);
        const g = ctx.createLinearGradient(0, 0, 0, len);
        g.addColorStop(0, "#fff2c4");
        g.addColorStop(0.5, i % 3 === 0 ? INK.goldDeep : INK.gold);
        g.addColorStop(1, "#fff2c4");
        ctx.fillStyle = g;
        ctx.globalAlpha = 0.6 + 0.4 * twist;
        ctx.beginPath();
        const wv = 26 * u * (0.25 + twist);
        for (let s = 0; s <= 8; s++) {
            const yy = (s / 8) * len;
            ctx.lineTo(Math.sin(s * 0.5 + k * 4) * 7 * u, yy);
        }
        for (let s = 8; s >= 0; s--) {
            const yy = (s / 8) * len;
            ctx.lineTo(Math.sin(s * 0.5 + k * 4) * 7 * u + wv, yy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}

/**
 * The envelope, risen to (`cx`, `cy`). It tears on `tear` (seconds since the tear, negative before): the top strip
 * rips off and flies, and the card inside rides up.
 */
export function envelope(f: F, cx: number, cy: number, scale: number, tear: number, rgb: string): void {
    const { ctx, u } = f;
    const w = 440 * u * scale;
    const h = 270 * u * scale;
    const x = cx - w / 2;
    const y = cy - h / 2;
    const torn = tear >= 0;
    const strip = 46 * u * scale;
    const teeth = 11;
    const edge = (yy: number) => (i: number) => yy + (i % 2 ? 1 : -1) * 7 * u * scale;

    ctx.save();
    ctx.shadowColor = "rgb(0 0 0 / 0.6)";
    ctx.shadowBlur = 40 * u;
    ctx.shadowOffsetY = 18 * u;

    // The card inside: cream with a gold star, riding up once the top is off.
    if (torn) {
        const rise = easeOutCubic(clamp01(tear / 0.35)) * h * 0.42;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x - w, y - h * 2, w * 3, h * 2 + strip + 2);
        ctx.rect(x, y, w, h);
        ctx.clip();
        const cw = w * 0.86;
        const ch = h * 0.8;
        ctx.fillStyle = INK.cream;
        ctx.fillRect(cx - cw / 2, y + strip * 0.4 - rise, cw, ch);
        star(ctx, cx, y + strip * 0.4 - rise + ch * 0.34, 34 * u * scale, INK.gold);
        ctx.restore();
    }

    // The body, its back flap and the line where the top tears.
    const body = ctx.createLinearGradient(x, y, x + w, y + h);
    body.addColorStop(0, "#f3dc9a");
    body.addColorStop(0.45, INK.gold);
    body.addColorStop(1, INK.goldDeep);
    ctx.fillStyle = body;
    ctx.beginPath();
    if (torn) {
        ctx.moveTo(x, edge(y + strip)(0));
        for (let i = 1; i <= teeth; i++) ctx.lineTo(x + (w * i) / teeth, edge(y + strip)(i));
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
    } else ctx.rect(x, y, w, h);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "rgb(90 60 20 / 0.45)";
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(cx, y + h * 0.52);
    ctx.lineTo(x + w, y + h);
    ctx.stroke();
    // The wax seal.
    ctx.fillStyle = `rgb(${rgb})`;
    ctx.beginPath();
    ctx.arc(cx, y + h * 0.56, 30 * u * scale, 0, Math.PI * 2);
    ctx.fill();
    star(ctx, cx, y + h * 0.56, 15 * u * scale, "rgb(255 240 200 / 0.85)");

    // The strip: on the envelope until the tear, then flying off and turning.
    const fly = torn ? clamp01(tear / 0.5) : 0;
    if (fly < 1) {
        ctx.save();
        ctx.translate(x + w * 0.85, y);
        ctx.translate(fly * 260 * u, -fly * 320 * u + fly * fly * 200 * u);
        ctx.rotate(fly * 1.4);
        ctx.globalAlpha = 1 - fly * fly;
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.moveTo(-w * 0.85, 0);
        ctx.lineTo(w * 0.15, 0);
        ctx.lineTo(w * 0.15, edge(strip)(teeth));
        for (let i = teeth - 1; i >= 0; i--) ctx.lineTo(-w * 0.85 + (w * i) / teeth, edge(strip)(i));
        ctx.closePath();
        ctx.fill();
        if (!torn) {
            ctx.setLineDash([8 * u, 7 * u]);
            ctx.strokeStyle = "rgb(90 60 20 / 0.5)";
            ctx.beginPath();
            ctx.moveTo(-w * 0.85, strip);
            ctx.lineTo(w * 0.15, strip);
            ctx.stroke();
        }
        ctx.restore();
    }
    ctx.restore();
}

export function star(ctx: Ctx, x: number, y: number, r: number, fill: string | CanvasGradient, rot = 0): void {
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.45 : r;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
}
