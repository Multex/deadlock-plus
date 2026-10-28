import { clamp01, easeOutBack } from "../../../kit/ease";
import { seeded } from "../../../kit/rng";
import type { Ctx, Rect } from "../../../kit/types";
import { room } from "../draw";
import { art, glow, heroArt, type F, type Look } from "./award-paint";

const RED = "255 72 60";

/** A hooded figure filling the bottom of `r`. */
function hooded(ctx: Ctx, r: Rect, fill: string): void {
    const cx = r.x + r.w / 2;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(r.x + r.w * 0.04, r.y + r.h);
    ctx.bezierCurveTo(
        r.x + r.w * 0.1,
        r.y + r.h * 0.62,
        r.x + r.w * 0.22,
        r.y + r.h * 0.55,
        cx - r.w * 0.2,
        r.y + r.h * 0.42,
    );
    ctx.bezierCurveTo(cx - r.w * 0.26, r.y + r.h * 0.18, cx - r.w * 0.08, r.y + r.h * 0.05, cx, r.y + r.h * 0.04);
    ctx.bezierCurveTo(
        cx + r.w * 0.08,
        r.y + r.h * 0.05,
        cx + r.w * 0.26,
        r.y + r.h * 0.18,
        cx + r.w * 0.2,
        r.y + r.h * 0.42,
    );
    ctx.bezierCurveTo(
        r.x + r.w * 0.78,
        r.y + r.h * 0.55,
        r.x + r.w * 0.9,
        r.y + r.h * 0.62,
        r.x + r.w * 0.96,
        r.y + r.h,
    );
    ctx.closePath();
    ctx.fill();
    // The face: only the eyes catch the light.
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(cx, r.y + r.h * 0.3, r.w * 0.12, r.h * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgb(${RED} / 0.95)`;
    for (const dx of [-0.05, 0.05]) {
        ctx.beginPath();
        ctx.ellipse(cx + r.w * dx, r.y + r.h * 0.3, r.w * 0.025, r.h * 0.01, 0, 0, Math.PI * 2);
        ctx.fill();
    }
}

/** Faulty-neon light for frame `t`: steady, with the odd drop. */
function stutter(f: F, rate = 1): number {
    const r = seeded(Math.floor(f.t * 20 * rate) + f.seed);
    return r() < 0.12 ? 0.25 : 1;
}

/** Villain of the Year: footlights in red, smoke on the floor, hooded nominees, and the player's hero, beaten. */
export const villain: Look = {
    light: RED,
    from: "below",
    labelled: true,
    titleFill: (f, y0, y1) => {
        const g = f.ctx.createLinearGradient(0, y0, 0, y1);
        g.addColorStop(0, "#fff0e8");
        g.addColorStop(0.5, "#ff7a5c");
        g.addColorStop(1, "#c22a1c");
        return g;
    },
    flicker: (f) => (f.t < f.at.title ? stutter(f) : 1),
    room(f) {
        const { ctx, u, w, h } = f;
        room(ctx, w, h, 0.15);
        const under = ctx.createLinearGradient(0, h, 0, h * 0.35);
        under.addColorStop(0, `rgb(150 20 14 / ${0.55 * stutter(f, 0.5)})`);
        under.addColorStop(1, "rgb(150 20 14 / 0)");
        ctx.fillStyle = under;
        ctx.fillRect(0, 0, w, h);
        // Smoke rolling over the floor.
        const r = seeded(f.seed);
        for (let i = 0; i < 14; i++) {
            const x = ((r() * w + f.t * (30 + r() * 50) * u) % (w + 600 * u)) - 300 * u;
            const y = h * (0.62 + r() * 0.38);
            const rad = (220 + r() * 260) * u;
            const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
            g.addColorStop(0, "rgb(70 30 30 / 0.22)");
            g.addColorStop(1, "rgb(70 30 30 / 0)");
            ctx.fillStyle = g;
            ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        }
    },
    title(f, k, cx, cy) {
        // A crack of red lightning behind the title as it comes on.
        if (k > 1) return;
        const { ctx, u } = f;
        const hit = k > 0.3 && k < 0.45;
        if (!hit) return;
        const r = seeded(f.seed + 3);
        ctx.save();
        ctx.strokeStyle = `rgb(${RED} / 0.9)`;
        ctx.lineWidth = 6 * u;
        ctx.shadowColor = `rgb(${RED})`;
        ctx.shadowBlur = 30 * u;
        ctx.beginPath();
        let x = cx + (r() - 0.5) * 400 * u;
        let y = 0;
        ctx.moveTo(x, y);
        while (y < cy + 200 * u) {
            x += (r() - 0.5) * 140 * u;
            y += (40 + r() * 70) * u;
            ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = `rgb(${RED} / 0.18)`;
        ctx.fillRect(0, 0, f.w, f.h);
    },
    card(f, r, n, s) {
        const { ctx, u } = f;
        const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
        g.addColorStop(0, "#1a0807");
        g.addColorStop(1, "#060202");
        ctx.fillStyle = g;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = s.winner && s.revealed > 0 ? `rgb(${RED})` : "rgb(150 40 30 / 0.6)";
        ctx.lineWidth = 5 * u;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        const band = Math.max(96 * u, r.h * 0.22);
        hooded(ctx, { x: r.x + r.w * 0.1, y: r.y + 24 * u, w: r.w * 0.8, h: r.h - band - 24 * u }, "#2a0c0a");
        // Lit from below.
        glow(ctx, r.x + r.w / 2, r.y + r.h - band, r.w * 0.6, RED, 0.25 * (s.landed > 0 ? 1 : 0));
        ctx.fillStyle = "#0a0303";
        ctx.fillRect(r.x, r.y + r.h - band, r.w, band);
        const name = n.label ?? "";
        let px = Math.min(58 * u, r.w * 0.2);
        ctx.font = `700 ${px}px "${f.fonts.display}"`;
        const tw = ctx.measureText(name.toLocaleUpperCase()).width;
        if (tw > r.w * 0.9) px = Math.max(44 * u, (px * r.w * 0.9) / tw);
        ctx.font = `700 ${px}px "${f.fonts.display}"`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ff6a52";
        ctx.fillText(name.toLocaleUpperCase(), r.x + r.w / 2, r.y + r.h - band / 2, r.w * 0.94);
    },
    flourish(f, r, dt) {
        glow(f.ctx, r.x + r.w / 2, r.y + r.h, r.h * 1.1, RED, 0.6 * clamp01(dt / 0.25));
    },
    stamp(f, r, dt) {
        // The player's hero, battered, slumped against the winner's card.
        const img = art(f, f.star, "critical");
        if (!img) return;
        const k = easeOutBack(clamp01((dt - 0.15) / 0.35));
        const w = r.w * 0.6;
        const h = (w * img.height) / img.width;
        f.ctx.save();
        f.ctx.globalAlpha = clamp01((dt - 0.15) / 0.15);
        f.ctx.translate(r.x + r.w + w * 0.15, r.y + r.h);
        f.ctx.rotate(0.12 * k);
        heroArt(f, { x: -w / 2, y: -h * k, w, h }, img);
        f.ctx.restore();
    },
};
