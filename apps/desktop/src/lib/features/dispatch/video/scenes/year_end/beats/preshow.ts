import { flashAt } from "../../../kit/beat";
import { clamp01, easeInOut } from "../../../kit/ease";
import { sceneFrame } from "../../../kit/frame";
import { seeded } from "../../../kit/rng";
import type { Ctx } from "../../../kit/types";
import type { SceneAssets, SceneSize } from "../../../scene";
import { INK, dust, goldGradient } from "../draw";
import {
    blockHeight,
    bulb,
    drawRich,
    grain,
    layoutRich,
    numberSpan,
    richMeasure,
    say,
    seedOf,
    spotlight,
    vignette,
    type Look,
    type Run,
    type Stage,
} from "./stage";

/** Bar cues the marquee lights on, one `marquee_bulb` each (the plan's `awardsSfx`). */
const CUES = 4;
const MARQUEE_MAX = 168;
const MARQUEE_MIN = 96;

/** The facade from the top down: the marquee sign, then the hook under it; the carpet's horizon follows them. */
export function preshowLayout(w: number, h: number) {
    const { u, safe } = sceneFrame(w, h);
    const tall = h > w * 1.2;
    const wide = w > h * 1.2;
    return {
        u,
        tall,
        wide,
        marqueeW: tall ? w - 64 * u : wide ? Math.min(w - 240 * u, 1460 * u) : w - 120 * u,
        top: tall ? safe.top + 10 * u : 54 * u,
        hookMaxW: tall ? w - 130 * u : wide ? Math.min(1240 * u, w - 300 * u) : w - 200 * u,
    };
}

/** When word `i` of `n` lights: spread over the bar cues, the first on frame 0. */
export function wordCue(i: number, n: number, cues: number): number {
    return Math.min(cues - 1, Math.floor((i * cues) / Math.max(1, n)));
}

export function draw(ctx: Ctx, local: number, span: number, size: SceneSize, data: Stage, assets: SceneAssets): void {
    const { w, h } = size;
    const L = preshowLayout(w, h);
    const { u, tall } = L;
    const fonts = assets.fonts;
    const bar = assets.timing.barSeconds > 0 ? assets.timing.barSeconds : span / 5;
    const beat = bar / 4;
    const bars = Math.max(1, Math.round(span / bar));
    const cues = Math.min(CUES, bars);
    const p = clamp01(local / span);
    const seed = seedOf(`${data.awards.player ?? ""}|${data.awards.year}`);
    /** The last bars after the cues: every bulb comes up for the drop. */
    const riser = clamp01((local - cues * bar) / Math.max(beat, span - cues * bar));

    const marqueeText = (say(data, data.awards.preshow.marquee) || data.awards.year).toLocaleUpperCase();
    const marqueeLook = (): Look => ({ family: fonts.display, weight: 700, fill: INK.gold, track: 0.05 });
    const measureM = richMeasure(ctx, marqueeLook);
    const pad = 58 * u;
    const innerW = L.marqueeW - pad * 2;
    let px = MARQUEE_MAX * u;
    let mLines = layoutRich([{ text: marqueeText, px }], innerW, measureM);
    const maxLines = tall ? 3 : 2;
    while (px > MARQUEE_MIN * u && (mLines.length > maxLines || mLines.some((l) => l.width > innerW))) {
        px -= 4 * u;
        mLines = layoutRich([{ text: marqueeText, px }], innerW, measureM);
    }
    const mH = blockHeight(mLines, 1.02) + pad * 2;
    const marquee = { x: (w - L.marqueeW) / 2, y: L.top, w: L.marqueeW, h: mH };

    const hookText = say(data, data.awards.preshow.hook);
    const figure = data.awards.preshow.figures[0]?.value;
    const span0 = figure === undefined ? null : numberSpan(hookText, figure);
    const bodyPx = (tall ? 70 : 64) * u;
    const numPx = (tall ? 236 : L.wide ? 150 : 170) * u;
    // Outside a wide frame the count gets a line of its own between the words before and after it, so it never wraps
    // away from its words and reads as the hook's headline in every language.
    const pieces: Run[] = span0
        ? [
              { text: hookText.slice(0, span0.start), px: bodyPx },
              { text: hookText.slice(span0.start, span0.end), px: numPx, tag: "num" },
              { text: hookText.slice(span0.end), px: bodyPx },
          ]
        : [{ text: hookText, px: bodyPx }];
    let numTop = 0;
    const hookLook = (tag?: string): Look =>
        tag === "num"
            ? {
                  family: fonts.display,
                  weight: 700,
                  fill: goldGradient(ctx, 0, numTop, 0, numTop + numPx),
                  glow: 26 * u,
              }
            : { family: fonts.body, weight: 600, fill: INK.cream, glow: 18 * u, glowColor: "rgb(0 0 0 / 0.9)" };
    let hookTop = marquee.y + marquee.h + (tall ? 50 : 30) * u;
    const measureH = richMeasure(ctx, hookLook);
    // A wide frame has the width for the count to sit inline and the height to spare for the carpet.
    const hLines = L.wide
        ? layoutRich(pieces, L.hookMaxW, measureH)
        : pieces.flatMap((r) => {
              const text = r.text.trim();
              return text ? layoutRich([{ ...r, text }], L.hookMaxW, measureH) : [];
          });
    const hookH = blockHeight(hLines);
    const horizon = Math.min(h * 0.82, Math.max(hookTop + hookH + (tall ? 70 : 30) * u, h * (tall ? 0.6 : 0.62)));

    // The camera dollies down the carpet; the facade, being far, grows a little.
    const dolly = easeInOut(p);
    const far = 1 + 0.035 * dolly;

    ctx.fillStyle = INK.room;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2, horizon);
    ctx.scale(far, far);
    ctx.translate(-w / 2, -horizon);
    stepAndRepeat(ctx, w, horizon, u, data, fonts.pulp, local);
    ctx.restore();

    carpet(ctx, w, h, horizon, u, tall, dolly * 0.55, riser);
    dust(ctx, w, h, local, u, 0.55, 0.6 + riser * 2.5);

    ctx.save();
    ctx.translate(w / 2, horizon);
    ctx.scale(far, far);
    ctx.translate(-w / 2, -horizon);
    spotlight(ctx, w / 2, marquee.y + marquee.h * 0.5, marquee.w * 0.75, marquee.h * 1.1, 0.5 + 0.5 * riser);
    drawMarquee(ctx, marquee, mLines, pad, u, local, bar, beat, cues, riser, marqueeLook());
    if (hLines.length) {
        const cx = w / 2;
        const scrim = ctx.createRadialGradient(cx, hookTop + hookH / 2, 0, cx, hookTop + hookH / 2, L.hookMaxW * 0.7);
        scrim.addColorStop(0, "rgb(6 5 4 / 0.82)");
        scrim.addColorStop(1, "rgb(6 5 4 / 0)");
        ctx.fillStyle = scrim;
        ctx.fillRect(0, hookTop - 120 * u, w, hookH + 240 * u);
        hookTop -= 6 * u * dolly;
        numTop = hookTop;
        for (const l of hLines) {
            if (l.words.some((wd) => wd.tag === "num")) break;
            numTop += l.height * 1.08;
        }
        drawRich(ctx, hLines, cx, hookTop, hookLook);
        shimmer(ctx, hLines, cx, hookTop, local, bar, cues, u);
    }
    ctx.restore();

    paparazzi(ctx, w, h, horizon, u, local, span, beat, seed);
    vignette(ctx, w, h, 0.7);
    grain(ctx, w, h, local, u);
}

function stepAndRepeat(ctx: Ctx, w: number, bottom: number, u: number, data: Stage, family: string, t: number): void {
    const wall = ctx.createLinearGradient(0, 0, 0, bottom);
    wall.addColorStop(0, "#0b0906");
    wall.addColorStop(1, "#17120b");
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, bottom);
    const name = (data.awards.player ?? "").toLocaleUpperCase();
    const words = name ? [name, data.awards.year] : [data.awards.year];
    const px = 46 * u;
    ctx.font = `700 ${px}px "${family}"`;
    ctx.letterSpacing = `${0.12 * px}px`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    const cell = Math.max(...words.map((s) => ctx.measureText(s).width)) + 90 * u;
    const row = 112 * u;
    // A slow drift: the banner is lit by a light that moves.
    const lightX = w * (0.35 + 0.3 * Math.sin(t * 0.6));
    for (let r = 0, y = row / 2; y < bottom + row; r++, y += row) {
        const shift = r % 2 ? cell / 2 : 0;
        for (let x = -cell + shift, i = r; x < w + cell; x += cell, i++) {
            const near = 1 - Math.min(1, Math.abs(x - lightX) / (w * 0.6));
            ctx.fillStyle = `rgb(222 184 102 / ${0.07 + 0.11 * near})`;
            ctx.fillText(words[i % words.length], x, y);
        }
    }
    ctx.letterSpacing = "0px";
    const floor = ctx.createLinearGradient(0, bottom - 200 * u, 0, bottom);
    floor.addColorStop(0, "rgb(6 5 4 / 0)");
    floor.addColorStop(1, "rgb(6 5 4 / 0.85)");
    ctx.fillStyle = floor;
    ctx.fillRect(0, bottom - 200 * u, w, 200 * u);
}

/** Screen scale of a point `z` deep on the carpet: 1 at the frame's bottom edge, falling toward the horizon. */
const depth = (z: number) => 1 / (1 + 2.6 * z);

function carpet(ctx: Ctx, w: number, h: number, hy: number, u: number, tall: boolean, camZ: number, riser: number) {
    const cx = w / 2;
    const near = (tall ? 430 : 380) * u;
    const y = (s: number) => hy + (h - hy) * s;
    const zFar = 5;
    const sFar = depth(zFar);

    ctx.fillStyle = "#0c0906";
    ctx.fillRect(0, hy, w, h - hy);

    const fill = ctx.createLinearGradient(0, hy, 0, h);
    fill.addColorStop(0, "#3a0609");
    fill.addColorStop(0.5, "#7d0d16");
    fill.addColorStop(1, "#a8141f");
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(cx - near * sFar, y(sFar));
    ctx.lineTo(cx + near * sFar, y(sFar));
    ctx.lineTo(cx + near * 1.4, y(1.4));
    ctx.lineTo(cx - near * 1.4, y(1.4));
    ctx.closePath();
    ctx.fill();

    // Seams across the pile, coming toward the camera as it moves.
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = "rgb(0 0 0 / 0.22)";
    ctx.lineWidth = 2 * u;
    for (let k = 0; k < 24; k++) {
        const z = k * 0.4 - (camZ % 0.4);
        if (z < -0.2 || z > zFar) continue;
        const s = depth(z);
        ctx.beginPath();
        ctx.moveTo(cx - near * s, y(s));
        ctx.lineTo(cx + near * s, y(s));
        ctx.stroke();
    }
    spotlight(ctx, cx, y(depth(1.6)), near * 1.1, near * 0.35, 0.8 + riser * 0.6);
    ctx.restore();

    for (const side of [-1, 1]) {
        ctx.strokeStyle = INK.gold;
        ctx.lineWidth = 5 * u;
        ctx.beginPath();
        ctx.moveTo(cx + side * near * sFar, y(sFar));
        ctx.lineTo(cx + side * near * 1.4, y(1.4));
        ctx.stroke();
    }

    // Brass stanchions down both sides with velvet rope between; drawn far to near so the near ones overlap.
    const posts = [4.4, 3.2, 2.2, 1.4, 0.75, 0.25, -0.15];
    for (const side of [-1, 1]) {
        let prev: { x: number; top: number; s: number } | null = null;
        for (const z0 of posts) {
            const z = z0 - camZ;
            if (z < -0.3) continue;
            const s = depth(z);
            const x = cx + side * (near + 70 * u) * s;
            const base = y(s);
            const height = 300 * u * s;
            const top = base - height;
            if (prev) {
                ctx.strokeStyle = "#6e0b14";
                ctx.lineWidth = Math.max(2, 14 * u * s);
                ctx.lineCap = "round";
                ctx.beginPath();
                ctx.moveTo(prev.x, prev.top + 10 * u * prev.s);
                const sag = 60 * u * s;
                ctx.quadraticCurveTo((prev.x + x) / 2, (prev.top + top) / 2 + sag, x, top + 10 * u * s);
                ctx.stroke();
                ctx.strokeStyle = "rgb(255 120 120 / 0.25)";
                ctx.lineWidth = Math.max(1, 4 * u * s);
                ctx.stroke();
            }
            const pole = ctx.createLinearGradient(x - 9 * u * s, 0, x + 9 * u * s, 0);
            pole.addColorStop(0, INK.goldDeep);
            pole.addColorStop(0.45, "#fff0c0");
            pole.addColorStop(1, "#5c3f12");
            ctx.fillStyle = pole;
            ctx.fillRect(x - 8 * u * s, top, 16 * u * s, height);
            ctx.beginPath();
            ctx.ellipse(x, base, 34 * u * s, 10 * u * s, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x, top, 15 * u * s, 0, Math.PI * 2);
            ctx.fill();
            prev = { x, top, s };
        }
    }
}

function drawMarquee(
    ctx: Ctx,
    m: { x: number; y: number; w: number; h: number },
    lines: ReturnType<typeof layoutRich>,
    pad: number,
    u: number,
    t: number,
    bar: number,
    beat: number,
    cues: number,
    riser: number,
    look: Look,
): void {
    ctx.save();
    ctx.shadowColor = "rgb(0 0 0 / 0.8)";
    ctx.shadowBlur = 50 * u;
    ctx.shadowOffsetY = 24 * u;
    ctx.fillStyle = "#0a0805";
    ctx.fillRect(m.x, m.y, m.w, m.h);
    ctx.restore();
    ctx.strokeStyle = goldGradient(ctx, m.x, m.y, m.x + m.w, m.y + m.h);
    ctx.lineWidth = 8 * u;
    ctx.strokeRect(m.x + 4 * u, m.y + 4 * u, m.w - 8 * u, m.h - 8 * u);
    ctx.lineWidth = 2 * u;
    ctx.strokeRect(m.x + 40 * u, m.y + 40 * u, m.w - 80 * u, m.h - 80 * u);

    // Bulbs chase round the frame on the eighth notes; every bar cue fires them all at once.
    const gap = 40 * u;
    const inset = 22 * u;
    const pts: [number, number][] = [];
    const ix = m.x + inset;
    const iy = m.y + inset;
    const iw = m.w - inset * 2;
    const ih = m.h - inset * 2;
    const across = Math.max(2, Math.round(iw / gap));
    const down = Math.max(2, Math.round(ih / gap));
    for (let i = 0; i < across; i++) pts.push([ix + (iw * i) / across, iy]);
    for (let i = 0; i < down; i++) pts.push([ix + iw, iy + (ih * i) / down]);
    for (let i = 0; i < across; i++) pts.push([ix + iw - (iw * i) / across, iy + ih]);
    for (let i = 0; i < down; i++) pts.push([ix, iy + ih - (ih * i) / down]);
    const step = Math.floor(t / (beat / 2));
    let hit = 0;
    for (let c = 0; c < cues; c++) hit = Math.max(hit, t >= c * bar ? Math.exp(-(t - c * bar) / 0.32) : 0);
    pts.forEach(([x, y], i) => {
        const chase = (i + step) % 3 === 0 ? 1 : 0.12;
        bulb(ctx, x, y, 8.5 * u, Math.max(chase, hit, riser));
    });

    // Letters light word by word on the cues, each word's letters a quick cascade with a flicker as they catch.
    let wi = 0;
    const totalWords = lines.reduce((n, l) => n + l.words.length, 0);
    let y = m.y + pad;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    for (const line of lines) {
        const left = m.x + (m.w - line.width) / 2;
        const base = y + line.height * 0.8;
        for (const word of line.words) {
            const cueT = wordCue(wi, totalWords, cues) * bar;
            ctx.font = `${look.weight} ${word.px}px "${look.family}"`;
            ctx.letterSpacing = `${(look.track ?? 0) * word.px}px`;
            let x = left + word.x;
            const chars = [...word.text];
            chars.forEach((ch, j) => {
                const at = cueT + (j / chars.length) * beat * 0.9;
                const v = t - at;
                const on = v < 0 ? 0 : v < 0.14 ? (Math.sin(v * 140) > -0.2 ? 1 : 0.25) : 1;
                if (on > 0.5) {
                    ctx.shadowColor = "rgb(255 190 80 / 0.95)";
                    ctx.shadowBlur = (22 + 14 * riser) * u;
                    ctx.fillStyle = goldGradient(ctx, 0, base - word.px * 0.8, 0, base);
                } else {
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = on > 0 ? "#6b5228" : "#2c2112";
                }
                ctx.fillText(ch, x, base);
                ctx.shadowBlur = 0;
                if (on <= 0.5) {
                    ctx.strokeStyle = "#4d3a1a";
                    ctx.lineWidth = 1.5 * u;
                    ctx.strokeText(ch, x, base);
                }
                x += ctx.measureText(ch).width;
            });
            wi++;
        }
        ctx.letterSpacing = "0px";
        y += line.height * 1.02;
    }
    ctx.shadowColor = "transparent";
}

/** A glint across the gold number on each bar cue. */
function shimmer(
    ctx: Ctx,
    lines: ReturnType<typeof layoutRich>,
    cx: number,
    top: number,
    t: number,
    bar: number,
    cues: number,
    u: number,
): void {
    const since = t % bar;
    if (t > cues * bar + bar || since > 0.5) return;
    let y = top;
    for (const line of lines) {
        const left = cx - line.width / 2;
        for (const wd of line.words) {
            if (wd.tag !== "num") continue;
            const k = since / 0.5;
            const gx = left + wd.x + (wd.w + 200 * u) * k - 100 * u;
            const g = ctx.createLinearGradient(gx - 60 * u, 0, gx + 60 * u, 0);
            g.addColorStop(0, "rgb(255 255 255 / 0)");
            g.addColorStop(0.5, `rgb(255 250 230 / ${0.55 * (1 - k)})`);
            g.addColorStop(1, "rgb(255 255 255 / 0)");
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            ctx.beginPath();
            ctx.rect(left + wd.x, y, wd.w, line.height);
            ctx.clip();
            ctx.fillStyle = g;
            ctx.fillRect(left + wd.x, y, wd.w, line.height);
            ctx.restore();
        }
        y += line.height * 1.08;
    }
}

/** Photographers' flashes from both sides of the carpet, on the eighth notes, the same for one player every time. */
function paparazzi(
    ctx: Ctx,
    w: number,
    h: number,
    hy: number,
    u: number,
    t: number,
    span: number,
    beat: number,
    seed: number,
): void {
    const r = seeded(seed);
    const n = Math.max(4, Math.round(span * 1.7));
    let white = 0;
    for (let i = 0; i < n; i++) {
        const at = Math.round((0.4 + r() * (span / beat - 1.4)) * 2) * (beat / 2);
        const left = r() < 0.5;
        const x = left ? w * (0.02 + r() * 0.2) : w * (0.78 + r() * 0.2);
        const y = hy + (h - hy) * (0.05 + r() * 0.7);
        const f = flashAt(t, at);
        if (f <= 0) continue;
        white = Math.max(white, f);
        spotlight(ctx, x, y, 260 * u, 260 * u, f * 2.2, false);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = `rgb(255 255 255 / ${0.8 * f})`;
        ctx.lineWidth = 3 * u;
        const len = 120 * u * f;
        ctx.beginPath();
        ctx.moveTo(x - len, y);
        ctx.lineTo(x + len, y);
        ctx.moveTo(x, y - len);
        ctx.lineTo(x, y + len);
        ctx.stroke();
        ctx.restore();
    }
    if (white > 0) {
        ctx.fillStyle = `rgb(255 250 240 / ${0.1 * white})`;
        ctx.fillRect(0, 0, w, h);
    }
}
