import { clamp01, easeOutCubic } from "../../../kit/ease";
import type { Ctx } from "../../../kit/types";
import { INK, goldGradient, room } from "../draw";
import { glow, type Look } from "./award-paint";

const BRONZE = "236 186 124";
const MAX_TICKS = 24;

function hand(ctx: Ctx, x: number, y: number, len: number, a: number, width: number, fill: string | CanvasGradient): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(-width / 2, len * 0.12);
    ctx.lineTo(0, -len);
    ctx.lineTo(width / 2, len * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

/** A dial: twelve marks, and round the rim one tick per match of the sitting, lit as they count. */
function dial(ctx: Ctx, x: number, y: number, r: number, ticks: number, lit: number, u: number, a: number): void {
    ctx.fillStyle = "#14100a";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = goldGradient(ctx, x - r, y - r, x + r, y + r);
    ctx.lineWidth = 7 * u;
    ctx.stroke();
    ctx.strokeStyle = "rgb(222 184 102 / 0.35)";
    ctx.lineWidth = 3 * u;
    for (let i = 0; i < 12; i++) {
        const t = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(x + Math.sin(t) * r * 0.62, y - Math.cos(t) * r * 0.62);
        ctx.lineTo(x + Math.sin(t) * r * 0.7, y - Math.cos(t) * r * 0.7);
        ctx.stroke();
    }
    const n = Math.min(ticks, MAX_TICKS);
    for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        const on = i < lit;
        ctx.strokeStyle = on ? INK.gold : "rgb(222 184 102 / 0.15)";
        ctx.lineWidth = (on ? 9 : 6) * u;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x + Math.sin(t) * r * 0.78, y - Math.cos(t) * r * 0.78);
        ctx.lineTo(x + Math.sin(t) * r * 0.9, y - Math.cos(t) * r * 0.9);
        ctx.stroke();
    }
    hand(ctx, x, y, r * 0.5, a / 12, 12 * u, INK.goldDeep);
    hand(ctx, x, y, r * 0.74, a, 8 * u, INK.gold);
    ctx.fillStyle = INK.gold;
    ctx.beginPath();
    ctx.arc(x, y, 9 * u, 0, Math.PI * 2);
    ctx.fill();
}

/** Endurance: the long night. A great clock behind, hands spun to a stop for the title, dials ticking off matches. */
export const endurance: Look = {
    light: BRONZE,
    labelled: true,
    headline: "line",
    titleFill: (f, y0, y1) => goldGradient(f.ctx, 0, y0, 0, y1),
    room(f) {
        const { ctx, u, w, h } = f;
        room(ctx, w, h, 0.6);
        const r = Math.max(w, h) * 0.46;
        const x = w / 2;
        const y = f.box.y + f.box.h * 0.48;
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.strokeStyle = INK.gold;
        ctx.lineWidth = 4 * u;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 60; i++) {
            const t = (i / 60) * Math.PI * 2;
            const l = i % 5 ? 0.96 : 0.9;
            ctx.lineWidth = (i % 5 ? 3 : 7) * u;
            ctx.beginPath();
            ctx.moveTo(x + Math.sin(t) * r * l, y - Math.cos(t) * r * l);
            ctx.lineTo(x + Math.sin(t) * r, y - Math.cos(t) * r);
            ctx.stroke();
        }
        // The second hand steps once a beat.
        const step = Math.floor(f.t / f.b);
        hand(ctx, x, y, r * 0.92, (step / 60) * Math.PI * 2, 6 * u, INK.gold);
        ctx.restore();
    },
    title(f, k, cx, cy) {
        const { ctx, u } = f;
        const a = 1 - clamp01((k - 0.85) * 4);
        if (a <= 0) return;
        // Hands racing round, slowing, stopping as the title lands.
        const spin = easeOutCubic(clamp01(k)) * Math.PI * 2 * 5;
        ctx.save();
        ctx.globalAlpha = 0.6 * a;
        dial(ctx, cx, cy, 330 * u, 0, 0, u, spin);
        ctx.restore();
    },
    card(f, r, n, s) {
        const { ctx, u } = f;
        ctx.fillStyle = "#0e0b07";
        ctx.beginPath();
        ctx.roundRect(r.x, r.y, r.w, r.h, 20 * u);
        ctx.fill();
        ctx.strokeStyle = "rgb(222 184 102 / 0.4)";
        ctx.lineWidth = 3 * u;
        ctx.stroke();
        const count = n.figures[0]?.value ?? 0;
        if (n.label) {
            const px = Math.max(44 * u, Math.min(52 * u, r.w * 0.16));
            ctx.font = `700 ${px}px "${f.fonts.display}"`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = INK.gold;
            ctx.fillText(n.label.toLocaleUpperCase(), r.x + r.w / 2, r.y + r.h - 48 * u, r.w * 0.9);
        }
        const lit = s.landed > 0 ? Math.floor(s.landed / 0.06) : 0;
        const turn = s.winner && s.revealed > 0 ? easeOutCubic(s.revealed) * Math.PI * 2 : 0;
        const rad = Math.min(r.w * 0.42, (r.h - 100 * u) * 0.45);
        dial(ctx, r.x + r.w / 2, r.y + 20 * u + rad + 10 * u, rad, count, lit, u, (Math.min(lit, count) / Math.max(1, count)) * Math.PI * 2 + turn);
    },
    flourish(f, r, dt) {
        const k = clamp01(dt / 0.5);
        glow(f.ctx, r.x + r.w / 2, r.y + r.h * 0.42, r.h * (0.6 + 0.6 * k), BRONZE, 0.55 * (1 - 0.4 * k));
    },
};
