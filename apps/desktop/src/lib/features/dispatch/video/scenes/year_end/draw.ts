import { seeded } from "../../kit/rng";
import type { Ctx } from "../../kit/types";

/** The Year-End cover and poster inks (their oklch tokens, in sRGB). */
export const INK = {
    room: "#060504",
    black: "#0d0b07",
    band: "#120f0b",
    gold: "#deb866",
    goldDeep: "#9d712d",
    goldInk: "#795209",
    goldFill: "#bd9033",
    cream: "#f4eee0",
    paper: "#eee7d8",
    ink: "#181611",
    inkSoft: "#484137",
} as const;

export function goldGradient(ctx: Ctx, x0: number, y0: number, x1: number, y1: number): CanvasGradient {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "#fff6d0");
    g.addColorStop(0.34, INK.gold);
    g.addColorStop(0.52, "#ad7b2f");
    g.addColorStop(0.68, "#eed592");
    g.addColorStop(1, INK.goldDeep);
    return g;
}

/** Gold sparks thrown from a point by a hit, `dt` seconds after it. */
export function sparks(ctx: Ctx, x: number, y: number, dt: number, u: number, seed: number, count = 12): void {
    if (dt < 0 || dt > 0.7) return;
    const r = seeded(seed);
    const fade = 1 - dt / 0.7;
    ctx.fillStyle = INK.gold;
    for (let i = 0; i < count; i++) {
        const a = r() * Math.PI * 2;
        const v = (260 + r() * 420) * u;
        const d = (v * (1 - Math.exp(-5 * dt))) / 5;
        const size = (3 + r() * 5) * u * fade;
        ctx.globalAlpha = fade;
        ctx.fillRect(x + Math.cos(a) * d - size / 2, y + Math.sin(a) * d + 120 * u * dt * dt - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
}

interface Mote {
    x: number;
    y: number;
    speed: number;
    size: number;
    phase: number;
    rate: number;
}

const MOTES: Mote[] = (() => {
    const r = seeded(1172);
    return Array.from({ length: 70 }, () => ({
        x: r(),
        y: r(),
        speed: 0.012 + r() * 0.03,
        size: 1.5 + r() * 3,
        phase: r() * Math.PI * 2,
        rate: 1 + r() * 3,
    }));
})();

/** Gold dust rising through a dark room; `drift` speeds it up (the riser). */
export function dust(ctx: Ctx, w: number, h: number, t: number, u: number, alpha: number, drift = 0): void {
    if (alpha <= 0) return;
    ctx.fillStyle = INK.gold;
    for (const m of MOTES) {
        const y = (((m.y - t * m.speed * (1 + drift)) % 1) + 1) % 1;
        const glint = 0.25 + 0.75 * Math.abs(Math.sin(t * m.rate + m.phase));
        ctx.globalAlpha = alpha * glint * 0.7;
        const s = m.size * u;
        ctx.fillRect(m.x * w, y * h, s, s);
    }
    ctx.globalAlpha = 1;
}

/** Paper's grain and light: a soft vignette and a sheen across it. */
export function paper(ctx: Ctx, x: number, y: number, w: number, h: number): void {
    ctx.fillStyle = INK.paper;
    ctx.fillRect(x, y, w, h);
    const r = Math.max(w, h);
    const v = ctx.createRadialGradient(x + w / 2, y + h * 0.4, r * 0.3, x + w / 2, y + h * 0.4, r * 0.8);
    v.addColorStop(0, "rgb(120 100 60 / 0)");
    v.addColorStop(1, "rgb(120 100 60 / 0.16)");
    ctx.fillStyle = v;
    ctx.fillRect(x, y, w, h);
    const s = ctx.createLinearGradient(x, y, x + w, y + h);
    s.addColorStop(0, "rgb(255 255 255 / 0.2)");
    s.addColorStop(0.3, "rgb(255 255 255 / 0)");
    s.addColorStop(0.7, "rgb(255 255 255 / 0)");
    s.addColorStop(1, "rgb(255 255 255 / 0.1)");
    ctx.fillStyle = s;
    ctx.fillRect(x, y, w, h);
}

/** A dark room lit from the middle. */
export function room(ctx: Ctx, w: number, h: number, light: number): void {
    ctx.fillStyle = INK.room;
    ctx.fillRect(0, 0, w, h);
    if (light <= 0) return;
    const r = Math.max(w, h);
    const g = ctx.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, r * 0.7);
    g.addColorStop(0, `rgb(70 52 24 / ${0.55 * light})`);
    g.addColorStop(1, "rgb(70 52 24 / 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
}
