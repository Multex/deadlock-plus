import { badgeParts } from "@deadlock-plus/stats/rank";
import { clamp01, easeOutBack, easeOutCubic } from "../../../kit/ease";
import { seeded } from "../../../kit/rng";
import type { Bitmap, Ctx, Rect } from "../../../kit/types";
import type { SceneAssets } from "../../../scene";
import type { Card } from "../data";
import type { Deck, RarityStyle } from "./card";

export interface ArtState {
    card: Card;
    deck: Deck;
    assets: SceneAssets;
    rect: Rect;
    style: RarityStyle;
    /** Seconds since the face turned up. */
    since: number;
    tilt: number;
}

/** The image key of a hero's card art in a mood; prepare loads these for the heroes the cards show. */
export const moodKey = (heroId: number, mood: "gloat" | "critical") => `mood:${heroId}:${mood}`;
/** The image key of a rank tier's badge art. */
export const tierKey = (tier: number) => `tier:${tier}`;

/** Tier colours for a badge drawn without art, Initiate to Eternus. */
const TIER_INK = [
    "#8a8f98",
    "#9a7b5a",
    "#5f8f5a",
    "#4f8fb0",
    "#6a6fc8",
    "#9a5fc8",
    "#c85f9a",
    "#c8735f",
    "#c8a65f",
    "#e2c76b",
    "#f0e6c0",
    "#ffffff",
];

/** Element `i` of `n` comes in this long after the face turns up, the last one by `within` seconds. */
const stagger = (since: number, i: number, n: number, within = 1.1, each = 0.35) =>
    clamp01((since - 0.3 - (i * (within - each)) / Math.max(1, n - 1)) / each);

function contain(ctx: Ctx, img: Bitmap, cx: number, cy: number, w: number, h: number) {
    const s = Math.min(w / img.width, h / img.height);
    ctx.drawImage(img, cx - (img.width * s) / 2, cy - (img.height * s) / 2, img.width * s, img.height * s);
}

/** A rank badge: the tier's art when there is some, else an engraved hexagon in the tier's colour. */
export function drawBadge(ctx: Ctx, badge: number, x: number, y: number, size: number, assets: SceneAssets): void {
    const p = badgeParts(badge);
    const img = p ? assets.images[tierKey(p.tier)] : undefined;
    ctx.save();
    ctx.shadowColor = "rgb(0 0 0 / 0.6)";
    ctx.shadowBlur = size * 0.12;
    ctx.shadowOffsetY = size * 0.04;
    if (img) {
        contain(ctx, img, x, y, size, size);
        ctx.restore();
        return;
    }
    const ink = TIER_INK[Math.min(TIER_INK.length - 1, Math.max(0, p?.tier ?? 0))];
    const r = size * 0.46;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.3, ink);
    g.addColorStop(1, "#111");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.lineWidth = size * 0.04;
    ctx.strokeStyle = "#f1d688";
    ctx.stroke();
    const sub = p?.sub ?? 0;
    for (let i = 0; i < sub; i++) {
        const a = -Math.PI / 2 + ((i - (sub - 1) / 2) * Math.PI) / 9;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62 + r * 0.25, size * 0.045, 0, Math.PI * 2);
        ctx.fillStyle = "#fff6d0";
        ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y + r * 0.1, r * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = "rgb(0 0 0 / 0.35)";
    ctx.fill();
    ctx.restore();
}

function backdrop(ctx: Ctx, s: ArtState) {
    const { rect: r, style } = s;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const g = ctx.createRadialGradient(cx, cy + r.h * 0.15, 10, cx, cy, Math.max(r.w, r.h) * 0.75);
    g.addColorStop(0, style.accent);
    g.addColorStop(0.45, style.panel);
    g.addColorStop(1, style.panelDeep);
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.strokeStyle = style.accent;
    ctx.fillStyle = style.accent;
    switch (style.pattern) {
        case "dots":
            ctx.globalAlpha = 0.35;
            for (let y = r.y + 10; y < r.y + r.h; y += 22)
                for (let x = r.x + 10 + ((y / 22) % 2) * 11; x < r.x + r.w; x += 22) {
                    const d = Math.hypot(x - cx, y - cy) / (r.w * 0.7);
                    ctx.beginPath();
                    ctx.arc(x, y, Math.max(0.5, 5 * (1 - d)), 0, Math.PI * 2);
                    ctx.fill();
                }
            break;
        case "lines":
            ctx.globalAlpha = 0.3;
            ctx.lineWidth = 6;
            for (let x = r.x - r.h; x < r.x + r.w; x += 30) {
                ctx.beginPath();
                ctx.moveTo(x, r.y + r.h);
                ctx.lineTo(x + r.h, r.y);
                ctx.stroke();
            }
            break;
        case "rays":
        case "burst": {
            ctx.globalAlpha = style.pattern === "burst" ? 0.55 : 0.35;
            const n = style.pattern === "burst" ? 28 : 18;
            const spin = s.since * 0.05;
            for (let i = 0; i < n; i++) {
                const a = spin + (i / n) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(cx, cy + r.h * 0.2);
                ctx.arc(cx, cy + r.h * 0.2, r.w, a, a + Math.PI / n);
                ctx.closePath();
                ctx.fill();
            }
            break;
        }
        case "prism": {
            ctx.globalAlpha = 0.6;
            const p = ctx.createLinearGradient(r.x + s.tilt * 200, r.y, r.x + r.w + s.tilt * 200, r.y + r.h);
            ["#ff8fd0", "#ffd77a", "#8dffcf", "#7fd0ff", "#c49bff"].forEach((c, i) => p.addColorStop(i / 4, c));
            ctx.fillStyle = p;
            ctx.fillRect(r.x, r.y, r.w, r.h);
            break;
        }
    }
    ctx.restore();
    const v = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    v.addColorStop(0, "rgb(0 0 0 / 0.25)");
    v.addColorStop(0.4, "rgb(0 0 0 / 0)");
    v.addColorStop(1, "rgb(0 0 0 / 0.45)");
    ctx.fillStyle = v;
    ctx.fillRect(r.x, r.y, r.w, r.h);
}

/** The hero's card art, smug or battered, rising into the window as the face lands. */
function heroArt(ctx: Ctx, s: ArtState, burst: boolean) {
    const { rect: r, card, assets } = s;
    const hero = card.hero!;
    const img = assets.images[moodKey(hero.id, hero.mood)] ?? assets.images[`hero:${hero.id}`];
    const k = easeOutCubic((s.since - 0.05) / 0.8);
    if (hero.mood === "critical") {
        ctx.save();
        ctx.globalCompositeOperation = "color";
        ctx.fillStyle = "#3a4a66";
        ctx.globalAlpha = 0.55;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.restore();
        ctx.save();
        ctx.strokeStyle = "rgb(255 255 255 / 0.12)";
        ctx.lineWidth = 3;
        const rng = seeded(hero.id * 31 + 7);
        for (let i = 0; i < 9; i++) {
            const x = r.x + rng() * r.w;
            ctx.beginPath();
            ctx.moveTo(x, r.y);
            ctx.lineTo(x - 80 - rng() * 120, r.y + r.h);
            ctx.stroke();
        }
        ctx.restore();
    }
    if (burst) {
        ctx.save();
        ctx.translate(r.x + r.w * 0.28, r.y + r.h * 0.24);
        ctx.rotate(s.since * 0.4);
        ctx.scale(easeOutBack((s.since - 0.4) / 0.4), easeOutBack((s.since - 0.4) / 0.4));
        ctx.beginPath();
        for (let i = 0; i < 24; i++) {
            const a = (i / 24) * Math.PI * 2;
            const rr = i % 2 ? 46 : 78;
            ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = "#f1d688";
        ctx.fill();
        ctx.restore();
    }
    const h = r.h * 1.12;
    const cx = r.x + r.w * 0.42;
    const cy = r.y + r.h - h / 2 + (1 - k) * 80 + 10;
    ctx.save();
    if (img) {
        ctx.shadowColor = s.style.accent;
        ctx.shadowBlur = 40;
        const zoom = 1 + 0.04 * clamp01(s.since / 4);
        contain(ctx, img, cx, cy, r.w * 1.1 * zoom, h * zoom);
    } else {
        ctx.beginPath();
        ctx.ellipse(cx, r.y + r.h * 0.42, r.h * 0.2, r.h * 0.24, 0, 0, Math.PI * 2);
        ctx.ellipse(cx, r.y + r.h * 1.05, r.h * 0.42, r.h * 0.4, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgb(0 0 0 / 0.55)";
        ctx.fill();
    }
    ctx.restore();
}

/**
 * The season as a tally: a stroke per ranked match in gates of five, wins first in green then losses in red, the
 * way a ledger keeps count. Capped so the strokes stay thick.
 */
function tallyArt(ctx: Ctx, s: ArtState) {
    const { rect: r, card } = s;
    const [matches, wins, losses] = card.stats;
    const total = Math.min(60, matches?.value ?? 1);
    const won = wins && losses ? Math.round((total * wins.value) / (wins.value + losses.value)) : total;
    const gates = Math.ceil(total / 5);
    const cols = Math.min(gates > 8 ? 4 : 3, gates);
    const rows = Math.ceil(gates / cols);
    const gw = (r.w - 80) / cols;
    const gh = Math.min(200, (r.h - 230) / rows);
    const rng = seeded(total * 17 + won);
    for (let i = 0; i < total; i++) {
        const gate = Math.floor(i / 5);
        const k = clamp01((s.since - 0.25 - (i / total) * 1.3) / 0.12);
        if (k <= 0) continue;
        const gx = r.x + 40 + (gate % cols) * gw;
        const gy = r.y + 40 + Math.floor(gate / cols) * gh;
        const j = i % 5;
        ctx.strokeStyle = i < won ? "#7fd18b" : "#e8776c";
        ctx.lineWidth = 9;
        ctx.lineCap = "round";
        ctx.beginPath();
        if (j < 4) {
            const x = gx + 14 + (j * (gw - 40)) / 4 + (rng() - 0.5) * 6;
            ctx.moveTo(x, gy + 10);
            ctx.lineTo(x + (rng() - 0.5) * 8, gy + 10 + (gh - 34) * k);
        } else {
            ctx.moveTo(gx, gy + gh - 30);
            ctx.lineTo(gx + (gw - 10) * k, gy + 16 + (gh - 46) * (1 - k));
        }
        ctx.stroke();
    }
}

function grindArt(ctx: Ctx, s: ArtState) {
    const { rect: r, deck, card, style } = s;
    if (deck.video.months.filter((m) => m > 0).length < 3) return tallyArt(ctx, s);
    const months = deck.video.months;
    const max = Math.max(1, ...months);
    const n = months.length;
    const padX = 40;
    const base = r.y + r.h - 70;
    const top = r.y + 50;
    const gap = 16;
    const bw = Math.min(110, (r.w - 2 * padX - 230 - gap * (n - 1)) / n);
    for (let i = 0; i < n; i++) {
        const k = easeOutBack(stagger(s.since, i, n));
        const h = Math.max(6, ((base - top) * months[i] * k) / max);
        const x = r.x + padX + i * (bw + gap);
        const g = ctx.createLinearGradient(0, base - h, 0, base);
        g.addColorStop(0, style.ink);
        g.addColorStop(0.15, style.accent);
        g.addColorStop(1, style.panelDeep);
        ctx.fillStyle = months[i] > 0 ? g : "rgb(255 255 255 / 0.1)";
        ctx.beginPath();
        ctx.roundRect(x, base - h, bw, h, [8, 8, 0, 0]);
        ctx.fill();
    }
    const [, wins, losses] = card.stats;
    if (wins && losses) {
        const k = easeOutCubic((s.since - 0.8) / 0.6);
        const w = r.w - 2 * padX;
        const y = base + 22;
        ctx.fillStyle = "#3a1414";
        ctx.fillRect(r.x + padX, y, w, 18);
        ctx.fillStyle = "#7fd18b";
        ctx.fillRect(r.x + padX, y, (w * wins.value * k) / (wins.value + losses.value), 18);
        ctx.fillStyle = "#e8776c";
        const lw = (w * losses.value * k) / (wins.value + losses.value);
        ctx.fillRect(r.x + padX + w - lw, y, lw, 18);
    }
}

function climbArt(ctx: Ctx, s: ArtState) {
    const { rect: r, card, deck, assets, style } = s;
    const badges = card.badges ?? [];
    const series = deck.video.rankSeries;
    if (series.length > 1) {
        const lo = Math.min(...series.map((p) => p.badge));
        const hi = Math.max(...series.map((p) => p.badge));
        const k = clamp01((s.since - 0.2) / 1.4);
        ctx.save();
        ctx.beginPath();
        const drawn = Math.max(2, Math.ceil(series.length * k));
        for (let i = 0; i < drawn; i++) {
            const x = r.x + 30 + ((r.w - 60) * i) / (series.length - 1);
            const y = r.y + r.h - 40 - ((r.h - 80) * (series[i].badge - lo)) / Math.max(1, hi - lo);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = style.accent;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 6;
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.restore();
    }
    const cy = r.y + r.h * 0.48;
    if (badges.length === 1) {
        const k = easeOutBack((s.since - 0.15) / 0.5);
        ctx.save();
        ctx.strokeStyle = style.accent;
        ctx.lineWidth = 10;
        ctx.lineCap = "round";
        for (const side of [-1, 1]) {
            for (let i = 0; i < 6; i++) {
                const a = Math.PI / 2 + side * (0.5 + i * 0.32);
                const x = r.x + r.w / 2 + Math.cos(a) * r.h * 0.4;
                const y = cy + Math.sin(a) * r.h * 0.4;
                ctx.beginPath();
                ctx.ellipse(x, y, 30 * k, 12 * k, a + (side * Math.PI) / 2.6, 0, Math.PI * 2);
                ctx.fillStyle = style.accent;
                ctx.globalAlpha = stagger(s.since, i, 6);
                ctx.fill();
            }
        }
        ctx.restore();
        drawBadge(ctx, badges[0], r.x + r.w / 2, cy, r.h * 0.62 * k, assets);
        return;
    }
    const up = card.face !== "down";
    const [from, to] = badges;
    const ax = r.x + r.w * 0.24;
    const bx = r.x + r.w * 0.64;
    const ay = up ? cy + r.h * 0.16 : cy - r.h * 0.16;
    const by = up ? cy - r.h * 0.08 : cy + r.h * 0.12;
    const kA = easeOutBack((s.since - 0.15) / 0.45);
    const kArrow = easeOutCubic((s.since - 0.45) / 0.6);
    const kB = easeOutBack((s.since - 0.9) / 0.5);
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.45 * kArrow;
    ctx.strokeStyle = up ? "#7fd18b" : "#e8776c";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 16;
    ctx.lineCap = "round";
    const mx = (ax + bx) / 2;
    const my = Math.min(ay, by) - r.h * 0.22 * (up ? 1 : -0.6);
    const ex = ax + (bx - ax) * kArrow;
    const t = kArrow;
    const ey = (1 - t) ** 2 * ay + 2 * (1 - t) * t * my + t * t * by;
    const qx = ax + (mx - ax) * t;
    const qy = ay + (my - ay) * t;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(qx, qy, ex, ey);
    ctx.stroke();
    if (kArrow > 0.05) {
        const ang = Math.atan2(ey - qy, ex - qx);
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(26, 0);
        ctx.lineTo(-18, -24);
        ctx.lineTo(-18, 24);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
    ctx.restore();
    if (from !== undefined) drawBadge(ctx, from, ax, ay, r.h * 0.36 * kA, assets);
    if (to !== undefined) drawBadge(ctx, to, bx + r.w * 0.08, by, r.h * 0.56 * kB, assets);
}

function bounceArt(ctx: Ctx, s: ArtState) {
    const { rect: r, card, assets, style } = s;
    const [low, end] = card.badges ?? [];
    const k = easeOutCubic((s.since - 0.2) / 1.2);
    const pts = [
        [r.x + 40, r.y + r.h * 0.25],
        [r.x + r.w * 0.36, r.y + r.h * 0.8],
        [r.x + r.w - 60, r.y + r.h * 0.18],
    ];
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    const seg = k * 2;
    for (let i = 1; i <= 2; i++) {
        const p = clamp01(seg - (i - 1));
        if (p <= 0) break;
        ctx.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * p, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * p);
    }
    ctx.strokeStyle = style.accent;
    ctx.lineWidth = 14;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
    if (low !== undefined)
        drawBadge(ctx, low, pts[1][0], pts[1][1] - 20, r.h * 0.34 * easeOutBack((s.since - 0.6) / 0.4), assets);
    if (end !== undefined)
        drawBadge(ctx, end, pts[2][0] - 70, pts[2][1] + 60, r.h * 0.46 * easeOutBack((s.since - 1.2) / 0.4), assets);
}

/** A row of tiles that light in order: wins and losses as the tape reads. */
function tiles(ctx: Ctx, s: ArtState, marks: ("w" | "l")[], rows = 1) {
    const { rect: r } = s;
    const n = marks.length;
    const perRow = Math.ceil(n / rows);
    const size = Math.min(104, (r.w - 80) / perRow - 12, (r.h * 0.62) / rows - 14);
    const totalH = rows * (size + 14);
    for (let i = 0; i < n; i++) {
        const row = Math.floor(i / perRow);
        const col = i % perRow;
        const inRow = Math.min(perRow, n - row * perRow);
        const x = r.x + r.w / 2 - (inRow * (size + 10)) / 2 + col * (size + 10);
        const y = r.y + r.h * 0.45 - totalH / 2 + row * (size + 14);
        const k = easeOutBack(stagger(s.since, i, n, 1.6, 0.25));
        if (k <= 0) continue;
        ctx.save();
        ctx.translate(x + size / 2, y + size / 2);
        ctx.scale(k, k);
        ctx.beginPath();
        ctx.roundRect(-size / 2, -size / 2, size, size, 12);
        ctx.fillStyle = marks[i] === "w" ? "#2f8a4a" : "#8a2f2a";
        ctx.shadowColor = marks[i] === "w" ? "#7fd18b" : "#e8776c";
        ctx.shadowBlur = 18;
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.strokeStyle = "rgb(255 255 255 / 0.5)";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = size * 0.1;
        ctx.lineCap = "round";
        ctx.beginPath();
        if (marks[i] === "w") {
            ctx.moveTo(-size * 0.22, 0);
            ctx.lineTo(-size * 0.05, size * 0.18);
            ctx.lineTo(size * 0.24, -size * 0.18);
        } else {
            ctx.moveTo(-size * 0.18, -size * 0.18);
            ctx.lineTo(size * 0.18, size * 0.18);
            ctx.moveTo(size * 0.18, -size * 0.18);
            ctx.lineTo(-size * 0.18, size * 0.18);
        }
        ctx.stroke();
        ctx.restore();
    }
}

function streakArt(ctx: Ctx, s: ArtState) {
    const n = Math.min(24, s.card.stats[0]?.value ?? 1);
    tiles(
        ctx,
        s,
        Array.from({ length: n }, () => "w"),
        n > 5 ? 2 : 1,
    );
    const { rect: r } = s;
    const heat = clamp01((s.since - 1.2) / 0.6);
    if (heat > 0) {
        const g = ctx.createLinearGradient(0, r.y + r.h, 0, r.y + r.h * 0.4);
        g.addColorStop(0, `rgb(255 140 40 / ${0.55 * heat})`);
        g.addColorStop(1, "rgb(255 140 40 / 0)");
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = g;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.restore();
    }
}

function turnaroundArt(ctx: Ctx, s: ArtState) {
    const [losses, wins] = s.card.stats;
    const lost = Math.min(10, losses?.value ?? 0);
    const won = Math.min(10, wins?.value ?? 0);
    tiles(
        ctx,
        s,
        [...Array.from({ length: lost }, () => "l" as const), ...Array.from({ length: won }, () => "w" as const)],
        2,
    );
}

function ring(ctx: Ctx, s: ArtState, share: number, color: string, cx: number, cy: number, rad: number) {
    const k = easeOutCubic((s.since - 0.25) / 1.1);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = rad * 0.22;
    ctx.strokeStyle = "rgb(255 255 255 / 0.12)";
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * share * k);
    ctx.stroke();
    ctx.restore();
}

function nightArt(ctx: Ctx, s: ArtState) {
    const { rect: r } = s;
    const share = s.card.stats[0]?.value ?? 0;
    const sky = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    sky.addColorStop(0, "#050816");
    sky.addColorStop(1, "#1b2350");
    ctx.fillStyle = sky;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.globalAlpha = 1;
    const rng = seeded(4242);
    for (let i = 0; i < 60; i++) {
        const x = r.x + rng() * r.w;
        const y = r.y + rng() * r.h;
        const tw = 0.5 + 0.5 * Math.sin(s.since * 3 + i);
        ctx.fillStyle = `rgb(255 255 240 / ${0.3 + 0.6 * tw * clamp01(s.since * 2 - rng())})`;
        ctx.fillRect(x, y, 3, 3);
    }
    const cx = r.x + r.w * 0.36;
    const cy = r.y + r.h * 0.48;
    const rad = r.h * 0.3;
    ring(ctx, s, share, "#c9b6ff", cx, cy, rad);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, rad * 0.62, 0, Math.PI * 2);
    ctx.fillStyle = "#fff3c4";
    ctx.shadowColor = "#fff3c4";
    ctx.shadowBlur = 40;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(cx + rad * 0.3, cy - rad * 0.18, rad * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function clockArt(ctx: Ctx, s: ArtState) {
    const { rect: r, style } = s;
    const n = Math.min(16, s.card.stats[0]?.value ?? 1);
    const cx = r.x + r.w * 0.36;
    const cy = r.y + r.h * 0.48;
    const rad = r.h * 0.34;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, rad + 18, 0, Math.PI * 2);
    ctx.fillStyle = "rgb(0 0 0 / 0.35)";
    ctx.fill();
    for (let i = 0; i < n; i++) {
        const k = stagger(s.since, i, n, 1.5, 0.2);
        const a0 = -Math.PI / 2 + (i / n) * Math.PI * 2 + 0.04;
        const a1 = -Math.PI / 2 + ((i + 1) / n) * Math.PI * 2 - 0.04;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, a0, a0 + (a1 - a0) * k);
        ctx.strokeStyle = style.accent;
        ctx.lineWidth = rad * 0.24;
        ctx.stroke();
    }
    const sweep = -Math.PI / 2 + Math.PI * 2 * clamp01((s.since - 0.3) / 1.5);
    ctx.strokeStyle = style.ink;
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweep) * rad * 0.7, cy + Math.sin(sweep) * rad * 0.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fillStyle = style.ink;
    ctx.fill();
    ctx.restore();
}

function star(ctx: Ctx, x: number, y: number, r: number) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.42 : r;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
}

function mvpArt(ctx: Ctx, s: ArtState) {
    const { rect: r } = s;
    const n = Math.min(12, s.card.stats[0]?.value ?? 1);
    for (let i = 0; i < n; i++) {
        const a = Math.PI + (n === 1 ? 0.5 : i / (n - 1)) * Math.PI;
        const x = r.x + r.w * 0.4 + Math.cos(a) * r.w * 0.3;
        const y = r.y + r.h * 0.78 + Math.sin(a) * r.h * 0.5;
        const k = easeOutBack(stagger(s.since, i, n, 1.4, 0.3));
        if (k <= 0) continue;
        star(ctx, x, y, 44 * k);
        ctx.fillStyle = "#f1d688";
        ctx.shadowColor = "#ffe296";
        ctx.shadowBlur = 20;
        ctx.fill();
        ctx.shadowColor = "transparent";
    }
}

function explorerArt(ctx: Ctx, s: ArtState) {
    const { rect: r, style } = s;
    const n = Math.min(30, s.card.stats[0]?.value ?? 1);
    const cols = Math.ceil(Math.sqrt(n * 1.6));
    const rows = Math.ceil(n / cols);
    const size = Math.min((r.w - 260) / cols, (r.h - 60) / rows) * 0.92;
    const rng = seeded(n * 97);
    for (let i = 0; i < n; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = r.x + 40 + col * size * 1.05 + (row % 2) * size * 0.5;
        const y = r.y + 30 + row * size * 0.95;
        const k = easeOutBack(stagger(s.since, i, n, 1.5, 0.22));
        if (k <= 0) continue;
        ctx.save();
        ctx.translate(x + size / 2, y + size / 2);
        ctx.scale(k, k);
        ctx.beginPath();
        for (let j = 0; j < 6; j++) {
            const a = Math.PI / 6 + (j * Math.PI) / 3;
            ctx.lineTo(Math.cos(a) * size * 0.5, Math.sin(a) * size * 0.5);
        }
        ctx.closePath();
        ctx.fillStyle = `hsl(${Math.round(rng() * 360)} 55% ${45 + rng() * 15}%)`;
        ctx.fill();
        ctx.strokeStyle = style.ink;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
    }
}

function calendarArt(ctx: Ctx, s: ArtState) {
    const { rect: r, card, style } = s;
    const played = card.stats[0]?.value ?? 0;
    const windowDays = Number((card.line.params.window ?? "").replace(/\D/g, "")) || Math.max(played, 28);
    const n = Math.min(182, windowDays);
    const cols = Math.ceil(n / 7);
    const cell = Math.min((r.w - 260) / cols, (r.h - 70) / 7);
    const rng = seeded(played * 13 + n);
    const lit = new Set<number>();
    while (lit.size < Math.min(n, Math.round((played * n) / Math.max(1, windowDays)))) lit.add(Math.floor(rng() * n));
    for (let i = 0; i < n; i++) {
        const x = r.x + 36 + Math.floor(i / 7) * cell;
        const y = r.y + 35 + (i % 7) * cell;
        const k = clamp01((s.since - 0.3 - (i / n) * 1.2) / 0.15);
        ctx.fillStyle = lit.has(i) && k > 0 ? style.accent : "rgb(255 255 255 / 0.1)";
        ctx.fillRect(x, y, cell - 4, cell - 4);
    }
}

function weekArt(ctx: Ctx, s: ArtState) {
    const { rect: r, style } = s;
    const share = s.card.stats[0]?.value ?? 0.6;
    const weights = [1, 1, 1, 1, 1].map(() => (1 - share) / 5).concat([share / 2, share / 2]);
    const max = Math.max(...weights);
    const bw = (r.w - 300) / 7;
    for (let i = 0; i < 7; i++) {
        const k = easeOutBack(stagger(s.since, i, 7));
        const h = ((r.h - 120) * weights[i] * k) / max;
        const x = r.x + 40 + i * bw;
        ctx.fillStyle = i >= 5 ? style.accent : "rgb(255 255 255 / 0.25)";
        ctx.beginPath();
        ctx.roundRect(x + 6, r.y + r.h - 50 - h, bw - 12, h, [10, 10, 0, 0]);
        ctx.fill();
    }
}

function rateArt(ctx: Ctx, s: ArtState) {
    const { rect: r } = s;
    const rate = s.card.stats[0]?.value ?? 0.5;
    const color = s.card.face === "losing" ? "#e8776c" : "#7fd18b";
    ring(ctx, s, rate, color, r.x + r.w * 0.36, r.y + r.h * 0.5, r.h * 0.32);
    const wins = Math.min(40, s.card.stats[1]?.value ?? 0);
    const rng = seeded(wins * 7 + 1);
    for (let i = 0; i < wins; i++) {
        const a = rng() * Math.PI * 2;
        const d = r.h * (0.42 + rng() * 0.08);
        const k = stagger(s.since, i, wins, 1.4, 0.2);
        ctx.fillStyle = `rgb(255 255 255 / ${0.5 * k})`;
        ctx.beginPath();
        ctx.arc(r.x + r.w * 0.36 + Math.cos(a) * d, r.y + r.h * 0.5 + Math.sin(a) * d, 5, 0, Math.PI * 2);
        ctx.fill();
    }
}

/** The art window of a face: every face draws its own picture of its fact. */
export function drawArt(ctx: Ctx, s: ArtState): void {
    backdrop(ctx, s);
    const { card } = s;
    switch (card.face) {
        case "grind":
            return grindArt(ctx, s);
        case "main":
            return card.hero ? heroArt(ctx, s, false) : undefined;
        case "debut":
            return card.hero ? heroArt(ctx, s, true) : undefined;
        case "up":
        case "down":
        case "held":
            return climbArt(ctx, s);
        case "bounce_back":
            return bounceArt(ctx, s);
        case "streak":
            return streakArt(ctx, s);
        case "losing_then_winning":
            return turnaroundArt(ctx, s);
        case "marathon":
            return clockArt(ctx, s);
        case "mvp":
            return mvpArt(ctx, s);
        case "explorer":
            return explorerArt(ctx, s);
        case "night_owl":
            return nightArt(ctx, s);
        case "grinder":
            return calendarArt(ctx, s);
        case "weekender":
            return weekArt(ctx, s);
        case "winning":
        case "losing":
            return rateArt(ctx, s);
    }
}
