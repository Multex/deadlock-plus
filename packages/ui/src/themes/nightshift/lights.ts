/** Festoon bulbs strung across the top of the street, like the wires in the show's backdrop. */

import { burst } from "../../theme-decor-loop";
import { between } from "../../theme-decor-random";

export interface Point {
    x: number;
    y: number;
}

export interface Bulb {
    /** Position along the wire, 0 to 1. */
    t: number;
    size: number;
    /** Dim spells within each period, as [offset, length] ms; empty for a steady bulb. */
    stutters: [number, number][];
    period: number;
}

export interface Strand {
    from: Point;
    to: Point;
    sag: number;
    swayPeriod: number;
    swayPhase: number;
    bulbs: Bulb[];
}

/** How far below the wire a bulb's glow is centred, in bulb sizes. */
export const BULB_DROP = 1.4;
/** The glow's radius, in bulb sizes. */
export const HALO = 6;

export const haloRadius = (bulb: Bulb) => bulb.size * HALO;
/** How far below its point on the wire a bulb paints, glow included. */
export const bulbReach = (bulb: Bulb) => bulb.size * (BULB_DROP + HALO);

const BULB_GAP = 44;
/** Sideways swing at mid-span, px. */
const SWAY = 4;
const FLICKER_SHARE = 0.08;
const DIM = 0.25;

/** The page header's box on the lights canvas, px. */
export interface Header {
    left: number;
    right: number;
    top: number;
}

const SIZE_MAX = 4.4;
/** Keeps a bulb's glow, swinging at the end of the wire, off the page column's edge. */
const GUTTER_MARGIN = SIZE_MAX * HALO + SWAY;
/** The swing stretches the sag by up to this share. */
const SAG_SWING = 0.03;

function bulbsAlong(span: number, random: () => number): Bulb[] {
    const count = Math.max(4, Math.round(span / BULB_GAP));
    return Array.from({ length: count - 1 }, (_, i) => {
        const period = between(random, 9_000, 17_000);
        const flickers = random() < FLICKER_SHARE;
        const start = between(random, 0, period - 1_200);
        return {
            t: (i + 1) / count,
            size: between(random, 3.2, SIZE_MAX),
            period,
            stutters: flickers
                ? ([
                      [start, between(random, 120, 220)],
                      [start + 360, between(random, 100, 160)],
                      [start + 640, between(random, 220, 420)],
                  ] as [number, number][])
                : [],
        };
    });
}

function strand(from: Point, to: Point, sag: number, random: () => number): Strand {
    return {
        from,
        to,
        sag,
        swayPeriod: between(random, 7_000, 10_000),
        swayPhase: random() * Math.PI * 2,
        bulbs: bulbsAlong(to.x - from.x, random),
    };
}

/**
 * The deepest the wire may hang before a bulb's glow, at the bottom of its swing, reaches `floor`.
 * Infinite when nothing needs keeping clear.
 */
function sagAbove(s: Strand, floor: number): number {
    let sag = Infinity;
    for (const b of s.bulbs) {
        const chord = s.from.y + (s.to.y - s.from.y) * b.t;
        const belly = 4 * b.t * (1 - b.t);
        sag = Math.min(sag, (floor - bulbReach(b) - chord) / ((1 + SAG_SWING) * belly));
    }
    return Math.max(0, sag);
}

/**
 * Deep strands droop in the gutters beside the page header; over the header itself one shallow strand runs
 * high enough that no bulb or glow reaches the title. With no header in reach, the gutters meet in the middle.
 */
export function stringLights(width: number, random: () => number, header: Header | null): Strand[] {
    const { left, right, top } = header ?? { left: width / 2, right: width / 2, top: Infinity };
    const anchor = () => between(random, -6, 10);
    const strands: Strand[] = [];

    const leftEnd = left - GUTTER_MARGIN;
    const leftStart = -0.25 * leftEnd - 40;
    const leftDroop = strand(
        { x: leftStart, y: anchor() },
        { x: leftEnd, y: anchor() },
        between(random, 54, 84),
        random,
    );
    if (leftEnd - leftStart >= 3 * BULB_GAP) strands.push(leftDroop);

    const rightStart = right + GUTTER_MARGIN;
    const rightEnd = width + 0.25 * (width - rightStart) + 40;
    const rightDroop = strand(
        { x: rightStart, y: anchor() },
        { x: rightEnd, y: anchor() },
        between(random, 48, 76),
        random,
    );
    if (rightEnd - rightStart >= 3 * BULB_GAP) strands.push(rightDroop);

    // Its anchors sit high enough that even its largest bulbs, hanging straight down from them, clear the title.
    const ceiling = top - SIZE_MAX * (BULB_DROP + HALO) - 10;
    const high = strand(
        { x: Math.min(0.18 * width, left - BULB_GAP), y: Math.min(anchor(), ceiling) },
        { x: Math.max(0.82 * width, right + BULB_GAP), y: Math.min(anchor(), ceiling) },
        0,
        random,
    );
    // Half a pixel spare against rounding at the bottom of the swing.
    high.sag = Math.min(between(random, 28, 44), sagAbove(high, top - 0.5));
    strands.push(high);
    return strands;
}

/** A point on the wire at `t` along it: a hanging curve that swings gently, still at both anchors. */
export function wireAt(strand: Strand, t: number, now: number): Point {
    if (t <= 0) return strand.from;
    if (t >= 1) return strand.to;
    const swing = Math.sin((now / strand.swayPeriod) * Math.PI * 2 + strand.swayPhase);
    const belly = 4 * t * (1 - t);
    return {
        x: strand.from.x + (strand.to.x - strand.from.x) * t + SWAY * swing * belly,
        y: strand.from.y + (strand.to.y - strand.from.y) * t + strand.sag * (1 + SAG_SWING * swing) * belly,
    };
}

/** 1 for a bulb burning steadily, lower while it stutters. */
export function glow(bulb: Bulb, now: number): number {
    for (const [offset, length] of bulb.stutters) if (burst(now, bulb.period, length, offset).active) return DIM;
    return 1;
}
