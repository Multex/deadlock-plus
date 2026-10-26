import { clamp01 } from "../../../kit/ease";
import { seeded } from "../../../kit/rng";
import type { Ctx } from "../../../kit/types";
import { CARD, cardPath, type FlipPose, type Placement } from "./card";
import { drawSparkle } from "./table";

const RAINBOW = ["#ff6fb5", "#ffcf5c", "#9dff8a", "#5cf2ff", "#7d8bff", "#e07dff", "#ff6fb5"];

/** Where the light sits on a held holo card, -1 to 1: a slow sway with a quicker ripple, never still. */
export function holoTilt(t: number): number {
    return Math.max(-1, Math.min(1, 0.78 * Math.sin(t * 1.15 + 0.4) + 0.22 * Math.sin(t * 2.7 + 1.3)));
}

/**
 * A held card leaning with the light, as a flip pose: narrower and sheared toward the side the light comes from,
 * so the foil and the card's outline move together.
 */
export function leanPose(tilt: number, amount = 1): FlipPose {
    const yaw = 0.32 * tilt * amount;
    return {
        angle: Math.PI,
        faceUp: true,
        scaleX: Math.cos(yaw),
        shade: 0,
        lift: 1,
        skew: -0.16 * Math.sin(yaw),
    };
}

function rainbowBand(ctx: Ctx, angle: number, shift: number, repeats: number): CanvasGradient {
    const len = Math.hypot(CARD.w, CARD.h);
    const dx = (Math.cos(angle) * len) / 2;
    const dy = (Math.sin(angle) * len) / 2;
    const ox = Math.cos(angle) * shift;
    const oy = Math.sin(angle) * shift;
    const g = ctx.createLinearGradient(-dx + ox, -dy + oy, dx + ox, dy + oy);
    const n = RAINBOW.length - 1;
    for (let r = 0; r < repeats; r++) {
        for (let i = 0; i <= n; i++) g.addColorStop(Math.min(1, (r + i / n) / repeats), RAINBOW[i]);
    }
    return g;
}

/**
 * The holo foil over a face, in card units: two rainbow layers that slide against each other as the card tilts
 * (one tints the darks, one pushes the mids), fine diffraction lines, a hot spot where the light catches, and a
 * field of glints that each flash when the tilt passes their angle. `power` 0 to 1 fades it all in.
 */
export function drawHolo(ctx: Ctx, tilt: number, t: number, power: number): void {
    if (power <= 0) return;
    ctx.save();
    cardPath(ctx);
    ctx.clip();
    const half = { w: CARD.w / 2, h: CARD.h / 2 };

    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.2 * power;
    ctx.fillStyle = rainbowBand(ctx, 1.05, tilt * 520 + t * 24, 3);
    ctx.fillRect(-half.w, -half.h, CARD.w, CARD.h);

    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = 0.55 * power;
    ctx.fillStyle = rainbowBand(ctx, -0.55, -tilt * 380, 2);
    ctx.fillRect(-half.w, -half.h, CARD.w, CARD.h);

    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = 0.5 * power;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    const step = 11;
    const drift = (tilt * 40) % step;
    ctx.beginPath();
    for (let x = -half.w - CARD.h; x < half.w + CARD.h; x += step) {
        ctx.moveTo(x + drift, -half.h);
        ctx.lineTo(x + drift + CARD.h * 0.6, half.h);
    }
    ctx.stroke();

    const hx = tilt * half.w * 0.9;
    const hy = -half.h * 0.2 - tilt * 120;
    const hot = ctx.createRadialGradient(hx, hy, 0, hx, hy, CARD.w * 0.75);
    hot.addColorStop(0, "rgb(255 255 255 / 0.85)");
    hot.addColorStop(0.35, "rgb(255 240 255 / 0.25)");
    hot.addColorStop(1, "rgb(255 255 255 / 0)");
    ctx.globalCompositeOperation = "color-dodge";
    ctx.globalAlpha = 0.45 * power;
    ctx.fillStyle = hot;
    ctx.fillRect(-half.w, -half.h, CARD.w, CARD.h);
    ctx.restore();

    const rng = seeded(4242);
    for (let i = 0; i < 46; i++) {
        const x = (rng() * 2 - 1) * (half.w - 30);
        const y = (rng() * 2 - 1) * (half.h - 30);
        const phase = rng() * Math.PI * 2;
        const size = 22 + rng() * 34;
        const catchK = Math.max(0, Math.cos(tilt * 4.2 + phase + x / 300)) ** 14;
        const twinkle = 0.6 + 0.4 * Math.sin(t * 9 + phase * 3);
        drawSparkle(ctx, x, y, size * (0.5 + catchK), catchK * twinkle * power);
    }
}

/**
 * The rainbow light leaking from behind a card, in pixels around `at`: a soft halo whose hues turn with `t`, at
 * `power` 0 to 1 and beyond for the burst.
 */
export function drawAura(ctx: Ctx, at: Placement, flip: FlipPose, t: number, power: number): void {
    if (power <= 0.01) return;
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.rotate(at.rot);
    ctx.scale(at.scale * flip.lift * flip.scaleX, at.scale * flip.lift);
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 4; i++) {
        const hue = (t * 90 + i * 90) % 360;
        ctx.shadowColor = `hsl(${hue} 100% 62% / ${clamp01(power) * 0.9})`;
        ctx.shadowBlur = (40 + 70 * Math.min(1.6, power)) * at.scale;
        ctx.shadowOffsetX = Math.cos(t * 2 + i * 1.57) * 14 * at.scale;
        ctx.shadowOffsetY = Math.sin(t * 2 + i * 1.57) * 14 * at.scale;
        ctx.lineWidth = 10 + 8 * power;
        ctx.strokeStyle = `hsl(${hue} 100% 70% / ${clamp01(power) * 0.6})`;
        cardPath(ctx, -4);
        ctx.stroke();
    }
    ctx.restore();
}

/** Rainbow light leaking round the rim of a face-down card, in card units, at `power` 0 to 1. */
export function drawRainbowEdge(ctx: Ctx, t: number, power: number): void {
    if (power <= 0.01) return;
    ctx.save();
    cardPath(ctx);
    ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = clamp01(power);
    ctx.lineWidth = 34;
    ctx.strokeStyle = rainbowBand(ctx, 0.9, t * 260, 2);
    cardPath(ctx, 4);
    ctx.stroke();
    ctx.globalAlpha = clamp01(power) * 0.5;
    ctx.lineWidth = 90;
    ctx.filter = "blur(18px)";
    cardPath(ctx, 10);
    ctx.stroke();
    ctx.restore();
}
