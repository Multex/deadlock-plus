import { clamp01, easeOutBack } from "../../../kit/ease";
import type { Ctx, Rect } from "../../../kit/types";
import { INK, goldGradient, room } from "../draw";
import { face, glow, heroArt, star, type F, type Look } from "./award-paint";

const SILVER = "232 238 255";

/** A strip of film running down `x`, sprocket holes scrolling with time. */
function filmStrip(ctx: Ctx, x: number, w: number, h: number, t: number, u: number): void {
    ctx.fillStyle = "#0e0e10";
    ctx.fillRect(x, 0, w, h);
    const hole = 26 * u;
    const step = 44 * u;
    const off = (t * 160 * u) % step;
    ctx.fillStyle = "#26262b";
    for (let y = -step + off; y < h + step; y += step) {
        ctx.beginPath();
        ctx.roundRect(x + w * 0.12, y, w * 0.16, hole, 4 * u);
        ctx.roundRect(x + w * 0.72, y, w * 0.16, hole, 4 * u);
        ctx.fill();
    }
    ctx.fillStyle = "rgb(232 238 255 / 0.05)";
    for (let y = -step * 4 + off * 4; y < h; y += step * 4)
        ctx.fillRect(x + w * 0.32, y + 6 * u, w * 0.36, step * 4 - 12 * u);
}

/** A film frame round a card: black edges with sprocket holes top and bottom. */
function filmFrame(ctx: Ctx, r: Rect, u: number): void {
    const e = 34 * u;
    ctx.fillStyle = "#0b0b0d";
    ctx.fillRect(r.x - 10 * u, r.y - e, r.w + 20 * u, r.h + 2 * e);
    ctx.fillStyle = "#2b2b31";
    const n = Math.max(4, Math.round(r.w / (38 * u)));
    const step = (r.w + 20 * u) / n;
    for (let i = 0; i < n; i++) {
        const x = r.x - 10 * u + i * step + step * 0.25;
        ctx.beginPath();
        ctx.roundRect(x, r.y - e * 0.72, step * 0.5, e * 0.44, 3 * u);
        ctx.roundRect(x, r.y + r.h + e * 0.28, step * 0.5, e * 0.44, 3 * u);
        ctx.fill();
    }
}

/** The graded letter as a round seal. */
function gradeSeal(f: F, x: number, y: number, r: number, letter: string): void {
    const { ctx } = f;
    ctx.fillStyle = goldGradient(ctx, x - r, y - r, x + r, y + r);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgb(60 40 10 / 0.7)";
    ctx.lineWidth = Math.max(2, r * 0.07);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.82, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = INK.black;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${r * 1.05}px "${f.fonts.display}"`;
    ctx.fillText(letter, x, y + r * 0.05);
}

/** Performance of the Year: the projection booth. Film strips down the sides, a countdown leader, graded frames. */
export const performance: Look = {
    bleed: 10,
    light: SILVER,
    titleFill: (f, y0, y1) => {
        const g = f.ctx.createLinearGradient(0, y0, 0, y1);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(0.55, "#d9dde8");
        g.addColorStop(1, INK.gold);
        return g;
    },
    room(f) {
        const { ctx, u, w, h } = f;
        room(ctx, w, h, 0.55);
        const sw = 90 * u;
        filmStrip(ctx, f.wide ? w * 0.04 : 0, sw, h, f.t, u);
        filmStrip(ctx, f.wide ? w * 0.96 - sw : w - sw, sw, h, f.t + 0.3, u);
        // The projector's beam from behind the house.
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const g = ctx.createLinearGradient(0, h, 0, 0);
        g.addColorStop(0, "rgb(232 238 255 / 0.12)");
        g.addColorStop(1, "rgb(232 238 255 / 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(w / 2 - 20 * u, h);
        ctx.lineTo(w * 0.1, 0);
        ctx.lineTo(w * 0.9, 0);
        ctx.lineTo(w / 2 + 20 * u, h);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    },
    title(f, k, cx, cy) {
        const { ctx, u } = f;
        const a = 1 - clamp01((k - 0.85) * 4);
        if (a <= 0) return;
        // A countdown leader: a ring with a cross, swept round once a beat.
        const r = 330 * u;
        const sweep = ((f.t / f.b) % 1) * Math.PI * 2;
        ctx.save();
        ctx.globalAlpha = 0.55 * a;
        ctx.fillStyle = "rgb(232 238 255 / 0.08)";
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r * 1.2, -Math.PI / 2, -Math.PI / 2 + sweep);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgb(232 238 255 / 0.6)";
        ctx.lineWidth = 4 * u;
        for (const rr of [r, r * 0.84]) {
            ctx.beginPath();
            ctx.arc(cx, cy, rr, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(cx - r * 1.4, cy);
        ctx.lineTo(cx + r * 1.4, cy);
        ctx.moveTo(cx, cy - r * 1.4);
        ctx.lineTo(cx, cy + r * 1.4);
        ctx.stroke();
        ctx.restore();
    },
    card(f, r, n, s) {
        const { ctx, u } = f;
        filmFrame(ctx, r, u);
        const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
        g.addColorStop(0, "#22252c");
        g.addColorStop(1, "#08090b");
        ctx.fillStyle = g;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.save();
        ctx.beginPath();
        ctx.rect(r.x, r.y, r.w, r.h);
        ctx.clip();
        heroArt(f, r, face(f, n, s));
        ctx.restore();
        // Losing frames go to black and white.
        if (!s.winner && s.revealed > 0) {
            ctx.save();
            ctx.globalCompositeOperation = "saturation";
            ctx.fillStyle = `rgb(128 128 128 / ${s.revealed})`;
            ctx.fillRect(r.x, r.y, r.w, r.h);
            ctx.restore();
        }
        const k = clamp01((s.landed - 0.15) / 0.2);
        if (n.grade && k > 0 && !(s.winner && s.revealed > 0)) {
            const rad = r.w * 0.17 * easeOutBack(k, 2.4);
            gradeSeal(f, r.x + r.w - rad * 0.7, r.y + r.h - rad * 0.7, rad, n.grade);
        }
    },
    flourish(f, r, dt) {
        glow(f.ctx, r.x + r.w / 2, r.y + r.h / 2, r.h, SILVER, 0.45 * clamp01(dt / 0.25));
    },
    stamp(f, r, dt) {
        // The winning grade, stamped big across the frame.
        const k = clamp01(dt / 0.22);
        const rad = r.w * 0.3 * (2.2 - 1.2 * easeOutBack(k, 1.6));
        const x = r.x + r.w - r.w * 0.12;
        const y = r.y + r.h - r.w * 0.12;
        f.ctx.save();
        f.ctx.globalAlpha = clamp01(dt / 0.08);
        f.ctx.translate(x, y);
        f.ctx.rotate(-0.18 * (1 - k) - 0.08);
        const letter = f.award.nominees[0]?.grade;
        if (letter) gradeSeal(f, 0, 0, rad, letter);
        else {
            star(f.ctx, 0, 0, rad, goldGradient(f.ctx, -rad, -rad, rad, rad));
        }
        f.ctx.restore();
    },
};
