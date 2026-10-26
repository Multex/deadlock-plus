import { flashAt } from "../../../kit/beat";
import { feathered } from "../../../kit/bitmap";
import { clamp01, easeInOut, easeOutBack, easeOutCubic } from "../../../kit/ease";
import { shake } from "../../../kit/motion";
import { setFont, type TextStyle } from "../../../kit/text";
import type { Bitmap, Ctx, Rect } from "../../../kit/types";
import type { SceneAssets, SceneSize } from "../../../scene";
import type { FeatureData } from "../data";
import type { FeatureAngle } from "../slots";
import {
    BODY_PX,
    drawBlock,
    drawCover,
    fitBlock,
    flashOverlay,
    formatNumber,
    grain,
    greasePencil,
    HEADLINE_PX,
    heroPhoto,
    image,
    imageKeys,
    mix,
    PENCIL,
    photoPrint,
    say,
    stage,
    tint,
    vignette,
    withCamera,
    type MonthlyDraw,
    type Stage,
} from "./studio";

/** How the spread pictures its angle. */
export type FeatureArt = "makeover" | "tally" | "pair" | "popart";

export function featureArt(angle: FeatureAngle): FeatureArt {
    switch (angle) {
        case "climb":
        case "slide":
            return "makeover";
        case "streak":
        case "losing_then_winning":
        case "marathon":
        case "winning":
        case "losing":
            return "tally";
        case "duo":
        case "nemesis":
            return "pair";
        default:
            return "popart";
    }
}

/** A frame on the tally: `w` a win circled, `l` a loss crossed out, `-` just the frame. */
export type Mark = "w" | "l" | "-";

const MAX_TALLY = 16;

/** The frames the tally deals for an angle, from the numbers the spread already shows. */
export function tallyMarks(f: Pick<FeatureData, "angle" | "stats">): Mark[] {
    const v = (i: number) => Math.max(0, Math.round(f.stats[i]?.value ?? 0));
    const cap = (n: number) => Math.min(MAX_TALLY, n);
    switch (f.angle) {
        case "streak":
        case "winning":
            return Array(cap(v(0))).fill("w");
        case "losing":
            return Array(cap(v(0))).fill("l");
        case "losing_then_winning": {
            const losses = Math.min(v(0), 8);
            return [...Array(losses).fill("l"), ...Array(cap(v(1) + losses) - losses).fill("w")];
        }
        default:
            return Array(cap(v(0))).fill("-");
    }
}

export interface FeatureLayout {
    art: Rect;
    text: Rect;
}

export function featureLayout(st: Stage): FeatureLayout {
    const { u, m, w, h, safe } = st;
    if (st.aspect === "wide") {
        const aw = w * 0.5;
        return {
            art: { x: m * 0.6, y: m * 0.6, w: aw, h: h - m * 1.2 },
            text: { x: aw + m * 1.4, y: m, w: w - aw - m * 2.2, h: h - 2 * m },
        };
    }
    const tall = st.aspect === "tall";
    const top = tall ? safe.top - 30 * u : m * 0.6;
    const ah = tall ? 680 * u : h * 0.46;
    const ty = top + ah + 40 * u;
    return {
        art: { x: m * 0.5, y: top, w: w - m, h: ah },
        text: { x: m, y: ty, w: w - 2 * m, h: (tall ? safe.bottom : h - m * 0.6) - ty },
    };
}

const POP = ["#ff3d7f", "#ffd23a", "#3ad1ff", "#9b5cff", "#4be37a", "#ff7a3a", "#f4efe4", "#2b6cff", "#ff4b2b"];
const NIGHT = ["#16236b", "#2b1f6e", "#0f3a6b", "#3d2a8a", "#1a4f8a", "#24125a", "#123a5a", "#2d2d7a", "#0d1f4a"];

function starArt(d: MonthlyDraw, assets: SceneAssets, id: number | null): Bitmap | undefined {
    if (id === null) return undefined;
    return image(assets, imageKeys.gloat(id)) ?? image(assets, imageKeys.hero(id));
}

/** The hero in a print; `shot` picks a different framing per frame, a burst rather than one picture copied. */
function cardArt(ctx: Ctx, r: Rect, art: Bitmap | undefined, shot = 0): void {
    if (!art) return;
    const zoom = [1.05, 1.5, 1.25, 1.8, 1.15, 1.6][shot % 6]!;
    const fx = [0.5, 0.35, 0.62, 0.45, 0.55, 0.3][shot % 6]!;
    const c = Math.max(r.w / art.width, r.h / art.height) * zoom;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.drawImage(feathered(art), r.x + (r.w - art.width * c) * fx, r.y + r.h * 0.02, art.width * c, art.height * c);
    ctx.restore();
}

function label(ctx: Ctx, text: string, x: number, y: number, maxW: number, family: string, u: number, k: number): void {
    if (k <= 0 || !text) return;
    const px = 50 * u;
    ctx.save();
    setFont(ctx, { family, weight: 700, px, track: 0.04 } as TextStyle, px);
    const size = Math.max(
        BODY_PX * u,
        Math.min(px, (px * (maxW - 40 * u)) / ctx.measureText(text.toUpperCase()).width),
    );
    setFont(ctx, { family, weight: 700, px: size, track: 0.04 } as TextStyle, size);
    const tw = Math.min(maxW, ctx.measureText(text.toUpperCase()).width + 40 * u);
    ctx.globalAlpha = k;
    ctx.translate(x, y);
    ctx.rotate(-0.025);
    ctx.fillStyle = "#f4efe2";
    ctx.shadowColor = "rgb(0 0 0 / 0.45)";
    ctx.shadowBlur = 14 * u;
    ctx.fillRect(-tw / 2, 0, tw, size * 1.45);
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#16130f";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text.toUpperCase(), 0, size * 0.75, maxW - 30 * u);
    ctx.restore();
}

function arrow(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, k: number, u: number): void {
    if (k <= 0) return;
    const x = x0 + (x1 - x0) * k;
    const y = y0 + (y1 - y0) * k - Math.sin(k * Math.PI) * 40 * u;
    ctx.save();
    ctx.strokeStyle = PENCIL;
    ctx.lineWidth = 12 * u;
    ctx.lineCap = "round";
    ctx.shadowColor = "rgb(0 0 0 / 0.35)";
    ctx.shadowBlur = 8 * u;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo((x0 + x) / 2, (y0 + y) / 2 - 50 * u * k, x, y);
    ctx.stroke();
    if (k > 0.95) {
        const a = Math.atan2(y1 - y0, x1 - x0);
        ctx.beginPath();
        ctx.moveTo(x1 - Math.cos(a - 0.5) * 40 * u, y1 - Math.sin(a - 0.5) * 40 * u);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x1 - Math.cos(a + 0.5) * 40 * u, y1 - Math.sin(a + 0.5) * 40 * u);
        ctx.stroke();
    }
    ctx.restore();
}

/** Before and after: the badge the month opened on, then the one it closed on, wiped in on the bar. */
function makeover(
    ctx: Ctx,
    st: Stage,
    a: Rect,
    local: number,
    bar: number,
    f: FeatureData,
    d: MonthlyDraw,
    assets: SceneAssets,
): void {
    if (!f.badges) return;
    const u = st.u;
    const gap = 60 * u;
    const pw = Math.min((a.w - gap) / 2, (a.h - 90 * u) * 0.8);
    const ph = pw * 1.2;
    const y = a.y + (a.h - 90 * u - ph) / 2;
    const left = { x: a.x + a.w / 2 - gap / 2 - pw, y, w: pw, h: ph };
    const right = { x: a.x + a.w / 2 + gap / 2, y, w: pw, h: ph };
    const up = f.angle === "climb";
    const names = [String(f.deck.params.start ?? ""), String(f.deck.params.end ?? "")];
    const prints: [Rect, number, number, number][] = [
        [left, f.badges.start, 0, -0.05],
        [right, f.badges.end, bar, 0.04],
    ];
    prints.forEach(([r, badge, at, rot], i) => {
        const k = easeOutBack(clamp01((local - at) / 0.35), 1.6);
        if (k <= 0) return;
        const after = i === 1;
        withCamera(
            ctx,
            { ox: r.x + r.w / 2, oy: r.y + r.h / 2, zoom: 0.7 + 0.3 * k, rot: rot * k, dy: (1 - k) * 120 * u },
            () => {
                photoPrint(
                    ctx,
                    r,
                    (inner) => {
                        const tone = after
                            ? up
                                ? mix(d.palette.glow, "#ffe7a0", 0.3)
                                : mix(d.palette.bg, "#26324a", 0.6)
                            : mix(d.palette.bg, "#5a5a5a", 0.5);
                        heroPhoto(ctx, inner, undefined, tone);
                        const img = image(assets, imageKeys.rank(badge));
                        const bs = Math.min(inner.w, inner.h) * 0.78;
                        if (img) {
                            const c = bs / Math.max(img.width, img.height);
                            ctx.save();
                            if (!after || !up) ctx.filter = after ? "saturate(0.7) brightness(0.85)" : "grayscale(0.6)";
                            ctx.drawImage(
                                img,
                                inner.x + (inner.w - img.width * c) / 2,
                                inner.y + (inner.h - img.height * c) / 2,
                                img.width * c,
                                img.height * c,
                            );
                            ctx.restore();
                        } else {
                            ctx.save();
                            ctx.fillStyle = "rgb(255 255 255 / 0.85)";
                            ctx.beginPath();
                            ctx.arc(inner.x + inner.w / 2, inner.y + inner.h / 2, bs * 0.42, 0, Math.PI * 2);
                            ctx.fill();
                            setFont(
                                ctx,
                                { family: assets.fonts.display, weight: 700, px: bs * 0.32 } as TextStyle,
                                bs * 0.32,
                            );
                            ctx.fillStyle = "#16130f";
                            ctx.textAlign = "center";
                            ctx.textBaseline = "middle";
                            ctx.fillText(String(badge % 10 || ""), inner.x + inner.w / 2, inner.y + inner.h / 2);
                            ctx.restore();
                        }
                        if (after) {
                            // The wipe: the after print develops from left to right in the first half second.
                            const wk = clamp01((local - at) / 0.45);
                            ctx.fillStyle = "#fbf8f1";
                            ctx.fillRect(inner.x + inner.w * wk, inner.y, inner.w * (1 - wk), inner.h);
                        }
                    },
                    { border: 18 * u, shadow: 30 * u, sheen: clamp01((local - at) / 1.2) },
                );
                label(
                    ctx,
                    names[i]!,
                    r.x + r.w / 2,
                    r.y + r.h + 20 * u,
                    r.w + gap * 0.8,
                    assets.fonts.display,
                    u,
                    clamp01((local - at - 0.25) / 0.25),
                );
            },
        );
    });
    arrow(
        ctx,
        left.x + left.w * 0.75,
        left.y + 20 * u,
        right.x + right.w * 0.3,
        right.y + 10 * u,
        clamp01((local - bar * 0.6) / (bar * 0.35)),
        u,
    );
}

/** The month as frames dealt on the table, each won one circled and each lost one crossed out. */
function tally(
    ctx: Ctx,
    st: Stage,
    a: Rect,
    local: number,
    bar: number,
    f: FeatureData,
    d: MonthlyDraw,
    assets: SceneAssets,
): void {
    const u = st.u;
    const marks = tallyMarks(f);
    const n = marks.length;
    if (n === 0) return;
    const cols = Math.min(n, st.aspect === "wide" ? 4 : n > 8 ? 6 : Math.min(n, 4));
    const rows = Math.ceil(n / cols);
    const gap = 22 * u;
    const fw = Math.min((a.w - gap * (cols - 1)) / cols, ((a.h - gap * (rows - 1)) / rows) * 0.8);
    const fh = fw * 1.25;
    const gw = cols * fw + (cols - 1) * gap;
    const gh = rows * fh + (rows - 1) * gap;
    const x0 = a.x + (a.w - gw) / 2;
    const y0 = a.y + (a.h - gh) / 2;
    const step = Math.min(0.14, (bar * 1.6) / n);
    const art = starArt(d, assets, f.heroId);
    marks.forEach((m, i) => {
        const at = 0.15 + i * step;
        const k = easeOutBack(clamp01((local - at) / 0.25), 1.8);
        if (k <= 0) return;
        const r = { x: x0 + (i % cols) * (fw + gap), y: y0 + Math.floor(i / cols) * (fh + gap), w: fw, h: fh };
        const rot = (((i * 53) % 9) - 4) * 0.012;
        withCamera(ctx, { ox: r.x + r.w / 2, oy: r.y + r.h / 2, zoom: 1.3 - 0.3 * k, rot: rot + (1 - k) * 0.3 }, () => {
            photoPrint(
                ctx,
                r,
                (inner) => {
                    heroPhoto(ctx, inner, undefined, m === "l" ? mix(d.palette.bg, "#1c2333", 0.6) : d.palette.glow);
                    cardArt(ctx, inner, art, i);
                    if (m === "l") {
                        ctx.fillStyle = "rgb(20 24 34 / 0.45)";
                        ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
                    }
                },
                { border: Math.max(5 * u, fw * 0.05), shadow: 12 * u },
            );
            const mk = clamp01((local - at - 0.2) / 0.25);
            if (m === "w")
                greasePencil(
                    ctx,
                    r.x + r.w / 2,
                    r.y + r.h / 2,
                    r.w * 0.55,
                    r.h * 0.5,
                    i * 13 + 5,
                    mk,
                    Math.max(5 * u, fw * 0.05),
                );
            else if (m === "l" && mk > 0) {
                ctx.save();
                ctx.strokeStyle = PENCIL;
                ctx.lineWidth = Math.max(5 * u, fw * 0.06);
                ctx.lineCap = "round";
                const s = r.w * 0.36;
                const cx = r.x + r.w / 2;
                const cy = r.y + r.h / 2;
                ctx.beginPath();
                ctx.moveTo(cx - s, cy - s);
                ctx.lineTo(cx - s + 2 * s * clamp01(mk * 2), cy - s + 2 * s * clamp01(mk * 2));
                if (mk > 0.5) {
                    ctx.moveTo(cx + s, cy - s);
                    ctx.lineTo(cx + s - 2 * s * clamp01(mk * 2 - 1), cy - s + 2 * s * clamp01(mk * 2 - 1));
                }
                ctx.stroke();
                ctx.restore();
            } else if (m === "-") {
                ctx.save();
                const px = Math.max(BODY_PX * u, fw * 0.3);
                setFont(ctx, { family: assets.fonts.display, weight: 700, px } as TextStyle, px);
                ctx.fillStyle = "#ffffff";
                ctx.shadowColor = "rgb(0 0 0 / 0.7)";
                ctx.shadowBlur = 10 * u;
                ctx.textAlign = "left";
                ctx.textBaseline = "bottom";
                ctx.fillText(formatNumber(d, i + 1), r.x + fw * 0.1, r.y + r.h - fw * 0.08);
                ctx.restore();
            }
        });
    });
}

/** You and the other one: two prints side by side, a heart for a duo, a red ring round a nemesis. */
function pair(
    ctx: Ctx,
    st: Stage,
    a: Rect,
    local: number,
    bar: number,
    f: FeatureData,
    d: MonthlyDraw,
    assets: SceneAssets,
): void {
    const u = st.u;
    const gap = -40 * u;
    const pw = Math.min((a.w - gap) / 2, (a.h - 90 * u) * 0.78);
    const ph = pw * 1.25;
    const y = a.y + (a.h - 90 * u - ph) / 2;
    const left = { x: a.x + a.w / 2 - gap / 2 - pw, y, w: pw, h: ph };
    const right = { x: a.x + a.w / 2 + gap / 2, y: y + 30 * u, w: pw, h: ph };
    const duo = f.angle === "duo";
    const other = String(f.headline.params.mate ?? f.headline.params.rival ?? f.deck.params.rival ?? "");
    const art = starArt(d, assets, f.heroId);
    const sides: [Rect, number, number][] = [
        [left, 0.1, -0.06],
        [right, bar * 0.5, 0.05],
    ];
    sides.forEach(([r, at, rot], i) => {
        const k = easeOutBack(clamp01((local - at) / 0.3), 1.6);
        if (k <= 0) return;
        withCamera(ctx, { ox: r.x + r.w / 2, oy: r.y + r.h / 2, zoom: 0.75 + 0.25 * k, rot: rot * k }, () => {
            photoPrint(
                ctx,
                r,
                (inner) => {
                    if (i === 0) {
                        heroPhoto(ctx, inner, undefined, d.palette.glow);
                        cardArt(ctx, inner, art);
                        return;
                    }
                    heroPhoto(ctx, inner, undefined, duo ? mix(d.palette.accent, "#ffffff", 0.2) : "#2a0f12");
                    // Nobody photographed them: a silhouette in the frame, with a question mark for a rival.
                    ctx.save();
                    ctx.fillStyle = duo ? "rgb(20 16 12 / 0.75)" : "rgb(0 0 0 / 0.85)";
                    const cx = inner.x + inner.w / 2;
                    ctx.beginPath();
                    ctx.arc(cx, inner.y + inner.h * 0.38, inner.w * 0.2, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.ellipse(cx, inner.y + inner.h * 0.95, inner.w * 0.42, inner.h * 0.34, 0, Math.PI, 0);
                    ctx.fill();
                    if (!duo) {
                        const px = inner.w * 0.42;
                        setFont(ctx, { family: assets.fonts.display, weight: 700, px } as TextStyle, px);
                        ctx.fillStyle = PENCIL;
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.fillText("?", cx, inner.y + inner.h * 0.4);
                    }
                    ctx.restore();
                },
                { border: 18 * u, shadow: 30 * u, sheen: clamp01((local - at) / 1.4) },
            );
        });
    });
    label(
        ctx,
        other,
        right.x + right.w / 2,
        right.y + right.h + 14 * u,
        right.w + 60 * u,
        assets.fonts.display,
        u,
        clamp01((local - bar * 0.8) / 0.25),
    );
    const k = clamp01((local - bar) / (bar * 0.6));
    if (duo) heart(ctx, a.x + a.w / 2, y + ph * 0.06, Math.min(pw * 0.2, 90 * u), k, u);
    else greasePencil(ctx, right.x + right.w / 2, right.y + right.h / 2, right.w * 0.62, right.h * 0.6, 71, k, 12 * u);
}

function heart(ctx: Ctx, cx: number, cy: number, s: number, k: number, u: number): void {
    if (k <= 0) return;
    const N = 60;
    ctx.save();
    ctx.strokeStyle = PENCIL;
    ctx.lineWidth = 12 * u;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgb(0 0 0 / 0.35)";
    ctx.shadowBlur = 8 * u;
    ctx.beginPath();
    for (let i = 0; i <= Math.ceil(N * k); i++) {
        const t = (i / N) * Math.PI * 2;
        const x = 16 * Math.sin(t) ** 3;
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        ctx.lineTo(cx + (x * s) / 16, cy - (y * s) / 16);
    }
    ctx.stroke();
    ctx.restore();
}

/** The cover star screen-printed again and again, a different ink each time, flipping in on the beat. */
function popart(
    ctx: Ctx,
    st: Stage,
    a: Rect,
    local: number,
    bar: number,
    f: FeatureData,
    d: MonthlyDraw,
    assets: SceneAssets,
): void {
    const u = st.u;
    const [cols, rows] = st.aspect === "wide" ? [3, 3] : [4, 2];
    const gap = 14 * u;
    const tw = Math.min((a.w - gap * (cols - 1)) / cols, (a.h - gap * (rows - 1)) / rows);
    const gw = cols * tw + (cols - 1) * gap;
    const gh = rows * tw + (rows - 1) * gap;
    const x0 = a.x + (a.w - gw) / 2;
    const y0 = a.y + (a.h - gh) / 2;
    const night = f.angle === "night_owl";
    const inks = night ? NIGHT : [d.palette.accent, ...POP];
    const cast = f.angle === "explorer" ? (d.video.beats.m_wardrobe?.swatches.map((s) => s.heroId) ?? []) : [];
    const beat = bar / 4;
    for (let i = 0; i < cols * rows; i++) {
        const at = 0.1 + i * Math.min(beat * 0.5, (bar * 1.4) / (cols * rows));
        const k = easeInOut(clamp01((local - at) / 0.22));
        if (k <= 0) continue;
        const r = { x: x0 + (i % cols) * (tw + gap), y: y0 + Math.floor(i / cols) * (tw + gap), w: tw, h: tw };
        const id = cast.length ? cast[i % cast.length]! : f.heroId;
        const art = starArt(d, assets, id);
        ctx.save();
        ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
        ctx.scale(Math.max(0.02, k), 1);
        ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
        ctx.beginPath();
        ctx.rect(r.x, r.y, r.w, r.h);
        ctx.clip();
        const ink = inks[i % inks.length]!;
        ctx.fillStyle = ink;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        if (art) {
            const breathe = 1.02 + 0.03 * Math.sin(local * 2 + i);
            ctx.save();
            ctx.globalCompositeOperation = "luminosity";
            drawCover(ctx, feathered(art), r, 0.5, 0.15, breathe);
            ctx.restore();
            ctx.save();
            ctx.globalCompositeOperation = "color";
            ctx.fillStyle = tint(ink, 0.85);
            ctx.fillRect(r.x, r.y, r.w, r.h);
            ctx.restore();
        }
        ctx.strokeStyle = "rgb(0 0 0 / 0.5)";
        ctx.lineWidth = 3 * u;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.restore();
    }
    if (night) {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        const mx = a.x + a.w * 0.82;
        const my = a.y + a.h * 0.12;
        const g = ctx.createRadialGradient(mx, my, 0, mx, my, 160 * u);
        g.addColorStop(0, "rgb(255 250 220 / 0.95)");
        g.addColorStop(0.35, "rgb(255 250 220 / 0.6)");
        g.addColorStop(1, "rgb(255 250 220 / 0)");
        ctx.fillStyle = g;
        ctx.fillRect(mx - 200 * u, my - 200 * u, 400 * u, 400 * u);
        ctx.restore();
    }
}

const ARTS: Record<FeatureArt, typeof tally> = { makeover, tally, pair, popart };

/** The lead signal's spread: the headline slams on the downbeat, the angle's own picture builds beside it. */
export function draw(
    ctx: Ctx,
    local: number,
    span: number,
    size: SceneSize,
    d: MonthlyDraw,
    assets: SceneAssets,
): void {
    const f = d.video.beats.m_feature;
    if (!f) return;
    const st = stage(size);
    const u = st.u;
    const bar = assets.timing.barSeconds;
    const fonts = assets.fonts;
    const lay = featureLayout(st);
    const kind = featureArt(f.angle);
    const pal = d.palette;

    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, st.w, st.h);
    const glow = ctx.createRadialGradient(
        lay.art.x + lay.art.w / 2,
        lay.art.y + lay.art.h / 2,
        0,
        lay.art.x + lay.art.w / 2,
        lay.art.y + lay.art.h / 2,
        Math.max(lay.art.w, lay.art.h) * 0.8,
    );
    glow.addColorStop(0, tint(pal.glow, 0.85));
    glow.addColorStop(1, tint(pal.glow, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, st.w, st.h);
    // The headline's number, huge and faint behind everything: the spread's watermark.
    const big = f.stats[0] ? formatNumber(d, f.stats[0].value) : "";
    if (big) {
        const px = (st.aspect === "wide" ? 1000 : 1100) * u;
        ctx.save();
        setFont(ctx, { family: fonts.display, weight: 700, px } as TextStyle, px);
        ctx.fillStyle = tint(pal.accent, 0.16);
        ctx.textAlign = "right";
        ctx.textBaseline = "alphabetic";
        const rise = easeOutCubic(local / (bar * 1.5));
        ctx.fillText(big, st.w + px * 0.04 - (local / span) * 60 * u, st.h + px * 0.2 + (1 - rise) * px * 0.4);
        ctx.restore();
    }

    const [sx, sy] = shake(local, 18 * u * clamp01(1 - local / 0.3), 4);
    withCamera(
        ctx,
        {
            ox: lay.art.x + lay.art.w / 2,
            oy: lay.art.y + lay.art.h / 2,
            zoom: 1 + 0.05 * easeInOut(local / span),
            dx: sx * 0.4,
            dy: sy * 0.4,
        },
        () => ARTS[kind](ctx, st, lay.art, local, bar, f, d, assets),
    );

    const kStyle = { family: fonts.display, weight: 700, fill: pal.accent };
    const hStyle = { family: fonts.display, weight: 700, fill: pal.fg };
    const dStyle = { family: fonts.body, weight: 600, fill: mix(pal.fg, pal.fg, 0, 0.92) };
    const wide = st.aspect === "wide";
    const kick = fitBlock(ctx, say(d, f.kicker).toUpperCase(), kStyle, {
        px: 52 * u,
        floor: BODY_PX * u,
        maxW: lay.text.w,
        maxLines: 1,
    });
    const head = fitBlock(
        ctx,
        say(d, f.headline).toUpperCase(),
        hStyle,
        {
            px: (wide ? 150 : 170) * u,
            floor: HEADLINE_PX * u,
            maxW: lay.text.w,
            maxLines: wide ? 3 : 2,
        },
        0.92,
    );
    const deck = fitBlock(
        ctx,
        say(d, f.deck),
        dStyle,
        { px: 60 * u, floor: BODY_PX * u, maxW: lay.text.w, maxLines: 3 },
        1.15,
    );
    const gap = 26 * u;
    const total = kick.height + gap + head.height + gap * 1.4 + deck.height;
    let y = wide ? lay.text.y + (lay.text.h - total) / 2 : lay.text.y + Math.max(0, (lay.text.h - total) * 0.35);
    drawBlock(ctx, kick, lay.text.x, y, kStyle, { reveal: clamp01(local / 0.2) });
    y += kick.height + gap;
    const hk = easeOutBack(clamp01(local / 0.22), 2.2);
    withCamera(ctx, { ox: lay.text.x, oy: y + head.height / 2, zoom: 1.5 - 0.5 * hk, dx: sx, dy: sy }, () => {
        ctx.globalAlpha = clamp01(local / 0.08);
        drawBlock(ctx, head, lay.text.x, y, hStyle, { shadow: "rgb(0 0 0 / 0.4)" });
        ctx.globalAlpha = 1;
    });
    y += head.height + gap * 0.6;
    ctx.fillStyle = pal.accent;
    ctx.fillRect(lay.text.x, y, Math.min(lay.text.w, 260 * u) * easeOutCubic((local - 0.3) / 0.4), 8 * u);
    y += gap * 0.8;
    drawBlock(ctx, deck, lay.text.x, y, dStyle, { reveal: clamp01((local - bar) / (bar * 0.5)) });

    vignette(ctx, st, 0.35);
    grain(ctx, st, local, 0.07);
    flashOverlay(ctx, st, flashAt(local, 0) * 0.6 + (kind === "makeover" ? flashAt(local, bar) * 0.5 : 0));
}
