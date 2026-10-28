import { seeded } from "../../../kit/rng";
import { setFont, wrap } from "../../../kit/text";
import type { Ctx } from "../../../kit/types";
import type { SceneAssets } from "../../../scene";
import type { CardStage } from "./card";

/**
 * The dark velvet the pack is opened over: a warm key light above the card, specks of light drifting through it,
 * the corners falling off to black. `glow` (0 to 1+) brightens the key for a reveal.
 */
export function drawTable(ctx: Ctx, st: CardStage, t: number, glow = 0): void {
    const { w, h } = st;
    ctx.fillStyle = "#07060a";
    ctx.fillRect(0, 0, w, h);
    const r = Math.max(w, h);
    const key = ctx.createRadialGradient(st.card.x, st.card.y - h * 0.2, 0, st.card.x, st.card.y, r * 0.75);
    key.addColorStop(0, `rgb(120 62 44 / ${0.55 + 0.3 * glow})`);
    key.addColorStop(0.35, "rgb(52 22 30 / 0.6)");
    key.addColorStop(1, "rgb(7 6 10 / 0)");
    ctx.fillStyle = key;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = "#f1d688";
    ctx.lineWidth = Math.max(1, st.u);
    for (let y = 0; y < h; y += 6 * st.u) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y + 40 * st.u);
        ctx.stroke();
    }
    ctx.restore();

    const rng = seeded(1105);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 46; i++) {
        const x0 = rng() * w;
        const y0 = rng() * h;
        const speed = 8 + rng() * 22;
        const size = (2 + rng() * 9) * st.u;
        const x = (x0 + Math.sin(t * 0.3 + i) * 30 * st.u + w) % w;
        const y = (((y0 - t * speed * st.u) % h) + h) % h;
        const a = 0.05 + 0.12 * rng();
        const g = ctx.createRadialGradient(x, y, 0, x, y, size);
        g.addColorStop(0, `rgb(255 214 150 / ${a})`);
        g.addColorStop(1, "rgb(255 214 150 / 0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - size, y - size, size * 2, size * 2);
    }
    ctx.restore();

    const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, r * 0.75);
    v.addColorStop(0, "rgb(0 0 0 / 0)");
    v.addColorStop(1, "rgb(0 0 0 / 0.75)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
}

/** Rays of light fanning out from (x, y), added over the scene: the burst behind a revealed card. */
export function drawRays(
    ctx: Ctx,
    x: number,
    y: number,
    radius: number,
    strength: number,
    spin: number,
    tint: string,
): void {
    if (strength <= 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(x, y);
    ctx.rotate(spin);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    g.addColorStop(0, tint);
    g.addColorStop(1, "rgb(0 0 0 / 0)");
    ctx.fillStyle = g;
    ctx.globalAlpha = Math.min(1, strength);
    const n = 16;
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, a, a + Math.PI / n / (i % 2 ? 2.2 : 1.3));
        ctx.closePath();
        ctx.fill();
    }
    ctx.globalAlpha = Math.min(1, strength) * 0.6;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

/** A four-point sparkle, the glint on foil. */
export function drawSparkle(ctx: Ctx, x: number, y: number, r: number, alpha: number): void {
    if (alpha <= 0.01 || r <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.fillStyle = "#fffaf0";
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r * 0.22, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r * 0.22, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.moveTo(x - r * 0.7, y);
    ctx.quadraticCurveTo(x, y, x, y + r * 0.16);
    ctx.quadraticCurveTo(x, y, x + r * 0.7, y);
    ctx.quadraticCurveTo(x, y, x, y - r * 0.16);
    ctx.quadraticCurveTo(x, y, x - r * 0.7, y);
    ctx.fill();
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 0.5);
    g.addColorStop(0, "rgb(255 250 230 / 0.9)");
    g.addColorStop(1, "rgb(255 250 230 / 0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
}

export interface Caption {
    lines: string[];
    px: number;
    lead: number;
}

/** Wraps `str` at `px` (never smaller) to `maxW`; the display face, set in caps. */
export function caption(
    ctx: Ctx,
    str: string,
    px: number,
    maxW: number,
    fonts: SceneAssets["fonts"],
    body = false,
): Caption {
    setFont(
        ctx,
        body ? { family: fonts.body, weight: 600, px } : { family: fonts.display, weight: 700, px, track: 0.01 },
    );
    const text = body ? str : str.toUpperCase();
    return { lines: wrap(ctx, text, maxW), px, lead: px * (body ? 1.2 : 1.02) };
}

/** Sets a wrapped caption with a soft drop, from its top-left (or top-centre with `center`). */
export function drawCaption(
    ctx: Ctx,
    c: Caption,
    x: number,
    y: number,
    fill: string | CanvasGradient,
    fonts: SceneAssets["fonts"],
    opts: { body?: boolean; center?: boolean; alpha?: number } = {},
): void {
    if ((opts.alpha ?? 1) <= 0) return;
    ctx.save();
    ctx.globalAlpha *= opts.alpha ?? 1;
    setFont(
        ctx,
        opts.body
            ? { family: fonts.body, weight: 600, px: c.px }
            : { family: fonts.display, weight: 700, px: c.px, track: 0.01 },
    );
    ctx.textAlign = opts.center ? "center" : "left";
    ctx.textBaseline = "top";
    c.lines.forEach((l, i) => {
        ctx.fillStyle = "rgb(0 0 0 / 0.6)";
        ctx.fillText(l, x, y + i * c.lead + c.px * 0.05);
        ctx.fillStyle = fill;
        ctx.fillText(l, x, y + i * c.lead);
    });
    ctx.letterSpacing = "0px";
    ctx.restore();
}
