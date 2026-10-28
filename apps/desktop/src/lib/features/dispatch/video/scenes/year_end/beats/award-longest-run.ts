import { clamp01 } from "../../../kit/ease";
import type { Rect } from "../../../kit/types";
import { INK, goldGradient, room } from "../draw";
import { glow, type F, type Look } from "./award-paint";
import { bulb } from "./stage";

const AMBER = "255 196 110";
const MAX_BULBS = 40;
/** Seconds between bulbs lighting as a run counts up. */
const STEP = 0.045;

/** Bulbs in rows filling `r`, as many as the run had wins (a capped run shows its cap). */
function bulbGrid(f: F, r: Rect, count: number, lit: number, chase: number): void {
    const n = Math.min(count, MAX_BULBS);
    const cols = Math.ceil(Math.sqrt(n * (r.w / r.h)));
    const rows = Math.ceil(n / cols);
    const cell = Math.min(r.w / cols, r.h / rows);
    const x0 = r.x + (r.w - cols * cell) / 2;
    const y0 = r.y + (r.h - rows * cell) / 2;
    for (let i = 0; i < n; i++) {
        const cx = x0 + ((i % cols) + 0.5) * cell;
        const cy = y0 + (Math.floor(i / cols) + 0.5) * cell;
        const on = i < lit ? 1 : 0;
        const wave = chase > 0 ? 0.5 + 0.5 * Math.sin(chase * 14 - i * 0.7) : 1;
        bulb(f.ctx, cx, cy, cell * 0.3, on * wave);
    }
}

/** Longest Run: the runway. Lights racing to the vanishing point, a chase of bulbs, one bulb per win. */
export const longestRun: Look = {
    light: AMBER,
    labelled: true,
    headline: "line",
    titleFill: (f, y0, y1) => goldGradient(f.ctx, 0, y0, 0, y1),
    room(f) {
        const { ctx, u, w, h } = f;
        room(ctx, w, h, 0.45);
        // Runway lights: rows of dots running to a point above the stage, a pulse racing along them.
        const vx = w / 2;
        const vy = f.box.y + 40 * u;
        for (const side of [-1, 1]) {
            for (let i = 0; i < 16; i++) {
                const k = i / 16;
                const depth = k * k;
                const x = vx + side * (60 * u + depth * w * 0.75);
                const y = vy + depth * (h - vy);
                const pulse = Math.max(0, Math.sin(f.t * 8 - i * 0.8));
                const s = (3 + depth * 10) * u;
                ctx.fillStyle = `rgb(${AMBER} / ${0.18 + 0.6 * pulse})`;
                ctx.beginPath();
                ctx.arc(x, y, s, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    },
    title(f, k, cx, cy) {
        const { u } = f;
        const a = 1 - clamp01((k - 0.9) * 4);
        if (a <= 0) return;
        // A chase of bulbs under and over the title, lighting left to right.
        const n = 15;
        const span = Math.min(f.w - 120 * u, 1200 * u);
        f.ctx.save();
        f.ctx.globalAlpha = a;
        for (const dy of [-150 * u, 150 * u]) {
            for (let i = 0; i < n; i++) {
                const x = cx - span / 2 + (i / (n - 1)) * span;
                const on = clamp01(k * (n + 4) - i);
                const chase = 0.55 + 0.45 * Math.sin(f.t * 16 - i * 0.9);
                bulb(f.ctx, x, cy + dy, 14 * u, on * chase);
            }
        }
        f.ctx.restore();
    },
    card(f, r, n, s) {
        const { ctx, u } = f;
        ctx.fillStyle = "#120d07";
        ctx.beginPath();
        ctx.roundRect(r.x, r.y, r.w, r.h, 14 * u);
        ctx.fill();
        ctx.strokeStyle = goldGradient(ctx, r.x, r.y, r.x + r.w, r.y + r.h);
        ctx.lineWidth = 5 * u;
        ctx.stroke();
        const count = n.figures[0]?.value ?? 0;
        const head = n.label ? 90 * u : 0;
        if (n.label) {
            const px = Math.max(44 * u, Math.min(54 * u, r.w * 0.17));
            ctx.font = `700 ${px}px "${f.fonts.display}"`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = INK.gold;
            ctx.fillText(n.label.toLocaleUpperCase(), r.x + r.w / 2, r.y + 50 * u, r.w * 0.9);
        }
        const lit = s.landed > 0 ? Math.floor(s.landed / STEP) : 0;
        const chase = s.winner && s.revealed > 0 ? f.t : 0;
        bulbGrid(
            f,
            { x: r.x + 18 * u, y: r.y + head + 14 * u, w: r.w - 36 * u, h: r.h - head - 32 * u },
            count,
            lit,
            chase,
        );
    },
    flourish(f, r, dt) {
        glow(f.ctx, r.x + r.w / 2, r.y + r.h / 2, r.h * 1.15, AMBER, 0.5 * clamp01(dt / 0.25));
    },
};
