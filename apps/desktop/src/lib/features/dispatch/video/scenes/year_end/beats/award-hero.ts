import { clamp01, easeOutCubic } from "../../../kit/ease";
import type { Ctx, Rect } from "../../../kit/types";
import { INK, goldGradient, room, sparks } from "../draw";
import { face, glow, heroArt, rays, type F, type Look } from "./award-paint";

/** A statuette on a stepped base: the night's trophy, drawn in gold, standing on (`x`, `y`). */
export function statuette(ctx: Ctx, x: number, y: number, h: number, fill: string | CanvasGradient): void {
    const s = h / 100;
    ctx.fillStyle = fill;
    ctx.beginPath();
    // Base: two steps.
    ctx.rect(x - 16 * s, y - 8 * s, 32 * s, 8 * s);
    ctx.rect(x - 12 * s, y - 15 * s, 24 * s, 7 * s);
    ctx.fill();
    // Body: a tall figure, arms crossed over a sword, head bowed.
    ctx.beginPath();
    ctx.moveTo(x - 7 * s, y - 15 * s);
    ctx.bezierCurveTo(x - 9 * s, y - 40 * s, x - 6 * s, y - 62 * s, x - 9 * s, y - 72 * s);
    ctx.bezierCurveTo(x - 10 * s, y - 80 * s, x - 4 * s, y - 82 * s, x - 3 * s, y - 84 * s);
    ctx.lineTo(x + 3 * s, y - 84 * s);
    ctx.bezierCurveTo(x + 4 * s, y - 82 * s, x + 10 * s, y - 80 * s, x + 9 * s, y - 72 * s);
    ctx.bezierCurveTo(x + 6 * s, y - 62 * s, x + 9 * s, y - 40 * s, x + 7 * s, y - 15 * s);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, y - 90 * s, 5.2 * s, 6.4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgb(0 0 0 / 0.25)";
    ctx.fillRect(x - 0.8 * s, y - 70 * s, 1.6 * s, 52 * s);
}

/** A gilt frame with a mitred inner edge and a diamond on each corner. */
export function giltFrame(ctx: Ctx, r: Rect, u: number): void {
    const b = 12 * u;
    ctx.fillStyle = goldGradient(ctx, r.x, r.y, r.x + r.w, r.y + r.h);
    ctx.fillRect(r.x - b, r.y - b, r.w + 2 * b, r.h + 2 * b);
    ctx.fillStyle = INK.black;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = "rgb(60 40 10 / 0.6)";
    ctx.lineWidth = 2 * u;
    ctx.strokeRect(r.x - b * 0.45, r.y - b * 0.45, r.w + b * 0.9, r.h + b * 0.9);
    for (const [cx, cy] of [
        [r.x - b / 2, r.y - b / 2],
        [r.x + r.w + b / 2, r.y - b / 2],
        [r.x - b / 2, r.y + r.h + b / 2],
        [r.x + r.w + b / 2, r.y + r.h + b / 2],
    ] as const) {
        ctx.fillStyle = "#fff3c8";
        ctx.beginPath();
        ctx.moveTo(cx, cy - b);
        ctx.lineTo(cx + b, cy);
        ctx.lineTo(cx, cy + b);
        ctx.lineTo(cx - b, cy);
        ctx.closePath();
        ctx.fill();
    }
}

/** Hero of the Year: a gold proscenium, the statuette rising behind the title, gilt-framed portraits. */
export const hero: Look = {
    bleed: 18,
    light: "255 214 140",
    titleFill: (f, y0, y1) => goldGradient(f.ctx, 0, y0, 0, y1),
    room(f) {
        const { ctx, u, w, h } = f;
        room(ctx, w, h, 0.85);
        // The proscenium: two gilt pillars and a sunburst crown over the stage.
        const top = f.tall ? f.box.y - 120 * u : 30 * u;
        const inset = f.wide ? f.w * 0.08 : 26 * u;
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = goldGradient(ctx, 0, top, 0, h);
        ctx.lineWidth = 6 * u;
        ctx.strokeRect(inset, top, w - 2 * inset, h - top + 10 * u);
        ctx.lineWidth = 2 * u;
        ctx.strokeRect(inset + 16 * u, top + 16 * u, w - 2 * inset - 32 * u, h - top);
        ctx.globalAlpha = 0.22;
        for (let i = 0; i < 15; i++) {
            const a = Math.PI + (i / 14) * Math.PI;
            ctx.beginPath();
            ctx.moveTo(w / 2, top + 16 * u);
            ctx.lineTo(w / 2 + Math.cos(a) * 260 * u, top + 16 * u - Math.sin(a) * 150 * u);
            ctx.stroke();
        }
        ctx.restore();
    },
    title(f, k, cx, cy) {
        const { ctx, u } = f;
        const a = 1 - clamp01((k - 0.9) * 3);
        if (a <= 0) return;
        const rise = easeOutCubic(clamp01(k / 0.8));
        const base = cy + 330 * u + (1 - rise) * 500 * u;
        rays(f, cx, cy - 40 * u, 760 * u, "255 214 140", a * rise, 22, 0.25);
        ctx.save();
        ctx.globalAlpha = 0.85 * a;
        statuette(ctx, cx, base, 640 * u, goldGradient(ctx, cx - 60 * u, base - 640 * u, cx + 60 * u, base));
        ctx.restore();
        glow(ctx, cx, base - 560 * u, 160 * u, "255 230 170", 0.5 * a * rise);
    },
    card(f, r, n, s) {
        const { ctx, u } = f;
        giltFrame(ctx, r, u);
        const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
        g.addColorStop(0, "#2b2012");
        g.addColorStop(1, "#0b0805");
        ctx.fillStyle = g;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.save();
        ctx.beginPath();
        ctx.rect(r.x, r.y, r.w, r.h);
        ctx.clip();
        heroArt(f, r, face(f, n, s));
        ctx.restore();
        if (s.landed >= 0) sparks(ctx, r.x + r.w / 2, r.y, s.landed, u, n.heroId ?? s.index, 8);
    },
    flourish(f, r, dt) {
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h * 0.45;
        rays(f, cx, cy, r.h * 1.5, "255 214 140", easeOutCubic(clamp01(dt / 0.4)), 24, 0.3);
    },
    stamp(f, r, dt) {
        sparks(f.ctx, r.x + r.w / 2, r.y + r.h * 0.2, dt, f.u * 1.4, 7, 22);
        // The statuette, small, set on the frame's bottom edge.
        const k = easeOutCubic(clamp01((dt - 0.15) / 0.35));
        if (k <= 0) return;
        const x = r.x + r.w - 26 * f.u;
        const y = r.y + r.h + 4 * f.u;
        f.ctx.save();
        f.ctx.globalAlpha = k;
        statuette(f.ctx, x, y, 150 * f.u * k, goldGradient(f.ctx, x - 20 * f.u, y - 150 * f.u, x + 20 * f.u, y));
        f.ctx.restore();
    },
};
