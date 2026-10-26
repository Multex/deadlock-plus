import { clamp01, easeInOut, easeOutBack, lerp } from "../../../kit/ease";
import type { Ctx, Rect } from "../../../kit/types";
import { INK, goldGradient, room } from "../draw";
import { art, glow, heroArt, type F, type Look } from "./award-paint";

const ROSE = "246 196 176";

function linkedRings(ctx: Ctx, cx: number, cy: number, r: number, apart: number, fill: string | CanvasGradient, u: number): void {
    ctx.strokeStyle = fill;
    ctx.lineWidth = 5 * u;
    for (const dx of [-apart / 2, apart / 2]) {
        ctx.beginPath();
        ctx.arc(cx + dx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
    }
}

/** A pool of rose light sliding across the floor. */
function pool(ctx: Ctx, x: number, y: number, r: number, a: number): void {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(x, y);
    ctx.scale(1, 0.9);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgb(${ROSE} / ${0.22 * a})`);
    g.addColorStop(0.7, `rgb(${ROSE} / ${0.08 * a})`);
    g.addColorStop(1, `rgb(${ROSE} / 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
}

/** Best Supporting Player: two lights that find each other, and velvet name plaques for the people beside you. */
export const supporting: Look = {
    light: ROSE,
    labelled: true,
    titleFill: (f, y0, y1) => {
        const g = f.ctx.createLinearGradient(0, y0, 0, y1);
        g.addColorStop(0, "#fff0e6");
        g.addColorStop(0.5, "#e9b49c");
        g.addColorStop(1, INK.goldDeep);
        return g;
    },
    room(f) {
        const { ctx, u, w, h } = f;
        room(ctx, w, h, 0.5);
        const g = ctx.createLinearGradient(0, h * 0.55, 0, h);
        g.addColorStop(0, "rgb(60 16 22 / 0)");
        g.addColorStop(1, "rgb(60 16 22 / 0.55)");
        ctx.fillStyle = g;
        ctx.fillRect(0, h * 0.55, w, h * 0.45);
        // Two lights wander the back wall, always drawn to each other.
        const y = f.box.y + f.box.h * 0.5;
        const d = (0.25 + 0.12 * Math.sin(f.t * 1.2)) * w;
        pool(ctx, w / 2 - d, y, 420 * u, 0.7);
        pool(ctx, w / 2 + d, y, 420 * u, 0.7);
    },
    title(f, k, cx, cy) {
        const { ctx, u } = f;
        const a = 1 - clamp01((k - 0.85) * 4);
        if (a <= 0) return;
        // Two spots slide in from the wings and meet on the title.
        const meet = easeInOut(clamp01(k / 0.9));
        const d = lerp(f.w * 0.6, 0, meet);
        pool(ctx, cx - d, cy, 380 * u, 1.8 * a);
        pool(ctx, cx + d, cy, 380 * u, 1.8 * a);
        ctx.save();
        ctx.globalAlpha = 0.6 * a * meet;
        linkedRings(ctx, cx, cy - 210 * u, 80 * u, 110 * u, goldGradient(ctx, cx - 150 * u, 0, cx + 150 * u, 0), u * 1.6);
        ctx.restore();
    },
    card(f, r, n, s) {
        const { ctx, u } = f;
        ctx.save();
        ctx.shadowColor = "rgb(0 0 0 / 0.6)";
        ctx.shadowBlur = 30 * u;
        const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
        g.addColorStop(0, "#5a1420");
        g.addColorStop(0.5, "#3a0b14");
        g.addColorStop(1, "#22060b");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(r.x, r.y, r.w, r.h, 26 * u);
        ctx.fill();
        ctx.restore();
        // Velvet nap: faint vertical sheen.
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(r.x, r.y, r.w, r.h, 26 * u);
        ctx.clip();
        for (let i = 0; i < 9; i++) {
            ctx.fillStyle = `rgb(255 200 200 / ${0.025 + 0.02 * Math.sin(i * 1.7 + f.t)})`;
            ctx.fillRect(r.x + (i / 9) * r.w, r.y, r.w / 18, r.h);
        }
        ctx.restore();
        ctx.strokeStyle = goldGradient(ctx, r.x, r.y, r.x + r.w, r.y + r.h);
        ctx.lineWidth = 6 * u;
        ctx.beginPath();
        ctx.roundRect(r.x + 10 * u, r.y + 10 * u, r.w - 20 * u, r.h - 20 * u, 18 * u);
        ctx.stroke();
        // The rings close up as the plaque lands.
        const k = easeOutBack(clamp01((s.landed - 0.1) / 0.4));
        linkedRings(ctx, r.x + r.w / 2, r.y + r.h * 0.2, r.w * 0.11, lerp(r.w * 0.4, r.w * 0.13, k), goldGradient(ctx, r.x, 0, r.x + r.w, 0), u);
        // The name, set as large as the plaque allows.
        const name = n.label ?? "";
        const maxW = r.w * 0.82;
        let px = Math.min(70 * u, r.w * 0.22);
        ctx.font = `700 ${px}px "${f.fonts.display}"`;
        const words = name.split(/\s+/);
        let lines = [name];
        if (ctx.measureText(name).width > maxW) {
            px = Math.max(44 * u, (px * maxW) / ctx.measureText(name).width);
            ctx.font = `700 ${px}px "${f.fonts.display}"`;
            if (ctx.measureText(name).width > maxW && words.length > 1) {
                const half = Math.ceil(words.length / 2);
                lines = [words.slice(0, half).join(" "), words.slice(half).join(" ")];
            }
        }
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = goldGradient(ctx, 0, r.y + r.h * 0.45, 0, r.y + r.h * 0.7);
        const lh = px * 1.05;
        lines.forEach((l, i) => ctx.fillText(l, r.x + r.w / 2, r.y + r.h * 0.58 + (i - (lines.length - 1) / 2) * lh));
    },
    flourish(f, r, dt) {
        glow(f.ctx, r.x + r.w / 2, r.y + r.h * 0.4, r.h * 1.1, ROSE, 0.5 * clamp01(dt / 0.3));
    },
    stamp(f, r, dt) {
        // The player's own hero steps up beside the plaque to share it.
        const img = art(f, f.star, "gloat");
        if (!img) return;
        const k = easeOutBack(clamp01((dt - 0.1) / 0.4));
        const w = r.w * 0.72;
        const h = (w * img.height) / img.width;
        const x = r.x - w * 0.88 + (1 - k) * -80 * f.u;
        const y = r.y + r.h - h * 0.92;
        f.ctx.save();
        f.ctx.globalAlpha = clamp01((dt - 0.1) / 0.2);
        heroArt(f, { x, y, w, h }, img);
        f.ctx.restore();
    },
};
