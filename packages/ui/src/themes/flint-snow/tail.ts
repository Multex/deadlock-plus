/** Flint's tail, painted from short fur strokes so it reads as fur rather than flat shapes. */

export const TAIL_WIDTH = 340;
export const TAIL_HEIGHT = 240;

// The base sits off the right edge; the tail sweeps left and the tip curls up.
const CURVE: [number, number][] = [
    [345, 168],
    [215, 182],
    [70, 172],
    [36, 62],
];
const MAX_HALF_WIDTH = 58;

// Measured from the character sheet's palette swatches.
const COLOURS = {
    coral: [0xc3, 0x3e, 0x3f],
    dark: [0x9b, 0x1d, 0x1d],
    cream: [0xd2, 0xcd, 0xc6],
} as const;

function bezier(t: number, axis: 0 | 1): number {
    const [a, b, c, d] = CURVE.map((p) => p[axis]) as [number, number, number, number];
    const u = 1 - t;
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

export function tailFrame(t: number): { point: [number, number]; along: [number, number]; normal: [number, number] } {
    const e = 0.002;
    const [t0, t1] = [Math.max(0, t - e), Math.min(1, t + e)];
    const dx = bezier(t1, 0) - bezier(t0, 0);
    const dy = bezier(t1, 1) - bezier(t0, 1);
    const length = Math.hypot(dx, dy) || 1;
    // `normal` points to the tail's upper side.
    return {
        point: [bezier(t, 0), bezier(t, 1)],
        along: [dx / length, dy / length],
        normal: [-dy / length, dx / length],
    };
}

/** Fullest a little past the middle, a soft point at the tip. */
export function halfWidth(t: number): number {
    return MAX_HALF_WIDTH * Math.sin(Math.PI * (0.14 + 0.86 * t)) ** 0.9 * (1 - t ** 6);
}

/** A triangle wave in [-1, 1]: the licks of a flame edge across the tail's width. */
const flame = (x: number) => Math.abs((((x % 1) + 1) % 1) - 0.5) * 4 - 1;

/** Which of the sheet's colours a spot on the tail is: `t` along it (0 base, 1 tip), `f` across it (-1..1). */
export function band(t: number, f: number): keyof typeof COLOURS {
    const darkFrom = 0.42 + 0.025 * flame(f * 1.5 + 0.25);
    const creamFrom = 0.61 + 0.05 * flame(f * 2 + 0.25);
    if (t >= creamFrom) return "cream";
    if (t >= darkFrom) return "dark";
    return "coral";
}

export interface FurStroke {
    t: number;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    /** A slight curve: the control point's offset from the stroke's middle. */
    bend: number;
    width: number;
    colour: string;
    alpha: number;
}

const STROKES = 3200;
/** Wide, darker strokes laid first, so no background shows between the fur. */
const UNDERFUR = 900;
/** Long strokes drawing the tip out to a point. */
const TIP = 60;

function shade([r, g, b]: readonly [number, number, number], light: number): string {
    const mix = (c: number) => Math.round(light < 1 ? c * light : c + (255 - c) * (light - 1));
    return `rgb(${mix(r)} ${mix(g)} ${mix(b)})`;
}

/** The strokes in paint order: underfur, then fur base to tip so fur toward the tip lies over it. */
export function furStrokes(random: () => number): FurStroke[] {
    const underfur: FurStroke[] = [];
    while (underfur.length < UNDERFUR) {
        const t = random() * 0.97;
        const f = random() * 1.5 - 0.75;
        const { point, along } = tailFrame(t);
        const w = halfWidth(t);
        const x0 = point[0] + tailFrame(t).normal[0] * w * f;
        const y0 = point[1] + tailFrame(t).normal[1] * w * f;
        const length = 10 + random() * 10;
        underfur.push({
            t,
            x0,
            y0,
            x1: x0 + along[0] * length,
            y1: y0 + along[1] * length,
            bend: 0,
            width: Math.max(3, w * 0.35),
            colour: shade(COLOURS[band(t, f)], 0.7 + 0.15 * ((f + 1) / 2)),
            alpha: 1,
        });
    }

    const strokes: FurStroke[] = [];
    while (strokes.length < STROKES) {
        const t = random();
        // Even density: thin parts of the tail get proportionally fewer strokes.
        if (random() > halfWidth(t) / MAX_HALF_WIDTH) continue;
        const f = random() * 2.1 - 1.05;
        const edge = Math.abs(f) > 0.8;
        const { point, along, normal } = tailFrame(t);
        const w = halfWidth(t);
        const x0 = point[0] + normal[0] * w * f;
        const y0 = point[1] + normal[1] * w * f;
        // Fur lies toward the tip and splays outward near the edges.
        const splay = f * 0.55 + (random() - 0.5) * 0.3;
        const dx = along[0] * Math.cos(splay) + normal[0] * Math.sin(splay);
        const dy = along[1] * Math.cos(splay) + normal[1] * Math.sin(splay);
        const length = (7 + random() * 11) * (0.55 + (0.6 * w) / MAX_HALF_WIDTH);
        // Lit from above: the upper side lighter, the underside in shadow.
        const light = 0.72 + 0.3 * ((f + 1) / 2) + (random() - 0.5) * 0.14 + (band(t, f) === "cream" ? 0.05 : 0);
        strokes.push({
            t,
            x0,
            y0,
            x1: x0 + dx * length,
            y1: y0 + dy * length,
            bend: (random() - 0.5) * length * 0.35,
            width: edge ? 1 + random() * 0.8 : 1.8 + random() * 1.6,
            colour: shade(COLOURS[band(t, f)], light),
            alpha: edge ? 0.55 + random() * 0.3 : 0.75 + random() * 0.25,
        });
    }
    for (let i = 0; i < TIP; i++) {
        const t = 0.86 + random() * 0.1;
        const f = random() * 1.2 - 0.6;
        const { point, along, normal } = tailFrame(t);
        const w = halfWidth(t);
        const x0 = point[0] + normal[0] * w * f;
        const y0 = point[1] + normal[1] * w * f;
        // Converge on the tip itself.
        const [tx, ty] = tailFrame(1).point;
        const reach = 0.85 + random() * 0.2;
        strokes.push({
            t,
            x0,
            y0,
            x1: x0 + (tx - x0) * reach,
            y1: y0 + (ty - y0) * reach,
            bend: (random() - 0.5) * 6,
            width: 1.2 + random() * 1.2,
            colour: shade(COLOURS.cream, 0.95 + random() * 0.15),
            alpha: 0.85,
        });
    }
    return [...underfur.sort((a, b) => a.t - b.t), ...strokes.sort((a, b) => a.t - b.t)];
}
