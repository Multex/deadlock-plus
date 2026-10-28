export type ScrapKind = "foil" | "black" | "tape" | "newsprint";

export interface Scrap {
    kind: ScrapKind;
    w: number;
    h: number;
    /** Launch speed in stage heights per second, so the burst fills any window the same way. */
    vx: number;
    vy: number;
    /** Degrees per second in the page plane, and around the scrap's own axis (the flutter). */
    spin: number;
    tumble: number;
    phase: number;
    sway: number;
    edge: number;
    /** Drawn over the copy; the rest fly behind it. */
    front: boolean;
}

/** The burst point: the stage's middle, a little above centre. */
export const BURST_Y = 0.42;
const DRAG = 2.1;
const GRAVITY = 2.4;
const MIN_SIZE = 0.6;

/** Outlines of torn newsprint, as fractions of the scrap's box. */
export const TORN_EDGES: [number, number][][] = [
    [
        [0, 0.08],
        [0.22, 0],
        [0.48, 0.06],
        [0.71, 0],
        [1, 0.09],
        [0.96, 0.41],
        [1, 0.7],
        [0.93, 1],
        [0.61, 0.94],
        [0.34, 1],
        [0.08, 0.93],
        [0.03, 0.55],
    ],
    [
        [0.04, 0],
        [0.38, 0.07],
        [0.66, 0],
        [1, 0.04],
        [0.94, 0.33],
        [1, 0.64],
        [0.97, 1],
        [0.7, 0.92],
        [0.41, 1],
        [0, 0.96],
        [0.06, 0.62],
        [0, 0.27],
    ],
    [
        [0, 0],
        [0.3, 0.05],
        [0.58, 0],
        [0.88, 0.06],
        [1, 0.35],
        [0.92, 0.66],
        [1, 1],
        [0.66, 0.95],
        [0.3, 1],
        [0.05, 0.92],
        [0, 0.6],
        [0.07, 0.3],
    ],
];

function rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let x = s;
        x = Math.imul(x ^ (x >>> 15), x | 1);
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}

const KINDS: ScrapKind[] = ["foil", "foil", "foil", "black", "tape", "newsprint", "newsprint"];

export function makeScraps(count: number, seed: number): Scrap[] {
    const r = rng(seed);
    return Array.from({ length: count }, (_, i) => {
        const kind = KINDS[Math.floor(r() * KINDS.length)];
        const angle = -Math.PI / 2 + (r() - 0.5) * 2.7;
        const speed = 0.9 + r() * 1.2;
        const size: Record<ScrapKind, [number, number]> = {
            foil: [10 + r() * 8, 16 + r() * 10],
            black: [9 + r() * 7, 14 + r() * 8],
            tape: [5 + r() * 2, 44 + r() * 30],
            newsprint: [22 + r() * 18, 18 + r() * 14],
        };
        const [w, h] = size[kind];
        return {
            kind,
            w,
            h,
            vx: Math.cos(angle) * speed * (0.75 + r() * 0.5),
            vy: Math.sin(angle) * speed,
            spin: (r() - 0.5) * 900,
            tumble: 260 + r() * 720,
            phase: r() * Math.PI * 2,
            sway: 0.01 + r() * 0.03,
            edge: i % TORN_EDGES.length,
            front: r() > 0.38,
        };
    });
}

/** Where a scrap is `t` seconds after the burst, in stage heights from the burst point (y down), plus its turn. */
export function scrapAt(s: Scrap, t: number) {
    const k = 1 - Math.exp(-DRAG * t);
    return {
        x: (s.vx / DRAG) * k + Math.sin(t * 5 + s.phase) * s.sway * Math.min(1, t * 2),
        y: (GRAVITY / DRAG) * t + ((s.vy - GRAVITY / DRAG) / DRAG) * k,
        rz: s.spin * t,
        rx: s.tumble * t + s.phase * 57,
    };
}

/** A scrap in stage pixels; `flip` squashes it as it flutters edge-on, `shine` is how square it faces the light. */
export function scrapPose(s: Scrap, t: number, stage: { width: number; height: number }, scale: number) {
    const p = scrapAt(s, t);
    const size = Math.max(MIN_SIZE, scale);
    const flip = Math.cos((p.rx * Math.PI) / 180);
    return {
        x: stage.width / 2 + p.x * stage.height,
        y: stage.height * BURST_Y + p.y * stage.height,
        w: s.w * size,
        h: s.h * size,
        angle: (p.rz * Math.PI) / 180,
        flip,
        shine: Math.abs(flip),
    };
}

export interface DrawOptions {
    /** Seconds since the burst. */
    t: number;
    stage: { width: number; height: number };
    /** The copy's own scale, so the scraps keep its proportions. */
    scale: number;
    alpha: number;
    front: boolean;
}

type Rgb = [number, number, number];
const mix = (a: Rgb, b: Rgb, k: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(" ")})`;
const GOLD_DARK: Rgb = [138, 98, 30];
const GOLD_LIGHT: Rgb = [250, 226, 150];
const INK: Rgb = [24, 21, 17];
const INK_LIT: Rgb = [70, 64, 56];
const PAPER: Rgb = [196, 188, 170];
const PAPER_LIT: Rgb = [242, 236, 222];

export function drawScraps(ctx: CanvasRenderingContext2D, scraps: Scrap[], o: DrawOptions): void {
    if (o.alpha <= 0) return;
    ctx.globalAlpha = o.alpha;
    for (const s of scraps) {
        if (s.front !== o.front) continue;
        const p = scrapPose(s, o.t, o.stage, o.scale);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.scale(1, Math.max(0.06, p.shine));
        const x = -p.w / 2;
        const y = -p.h / 2;
        if (s.kind === "foil") {
            const g = ctx.createLinearGradient(x, y, x + p.w, y + p.h);
            g.addColorStop(0, mix(GOLD_DARK, GOLD_LIGHT, 0.35 + p.shine * 0.65));
            g.addColorStop(1, mix(GOLD_DARK, GOLD_LIGHT, p.shine * 0.55));
            ctx.fillStyle = g;
            ctx.fillRect(x, y, p.w, p.h);
        } else if (s.kind === "black") {
            ctx.fillStyle = mix(INK, INK_LIT, p.shine);
            ctx.fillRect(x, y, p.w, p.h);
        } else if (s.kind === "tape") {
            ctx.fillStyle = mix(GOLD_DARK, GOLD_LIGHT, 0.3 + p.shine * 0.7);
            ctx.fillRect(x, y, p.w, p.h);
        } else {
            ctx.beginPath();
            for (const [i, [fx, fy]] of TORN_EDGES[s.edge].entries()) {
                if (i === 0) ctx.moveTo(x + fx * p.w, y + fy * p.h);
                else ctx.lineTo(x + fx * p.w, y + fy * p.h);
            }
            ctx.closePath();
            ctx.fillStyle = mix(PAPER, PAPER_LIT, p.shine);
            ctx.fill();
            ctx.clip();
            ctx.fillStyle = "rgb(40 36 30 / 0.35)";
            for (let ly = y + 4; ly < y + p.h; ly += 5) ctx.fillRect(x, ly, p.w, 1);
        }
        ctx.restore();
    }
    ctx.globalAlpha = 1;
}
