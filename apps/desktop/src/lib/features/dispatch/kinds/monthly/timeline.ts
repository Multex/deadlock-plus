/** The arrival's length in ms: drop, riffle, light sweep, sticker. */
export const ARRIVE_END = 2300;
/** One page turn, ms. */
export const TURN_MS = 1050;
/** The closed magazine's tilt on the table, degrees. */
export const REST_ANGLE = -1.2;

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const easeOutBack = (x: number) => {
    const c1 = 1.5;
    const c3 = c1 + 1;
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
};
export const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

/** A thumb lifting the pages then letting them snap shut: fast up, slower fall with a small settle. */
function riffle(u: number): number {
    if (u <= 0 || u >= 1) return 0;
    if (u < 0.35) return Math.sin(((u / 0.35) * Math.PI) / 2);
    const v = (u - 0.35) / 0.65;
    return Math.cos((v * Math.PI) / 2) ** 2 - 0.06 * Math.sin(v * Math.PI * 2) * (1 - v);
}

export interface ArrivalFrame {
    /** Px below the resting spot. */
    y: number;
    rot: number;
    opacity: number;
    /** Leaf angles in degrees while the thumb riffles: the cover, then the page under it. */
    lift1: number;
    lift2: number;
    /** 0..1 position of the light sweep across the laminate; -1 when off. */
    glare: number;
    /** 0..1 pop-in of the best-game sticker. */
    sticker: number;
}

const REST: ArrivalFrame = { y: 0, rot: REST_ANGLE, opacity: 1, lift1: 0, lift2: 0, glare: -1, sticker: 1 };

// `+ 0` turns a -0 into 0, so the settled frame is exactly the rest frame.
const lift = (deg: number, u: number) => -deg * riffle(u) + 0;

/** Where the magazine is `t` ms into its arrival on the table. */
export function arrival(t: number): ArrivalFrame {
    if (t >= ARRIVE_END) return { ...REST };
    const e = easeOutBack(clamp(t / 650));
    const r = (t - 640) / 820;
    return {
        y: (1 - e) * 560,
        rot: -9 + (9 + REST_ANGLE) * e,
        opacity: clamp(t / 120),
        lift1: lift(46, r),
        lift2: lift(30, r - 0.08),
        glare: t >= 1450 && t <= 2080 ? (t - 1450) / 600 : -1,
        sticker: clamp((t - 1900) / 350),
    };
}

/** The sticker's scale as it pops: up past full size, then back. */
export function stickerScale(s: number): number {
    if (s <= 0) return 0;
    if (s >= 1) return 1;
    if (s < 0.7) return (s / 0.7) * 1.14;
    return 1.14 - ((s - 0.7) / 0.3) * 0.14;
}

/** Leaf angles from the arrival riffle and the two page turns (0 closed, 1 turned over to the left). */
export function turnAngles(frame: ArrivalFrame, p1: number, p2: number): { a1: number; a2: number } {
    return { a1: Math.min(frame.lift1, -180 * p1) + 0, a2: Math.min(frame.lift2, -180 * p2) + 0 };
}
