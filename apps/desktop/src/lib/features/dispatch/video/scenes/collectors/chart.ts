import { climbAt, type CollectorsSceneData, type SceneChart } from "./data";
import { INK, drawContained, fit, font, roundRect, starPath, type Fonts } from "./paint";
import type { Ctx } from "../../kit/types";
import { punch } from "./plan";

export interface Region {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface ChartMoment {
    /** Matches drawn, as a fraction (see `drawnMatches`). */
    drawn: number;
    /** The axes and rules fade in with this. */
    frame: number;
    /** Beats since the star landed on the peak; negative before. */
    sincePeak: number;
}

const OUTCOME = { win: INK.up, loss: INK.down, unscored: INK.gold } as const;

/** The climb chart stretched over `r`; its type scales with the smaller stretch so labels never squash. */
export function drawChart(
    ctx: Ctx,
    data: CollectorsSceneData,
    chart: SceneChart,
    fonts: Fonts,
    images: Partial<Record<string, ImageBitmap>>,
    r: Region,
    m: ChartMoment,
) {
    const sx = r.w / chart.width;
    const sy = r.h / chart.height;
    const s = Math.min(sx, sy);
    const X = (x: number) => r.x + x * sx;
    const Y = (y: number) => r.y + y * sy;
    const left = X(chart.pad.l);
    const right = X(chart.width - chart.pad.r);
    const floor = Y(chart.height - chart.pad.b);
    // Never under 21 units: a 9:16 export shows on a phone at about a third of its size.
    const type = Math.max(13 * s, 21);

    ctx.save();
    ctx.globalAlpha = m.frame;
    ctx.textBaseline = "middle";
    for (const row of chart.rows) {
        const y = Y(row.y);
        if (row.major || row.labelled) {
            ctx.strokeStyle = row.major ? "rgba(201, 162, 74, 0.55)" : "rgba(255, 255, 255, 0.1)";
            ctx.lineWidth = row.major ? 1.5 : 1;
            ctx.setLineDash(row.major ? [] : [3, 6]);
            ctx.beginPath();
            ctx.moveTo(left, y);
            ctx.lineTo(right, y);
            ctx.stroke();
        }
        if (row.labelled) {
            ctx.textAlign = "right";
            ctx.fillStyle = row.major ? INK.gold : "rgba(234, 219, 180, 0.72)";
            ctx.font = font(row.major ? 700 : 500, type, row.major ? fonts.display : fonts.body);
            ctx.fillText(row.label, left - 10 * s, y);
        }
        if (row.major) drawContained(ctx, images[`tier:${row.tier}`], r.x + 22, y, 44);
    }
    ctx.setLineDash([]);
    ctx.textAlign = "left";
    ctx.font = font(700, type, fonts.display);
    ctx.letterSpacing = `${type * 0.15}px`;
    for (const month of chart.months) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.beginPath();
        ctx.moveTo(X(month.x), Y(chart.pad.t));
        ctx.lineTo(X(month.x), floor);
        ctx.stroke();
        ctx.fillStyle = INK.goldDeep;
        ctx.textAlign = month.anchor === "end" ? "right" : "left";
        ctx.fillText(month.label.toUpperCase(), X(month.textX), floor + type);
    }
    ctx.letterSpacing = "0px";
    ctx.restore();

    const start = { x: X(chart.start.x), y: Y(chart.start.y) };
    const steps = chart.steps.map((p) => ({ x: X(p.x), y: Y(p.y) }));
    const now = climbAt(start, steps, m.drawn);
    const pts = now.points;
    const head = pts[pts.length - 1];

    if (pts.length > 1) {
        const area = ctx.createLinearGradient(0, Y(chart.pad.t), 0, floor);
        area.addColorStop(0, "rgba(230, 197, 111, 0.42)");
        area.addColorStop(1, "rgba(230, 197, 111, 0)");
        ctx.fillStyle = area;
        ctx.beginPath();
        ctx.moveTo(start.x, floor);
        for (const p of pts) ctx.lineTo(p.x, p.y);
        ctx.lineTo(head.x, floor);
        ctx.closePath();
        ctx.fill();

        const line = ctx.createLinearGradient(left, 0, right, 0);
        line.addColorStop(0, "#b48731");
        line.addColorStop(0.5, "#fbeec0");
        line.addColorStop(1, "#d9b25c");
        ctx.save();
        ctx.strokeStyle = line;
        ctx.lineWidth = Math.max(3, 4 * s);
        ctx.lineJoin = "round";
        ctx.shadowColor = "rgba(255, 220, 150, 0.6)";
        ctx.shadowBlur = 10 * s;
        ctx.beginPath();
        pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
        ctx.restore();
    }

    if (m.frame > 0) {
        ctx.save();
        ctx.globalAlpha = m.frame;
        ctx.fillStyle = "#0b0910";
        ctx.strokeStyle = INK.gold;
        ctx.lineWidth = 2.5 * s;
        ctx.beginPath();
        ctx.arc(start.x, start.y, 6 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    const done = now.matches >= steps.length;
    if (m.drawn > 0 && !done) {
        const last = chart.steps[Math.max(0, now.matches - 1)];
        const flash = 1 - (m.drawn - Math.floor(m.drawn));
        const glow = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 26 * s);
        glow.addColorStop(0, "rgba(255, 246, 208, 0.9)");
        glow.addColorStop(1, "rgba(255, 246, 208, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(head.x, head.y, 26 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = now.matches > 0 ? OUTCOME[last.outcome] : INK.gold;
        ctx.globalAlpha = 0.5 + 0.5 * flash;
        ctx.beginPath();
        ctx.arc(head.x, head.y, 7 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
    if (done) {
        ctx.fillStyle = INK.gold;
        ctx.strokeStyle = "#0b0910";
        ctx.lineWidth = 2 * s;
        ctx.beginPath();
        ctx.arc(head.x, head.y, 6 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    if (m.sincePeak >= 0) {
        const peak = steps[chart.peakIndex];
        const ring = Math.min(1, m.sincePeak / 1.2);
        if (ring < 1) {
            ctx.strokeStyle = `rgba(255, 243, 196, ${1 - ring})`;
            ctx.lineWidth = 3 * s * (1 - ring) + 1;
            ctx.beginPath();
            ctx.arc(peak.x, peak.y, (24 + ring * 120) * s, 0, Math.PI * 2);
            ctx.stroke();
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * Math.PI * 2;
                const r0 = (30 + ring * 60) * s;
                const r1 = (44 + ring * 110) * s;
                ctx.beginPath();
                ctx.moveTo(peak.x + Math.cos(a) * r0, peak.y + Math.sin(a) * r0);
                ctx.lineTo(peak.x + Math.cos(a) * r1, peak.y + Math.sin(a) * r1);
                ctx.stroke();
            }
        }
        const p = punch(m.sincePeak);
        ctx.save();
        ctx.translate(peak.x, peak.y);
        ctx.scale(p.scale * 1.5, p.scale * 1.5);
        ctx.fillStyle = "rgba(241, 214, 136, 0.22)";
        ctx.beginPath();
        ctx.arc(0, 0, 22 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowColor = "rgba(255, 236, 170, 0.9)";
        ctx.shadowBlur = 16 * s;
        starPath(ctx, 14 * s);
        ctx.fillStyle = "#fff3c4";
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.strokeStyle = INK.goldDark;
        ctx.lineWidth = 1.2 * s;
        ctx.stroke();
        ctx.restore();
        callout(ctx, data, fonts, peak, s, { left, right, top: Y(chart.pad.t) }, m.sincePeak - 0.5);
    }
    return { matches: now.matches, ups: now.ups, downs: now.downs };
}

function callout(
    ctx: Ctx,
    data: CollectorsSceneData,
    fonts: Fonts,
    peak: { x: number; y: number },
    s: number,
    bounds: { left: number; right: number; top: number },
    beats: number,
) {
    if (beats < 0) return;
    const p = punch(beats);
    const label = data.text.calloutPeak.toUpperCase();
    const name = data.text.peakName;
    const nameSize = fit(ctx, name, 700, 26 * s, fonts.display, 320 * s, 14 * s);
    const w = Math.max(ctx.measureText(name).width, 120 * s) + 28 * s;
    const h = 30 * s + nameSize;
    // Beside the star, not over the line: to its left, or to its right when the left has no room.
    const gap = 40 * s;
    const x = peak.x - gap - w >= bounds.left ? peak.x - gap - w : Math.min(peak.x + gap, bounds.right - w);
    const y = Math.max(bounds.top - 20 * s, peak.y - h / 2);
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(p.scale, p.scale);
    ctx.translate(-w / 2, -h / 2);
    ctx.fillStyle = "#0b0910ee";
    ctx.strokeStyle = INK.goldDeep;
    ctx.lineWidth = 1.5 * s;
    roundRect(ctx, 0, 0, w, h, 4 * s);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = INK.goldDeep;
    ctx.letterSpacing = `${2 * s}px`;
    ctx.font = font(700, 12 * s, fonts.display);
    ctx.fillText(label, 14 * s, 15 * s);
    ctx.letterSpacing = "0px";
    ctx.fillStyle = "#fff3c4";
    ctx.font = font(700, nameSize, fonts.display);
    ctx.fillText(name, 14 * s, 26 * s + nameSize / 2);
    ctx.restore();
}
