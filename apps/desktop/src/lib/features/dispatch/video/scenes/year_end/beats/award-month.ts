import { clamp01, easeInOut, easeOutCubic } from "../../../kit/ease";
import { seeded } from "../../../kit/rng";
import type { Ctx, Rect } from "../../../kit/types";
import { INK, goldGradient, paper, room } from "../draw";
import { glow, type F, type Look } from "./award-paint";

const CHAMPAGNE = "246 230 196";

/** Comeback of the Year shows a climb; Month of the Year a share of games won. */
const comeback = (f: F) => f.award.signal === "swing_month";

function rings(ctx: Ctx, r: Rect, u: number): void {
    for (const k of [0.25, 0.5, 0.75]) {
        const x = r.x + r.w * k;
        ctx.fillStyle = "#0a0806";
        ctx.beginPath();
        ctx.arc(x, r.y + 14 * u, 9 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = goldGradient(ctx, x - 8 * u, r.y - 14 * u, x + 8 * u, r.y + 20 * u);
        ctx.lineWidth = 5 * u;
        ctx.beginPath();
        ctx.arc(x, r.y + 4 * u, 14 * u, Math.PI * 0.95, Math.PI * 2.05);
        ctx.stroke();
    }
}

/** A tear-off calendar page: the month in the band, and the month's mark under it. */
function page(f: F, r: Rect, label: string, share: number, fill: number, up: boolean): void {
    const { ctx, u } = f;
    ctx.save();
    ctx.shadowColor = "rgb(0 0 0 / 0.55)";
    ctx.shadowBlur = 30 * u;
    ctx.shadowOffsetY = 14 * u;
    ctx.fillStyle = INK.paper;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.restore();
    paper(ctx, r.x, r.y, r.w, r.h);
    const band = r.h * 0.3;
    ctx.fillStyle = "#151009";
    ctx.fillRect(r.x, r.y, r.w, band);
    ctx.fillStyle = goldGradient(ctx, r.x, r.y + band - 6 * u, r.x + r.w, r.y + band);
    ctx.fillRect(r.x, r.y + band - 6 * u, r.w, 6 * u);
    rings(ctx, r, u);
    ctx.save();
    const px = Math.min(64 * u, r.w * 0.24);
    ctx.font = `700 ${px}px "${f.fonts.display}"`;
    const tw = ctx.measureText(label.toLocaleUpperCase()).width;
    const size = tw > r.w * 0.86 ? (px * r.w * 0.86) / tw : px;
    ctx.font = `700 ${Math.max(size, 44 * u)}px "${f.fonts.display}"`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = goldGradient(ctx, 0, r.y + band * 0.3, 0, r.y + band * 0.8);
    ctx.fillText(label.toLocaleUpperCase(), r.x + r.w / 2, r.y + band * 0.6);
    ctx.restore();

    const cx = r.x + r.w / 2;
    const cy = r.y + band + (r.h - band) * 0.5;
    const rad = Math.min(r.w, r.h - band) * 0.32;
    if (up) {
        // The climb: a gold arrow drawn upwards as the page lands.
        const k = easeOutCubic(fill);
        ctx.strokeStyle = goldGradient(ctx, cx - rad, cy + rad, cx + rad, cy - rad);
        ctx.lineWidth = 16 * u;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        const pts: [number, number][] = [
            [cx - rad, cy + rad * 0.7],
            [cx - rad * 0.3, cy + rad * 0.05],
            [cx + rad * 0.05, cy + rad * 0.35],
            [cx + rad * 0.8, cy - rad * 0.6],
        ];
        const n = 1 + (pts.length - 1) * k;
        ctx.moveTo(...pts[0]!);
        for (let i = 1; i < n; i++) ctx.lineTo(...pts[i]!);
        const last = Math.floor(n);
        if (last < pts.length) {
            const [ax, ay] = pts[last - 1]!;
            const [bx, by] = pts[last]!;
            const frac = n - last;
            ctx.lineTo(ax + (bx - ax) * frac, ay + (by - ay) * frac);
        }
        ctx.stroke();
        if (k > 0.95) {
            ctx.fillStyle = INK.gold;
            ctx.beginPath();
            ctx.moveTo(cx + rad * 1.05, cy - rad * 0.85);
            ctx.lineTo(cx + rad * 0.45, cy - rad * 0.72);
            ctx.lineTo(cx + rad * 0.92, cy - rad * 0.25);
            ctx.closePath();
            ctx.fill();
        }
    } else {
        // The share of the month's games won, as a ring filling round.
        ctx.lineWidth = 18 * u;
        ctx.strokeStyle = "rgb(24 22 17 / 0.12)";
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = goldGradient(ctx, cx - rad, cy - rad, cx + rad, cy + rad);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * share * easeOutCubic(fill));
        ctx.stroke();
    }
}

/** Month of the Year: a wall calendar behind, the months riffled over the title, tear-off pages as nominees. */
export const month: Look = {
    light: CHAMPAGNE,
    labelled: true,
    titleFill: (f, y0, y1) => goldGradient(f.ctx, 0, y0, 0, y1),
    room(f) {
        const { ctx, u, w, h } = f;
        room(ctx, w, h, 0.75);
        // The year on the wall: 12 by 31 cells, a few of them lit.
        const cell = 46 * u;
        const cols = Math.ceil(w / cell) + 1;
        const rows = Math.ceil(h / cell) + 1;
        const r = seeded(f.seed);
        const drift = (f.t * 8 * u) % cell;
        ctx.lineWidth = 1.5 * u;
        ctx.strokeStyle = "rgb(222 184 102 / 0.07)";
        for (let i = 0; i < cols; i++) {
            ctx.beginPath();
            ctx.moveTo(i * cell - drift, 0);
            ctx.lineTo(i * cell - drift, h);
            ctx.stroke();
        }
        for (let j = 0; j < rows; j++) {
            ctx.beginPath();
            ctx.moveTo(0, j * cell);
            ctx.lineTo(w, j * cell);
            ctx.stroke();
        }
        for (let i = 0; i < 70; i++) {
            const x = Math.floor(r() * cols) * cell - drift;
            const y = Math.floor(r() * rows) * cell;
            const a = 0.05 + 0.1 * Math.abs(Math.sin(f.t * 1.5 + i));
            ctx.fillStyle = `rgb(222 184 102 / ${a})`;
            ctx.fillRect(x + 2 * u, y + 2 * u, cell - 4 * u, cell - 4 * u);
        }
    },
    title(f, k, cx, cy) {
        const { ctx, u } = f;
        const a = 1 - clamp01((k - 0.85) * 4);
        if (a <= 0) return;
        // The months flip past on a pad behind the title, faster than they can be read, landing face down.
        const names = f.award.nominees.map((n) => n.label ?? "");
        const pw = 380 * u;
        const ph = 420 * u;
        const flips = 7;
        const p = clamp01(k) * flips;
        const i = Math.floor(p);
        const turn = easeInOut(p - i);
        ctx.save();
        ctx.globalAlpha = 0.5 * a;
        const r = { x: cx - pw / 2, y: cy - ph / 2 + 30 * u, w: pw, h: ph };
        page(f, r, names[(i + 1) % names.length] ?? "", 0, 0, false);
        ctx.translate(cx, r.y);
        ctx.scale(1, Math.cos(turn * Math.PI));
        ctx.translate(-cx, -r.y);
        if (turn < 0.5) page(f, r, names[i % names.length] ?? "", 0, 0, false);
        ctx.restore();
    },
    card(f, r, n, s) {
        const [wins, matches] = [n.figures[0]?.value ?? 0, n.figures[1]?.value ?? 0];
        const share = matches > 0 ? wins / matches : 0;
        page(f, r, n.label ?? "", share, clamp01((s.landed - 0.1) / 0.6), comeback(f));
        if (s.winner && s.revealed > 0) {
            // Gold leaf sweeps across the winning page.
            const { ctx } = f;
            const k = clamp01(s.revealed);
            ctx.save();
            ctx.beginPath();
            ctx.rect(r.x, r.y, r.w, r.h);
            ctx.clip();
            ctx.globalCompositeOperation = "lighter";
            const x = r.x - r.w + k * r.w * 2.4;
            const g = ctx.createLinearGradient(x - r.w * 0.4, r.y, x + r.w * 0.4, r.y + r.h);
            g.addColorStop(0, "rgb(255 220 140 / 0)");
            g.addColorStop(0.5, "rgb(255 220 140 / 0.55)");
            g.addColorStop(1, "rgb(255 220 140 / 0)");
            ctx.fillStyle = g;
            ctx.fillRect(r.x, r.y, r.w, r.h);
            ctx.restore();
        }
    },
    flourish(f, r, dt) {
        glow(f.ctx, r.x + r.w / 2, r.y + r.h / 2, r.h * 1.1, CHAMPAGNE, 0.4 * clamp01(dt / 0.3));
        // The losing months' pages blow away behind the winner.
        const { ctx, u } = f;
        const rnd = seeded(f.seed ^ 77);
        for (let i = 0; i < 9; i++) {
            const k = clamp01((dt - rnd() * 0.3) / 1.4);
            if (k <= 0 || k >= 1) continue;
            const x = r.x + r.w / 2 + (rnd() - 0.5) * r.w * 2.6 + k * 300 * u;
            const y = r.y + r.h * rnd() - k * 500 * u;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(k * 4 + i);
            ctx.globalAlpha = 0.7 * (1 - k);
            ctx.fillStyle = INK.paper;
            ctx.fillRect(-36 * u, -44 * u, 72 * u, 88 * u);
            ctx.fillStyle = "#151009";
            ctx.fillRect(-36 * u, -44 * u, 72 * u, 24 * u);
            ctx.restore();
        }
    },
};
