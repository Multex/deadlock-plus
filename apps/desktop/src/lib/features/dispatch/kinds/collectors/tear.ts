/** The whole tear, from the first pull on the tab to the cover resting at its own size. */
export const TEAR_MS = 2300;

/** CSS `cubic-bezier()`: solves x for t by Newton's method with a bisection fallback, then returns y. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (p: number) => number {
    const at = (a: number, b: number, t: number) => 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t ** 2 + t ** 3;
    const slope = (a: number, b: number, t: number) =>
        3 * a * (1 - t) ** 2 + 6 * (b - a) * (1 - t) * t + 3 * (1 - b) * t ** 2;
    return (p) => {
        if (p <= 0) return 0;
        if (p >= 1) return 1;
        let t = p;
        for (let i = 0; i < 8; i++) {
            const d = slope(x1, x2, t);
            if (Math.abs(d) < 1e-6) break;
            const next = t - (at(x1, x2, t) - p) / d;
            if (next < 0 || next > 1) break;
            t = next;
        }
        if (Math.abs(at(x1, x2, t) - p) > 1e-5) {
            let lo = 0;
            let hi = 1;
            for (let i = 0; i < 40; i++) {
                t = (lo + hi) / 2;
                if (at(x1, x2, t) < p) lo = t;
                else hi = t;
            }
        }
        return at(y1, y2, t);
    };
}

type Ease = (p: number) => number;
type Values = Record<string, number>;

const linear: Ease = (p) => p;
const easeOut = cubicBezier(0, 0, 0.58, 1);
const easeInOut = cubicBezier(0.42, 0, 0.58, 1);

/**
 * CSS keyframes semantics: `ease` runs separately on each segment between stops, and the animation holds its
 * first stop before `delay` and its last after it ends.
 */
function track(delay: number, duration: number, ease: Ease, stops: [number, Values][]): (t: number) => Values {
    return (t) => {
        const p = Math.min(1, Math.max(0, (t - delay) / duration));
        let i = 0;
        while (i < stops.length - 2 && p > stops[i + 1][0]) i++;
        const [o0, a] = stops[i];
        const [o1, b] = stops[i + 1];
        const e = ease(o1 === o0 ? 1 : (p - o0) / (o1 - o0));
        const out: Values = {};
        for (const k of Object.keys(a)) out[k] = a[k] + (b[k] - a[k]) * e;
        return out;
    };
}

const rest = { x: 0, y: 0, rotate: 0, opacity: 1 };

const strip = track(0, 1100, cubicBezier(0.5, 0, 0.75, 0), [
    [0, rest],
    [0.15, { x: 0, y: -3, rotate: -1, opacity: 1 }],
    [0.6, { x: 12, y: -16, rotate: -6, opacity: 1 }],
    [1, { x: 420, y: -560, rotate: 40, opacity: 0 }],
]);
const rip = track(120, 900, linear, [
    [0, { scaleX: 0, opacity: 1 }],
    [0.64, { scaleX: 1, opacity: 1 }],
    [1, { scaleX: 1, opacity: 0 }],
]);
const body = track(820, 750, cubicBezier(0.45, 0, 0.75, 0.3), [
    [0, rest],
    [1, { x: 30, y: 1150, rotate: 5, opacity: 0.7 }],
]);
const slot = track(850, 600, cubicBezier(0.2, 0.9, 0.3, 1.25), [
    [0, { y: 0, scale: 1 }],
    [0.6, { y: -38, scale: 1.012 }],
    [1, { y: -30, scale: 1 }],
]);
const FLASH_AT = 1350;
const FLASH_MS = 650;
const flash = track(FLASH_AT, FLASH_MS, easeInOut, [
    [0, { x: -120 }],
    [1, { x: 320 }],
]);
const plate = track(1750, 420, cubicBezier(0.3, 1.5, 0.5, 1), [
    [0, { rotate: -9, scale: 2.2, opacity: 0 }],
    [1, { rotate: -2, scale: 1, opacity: 1 }],
]);
const settle = track(1900, 400, easeInOut, [
    [0, { v: 0 }],
    [1, { v: 1 }],
]);

export interface Pose {
    x: number;
    y: number;
    rotate: number;
    scale: number;
    opacity: number;
}

export interface TearFrame {
    /** The strip above the perforation, pivoting on its right end. */
    strip: Pose;
    rip: { scaleX: number; opacity: number };
    body: Pose;
    slot: { y: number; scale: number };
    /** The foil flash's offset, in % of its own width; `null` while it is not crossing the cover. */
    flash: number | null;
    plate: Pose;
    /** 0 at the bag's scale, 1 at the cover's. */
    settle: number;
    done: boolean;
}

const pose = (v: Values): Pose => ({
    x: v.x ?? 0,
    y: v.y ?? 0,
    rotate: v.rotate ?? 0,
    scale: v.scale ?? 1,
    opacity: Math.min(1, Math.max(0, v.opacity ?? 1)),
});

export function tearFrame(t: number): TearFrame {
    const r = rip(t);
    const s = slot(t);
    return {
        strip: pose(strip(t)),
        rip: { scaleX: r.scaleX, opacity: r.opacity },
        body: pose(body(t)),
        slot: { y: s.y, scale: s.scale },
        flash: t < FLASH_AT || t > FLASH_AT + FLASH_MS ? null : flash(t).x,
        plate: pose(plate(t)),
        settle: settle(t).v,
        done: t >= TEAR_MS,
    };
}

export interface Fleck {
    /** Where it leaves the tear line, in the bag's 780×1180 frame. */
    x: number;
    y: number;
    dx: number;
    dy: number;
    rotate: number;
    w: number;
    h: number;
    delay: number;
}

const BAG_W = 780;
const TEAR_Y = 70;
const FLECK_MS = 700;

/** Plastic chips thrown off the tear line as the rip passes; fixed, so every tear looks the same. */
export const FLECKS: Fleck[] = Array.from({ length: 28 }, (_, i) => {
    const x = 18 + i * 27 + ((i * 37) % 19);
    return {
        x,
        y: TEAR_Y,
        dx: ((i * 53) % 40) - 20,
        dy: -30 - ((i * 29) % 50),
        rotate: ((i * 71) % 90) - 45,
        w: 5 + (i % 4),
        h: 3 + (i % 2),
        delay: 120 + (x / BAG_W) * 560,
    };
});

export interface FleckFrame {
    x: number;
    y: number;
    rotate: number;
    opacity: number;
    w: number;
    h: number;
}

export function flecksAt(t: number, flecks: readonly Fleck[] = FLECKS): FleckFrame[] {
    return flecks.map((f) => {
        const p = (t - f.delay) / FLECK_MS;
        if (p < 0 || p >= 1) return { x: f.x, y: f.y, rotate: 0, opacity: 0, w: f.w, h: f.h };
        const e = easeOut(p);
        return { x: f.x + f.dx * e, y: f.y + f.dy * e, rotate: f.rotate * e, opacity: 1 - e, w: f.w, h: f.h };
    });
}
