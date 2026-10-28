import { pickLanding, tossMotion, type Landing, type TossMotion } from "$lib/features/front-page/toss";

/** The stamp's resting tilt, degrees. */
export const STAMP_ANGLE = -11;
/** Ms between the paper settling and the stamp coming down. */
export const STAMP_GAP = 160;
const STAMP_MS = 460;
/** Share of the stamp's run at which it meets the paper. */
const STAMP_HIT = 0.5;

export interface StampMotion {
    /** Ms from the start of the arrival. */
    delay: number;
    duration: number;
    /** Ms from the start of the arrival. */
    impactAt: number;
    keyframes: Keyframe[];
}

export interface WeeklyArrival {
    landing: Landing;
    toss: TossMotion;
    shadow: Keyframe[];
    stamp: StampMotion | null;
    /** Ms from the start at which the table shakes. */
    jolts: number[];
    total: number;
}

export type ArrivalPhase = "toss" | "stamp" | "rest";

/** FNV-1a, so one edition always lands the same way and a replay can be shot at fixed times. */
function hash(text: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    return h >>> 0;
}

/** mulberry32 */
function seeded(seed: number): () => number {
    let a = seed;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * The after-match paper's tosses, landing flat on the spot the page fitted the sheet to: the sheet carries its own
 * small tilt, and a random rest angle or offset would push it past the stage.
 */
export function weeklyLanding(id: string): Landing {
    const landing = pickLanding(seeded(hash(id)), null, false);
    return { ...landing, angle: 0, dx: 0, dy: 0 };
}

const at = (scale: number, extra: number, blur: number) => ({
    transform: `rotate(${STAMP_ANGLE + extra}deg) scale(${scale})`,
    filter: `blur(${blur}px)`,
});

function stampMotion(delay: number): StampMotion {
    return {
        delay,
        duration: STAMP_MS,
        impactAt: delay + Math.round(STAMP_MS * STAMP_HIT),
        keyframes: [
            { offset: 0, opacity: 0, ...at(2.6, 9, 6), easing: "cubic-bezier(0.55, 0, 0.9, 0.45)" },
            { offset: 0.2, opacity: 0.9 },
            { offset: STAMP_HIT, opacity: 1, ...at(0.93, 0, 0), easing: "cubic-bezier(0.15, 0.75, 0.25, 1)" },
            { offset: 0.72, ...at(1.04, -0.6, 0), easing: "ease-in-out" },
            { offset: 1, opacity: 1, ...at(1, 0, 0) },
        ],
    };
}

/** The whole arrival on one clock; `null` under reduced motion, where the paper shows at rest at once. */
export function weeklyArrival(
    id: string,
    opts: { hot: boolean; sheetHeight: number; reduced: boolean },
): WeeklyArrival | null {
    if (opts.reduced) return null;
    const landing = weeklyLanding(id);
    const toss = tossMotion(landing, opts.sheetHeight);
    const stamp = opts.hot ? stampMotion(toss.duration + STAMP_GAP) : null;
    // The sheet keeps its own drop shadow; the contact shadow only sells the height while it falls.
    const shadow = [...toss.shadow.slice(0, -1), { ...toss.shadow.at(-1), opacity: 0 }];
    const jolts = [toss.impactAt, stamp?.impactAt].filter((t): t is number => t !== undefined);
    return { landing, toss, shadow, stamp, jolts, total: stamp ? stamp.delay + stamp.duration : toss.duration };
}

export function arrivalPhase(a: WeeklyArrival, t: number): ArrivalPhase {
    if (t >= a.total) return "rest";
    return t < a.toss.duration ? "toss" : "stamp";
}
