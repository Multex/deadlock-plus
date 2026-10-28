import { clamp01, easeInOut, easeOutCubic, lerp } from "../../../kit/ease";
import { seeded } from "../../../kit/rng";
import { INK, goldGradient, room } from "../draw";
import { face, glow, heroArt, star, type F, type Look } from "./award-paint";

const STAR = "214 232 255";

/** A burst of sparks thrown out round (`x`, `y`): one firework, `dt` seconds after it goes off. */
function firework(f: F, x: number, y: number, dt: number, seed: number, rgb: string): void {
    if (dt < 0 || dt > 1.1) return;
    const { ctx, u } = f;
    const r = seeded(seed);
    const fade = 1 - dt / 1.1;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = `rgb(${rgb} / ${fade})`;
    ctx.lineWidth = 3 * u;
    for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2 + r() * 0.2;
        const v = (220 + r() * 140) * u;
        const d = v * (1 - Math.exp(-4 * dt));
        const tail = 40 * u * fade;
        const drop = 60 * u * dt * dt;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * Math.max(0, d - tail), y + Math.sin(a) * Math.max(0, d - tail) + drop);
        ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d + drop);
        ctx.stroke();
    }
    ctx.restore();
}

/** Breakthrough of the Year: a rising star. Light streaks climbing, a shooting star into the title, cards on a lift. */
export const breakthrough: Look = {
    light: STAR,
    rise: true,
    titleFill: (f, y0, y1) => {
        const g = f.ctx.createLinearGradient(0, y0, 0, y1);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(0.45, "#cfe2ff");
        g.addColorStop(1, INK.gold);
        return g;
    },
    room(f) {
        const { ctx, u, w, h } = f;
        room(ctx, w, h, 0.4);
        // Streaks of light climbing out of the stage.
        const r = seeded(f.seed);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 34; i++) {
            const x = r() * w;
            const len = (120 + r() * 260) * u;
            const speed = (300 + r() * 500) * u;
            const y = h + len - ((f.t * speed + r() * h * 2) % (h + len * 2));
            const g = ctx.createLinearGradient(0, y, 0, y + len);
            g.addColorStop(0, `rgb(${STAR} / 0.35)`);
            g.addColorStop(1, `rgb(${STAR} / 0)`);
            ctx.fillStyle = g;
            ctx.fillRect(x, y, 2.5 * u, len);
        }
        ctx.restore();
        for (let i = 0; i < 40; i++) {
            const tw = 0.3 + 0.7 * Math.abs(Math.sin(f.t * (1 + r() * 3) + i));
            ctx.fillStyle = `rgb(${STAR} / ${0.5 * tw})`;
            const s = (1.5 + r() * 2.5) * u;
            ctx.fillRect(r() * w, r() * h * 0.6, s, s);
        }
    },
    title(f, k, cx, cy) {
        const { ctx, u } = f;
        // The shooting star: in from the bottom left, bursting on the title.
        const fly = easeInOut(clamp01(k / 0.7));
        const sx = lerp(-100 * u, cx, fly);
        const sy = lerp(f.h + 100 * u, cy, fly);
        if (k < 0.72) {
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            const tx = lerp(-100 * u, cx, Math.max(0, fly - 0.25));
            const ty = lerp(f.h + 100 * u, cy, Math.max(0, fly - 0.25));
            const g = ctx.createLinearGradient(tx, ty, sx, sy);
            g.addColorStop(0, `rgb(${STAR} / 0)`);
            g.addColorStop(1, `rgb(${STAR} / 0.9)`);
            ctx.strokeStyle = g;
            ctx.lineWidth = 10 * u;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(sx, sy);
            ctx.stroke();
            ctx.restore();
            star(ctx, sx, sy, 34 * u, "#ffffff", f.t * 6);
            glow(ctx, sx, sy, 120 * u, STAR, 0.8);
        }
        const burst = (k - 0.7) * (f.at.title || 1);
        firework(f, cx, cy, burst, f.seed, STAR);
        firework(f, cx - 260 * u, cy - 120 * u, burst - 0.12, f.seed + 1, "255 214 140");
        firework(f, cx + 260 * u, cy - 80 * u, burst - 0.2, f.seed + 2, STAR);
    },
    card(f, r, n, s) {
        const { ctx, u } = f;
        // A star glowing behind the art, then the art in a thin silver-gold edge.
        const lit = clamp01((s.landed - 0.05) / 0.3);
        ctx.fillStyle = "#0c1018";
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.save();
        ctx.beginPath();
        ctx.rect(r.x, r.y, r.w, r.h);
        ctx.clip();
        star(ctx, r.x + r.w / 2, r.y + r.h * 0.42, r.w * 0.62 * easeOutCubic(lit), `rgb(${STAR} / 0.22)`, f.t * 0.2);
        glow(ctx, r.x + r.w / 2, r.y + r.h * 0.42, r.w * 0.8, STAR, 0.25 * lit);
        heroArt(f, r, face(f, n, s));
        ctx.restore();
        ctx.strokeStyle = goldGradient(ctx, r.x, r.y, r.x + r.w, r.y + r.h);
        ctx.lineWidth = 5 * u;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        // The lift's light under a card still coming up.
        if (s.landed >= 0 && s.landed < 0.5)
            glow(ctx, r.x + r.w / 2, r.y + r.h, r.w * 0.9, STAR, 0.6 * (1 - s.landed / 0.5));
    },
    flourish(f, r, dt) {
        star(
            f.ctx,
            r.x + r.w / 2,
            r.y + r.h * 0.45,
            r.h * 0.95 * easeOutCubic(clamp01(dt / 0.4)),
            `rgb(${STAR} / 0.16)`,
            f.t * 0.3,
        );
    },
    stamp(f, r, dt) {
        firework(f, r.x - 30 * f.u, r.y + r.h * 0.1, dt - 0.05, f.seed + 5, "255 214 140");
        firework(f, r.x + r.w + 30 * f.u, r.y + r.h * 0.2, dt - 0.25, f.seed + 6, STAR);
        firework(f, r.x + r.w / 2, r.y - 40 * f.u, dt - 0.45, f.seed + 7, "255 214 140");
    },
};
