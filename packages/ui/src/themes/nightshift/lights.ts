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

const BULB_GAP = 44;
/** Sideways swing at mid-span, px. */
const SWAY = 4;
const FLICKER_SHARE = 0.08;
const DIM = 0.25;

export function stringLights(width: number, random: () => number): Strand[] {
    // Two crossing spans cover the width; a third, higher one fills the middle behind them.
    const spans: [number, number, number, number][] = [
        [-0.04, 0.58, 54, 84],
        [0.36, 1.04, 48, 76],
        [0.18, 0.82, 28, 44],
    ];
    return spans.map(([a, b, sagMin, sagMax]) => {
        const from = { x: a * width, y: between(random, -6, 10) };
        const to = { x: b * width, y: between(random, -6, 10) };
        const count = Math.max(4, Math.round((to.x - from.x) / BULB_GAP));
        const bulbs = Array.from({ length: count - 1 }, (_, i) => {
            const period = between(random, 9_000, 17_000);
            const flickers = random() < FLICKER_SHARE;
            const start = between(random, 0, period - 1_200);
            return {
                t: (i + 1) / count,
                size: between(random, 3.2, 4.4),
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
        return {
            from,
            to,
            sag: between(random, sagMin, sagMax),
            swayPeriod: between(random, 7_000, 10_000),
            swayPhase: random() * Math.PI * 2,
            bulbs,
        };
    });
}

/** A point on the wire at `t` along it: a hanging curve that swings gently, still at both anchors. */
export function wireAt(strand: Strand, t: number, now: number): Point {
    if (t <= 0) return strand.from;
    if (t >= 1) return strand.to;
    const swing = Math.sin((now / strand.swayPeriod) * Math.PI * 2 + strand.swayPhase);
    const belly = 4 * t * (1 - t);
    return {
        x: strand.from.x + (strand.to.x - strand.from.x) * t + SWAY * swing * belly,
        y: strand.from.y + (strand.to.y - strand.from.y) * t + strand.sag * (1 + 0.03 * swing) * belly,
    };
}

/** 1 for a bulb burning steadily, lower while it stutters. */
export function glow(bulb: Bulb, now: number): number {
    for (const [offset, length] of bulb.stutters) if (burst(now, bulb.period, length, offset).active) return DIM;
    return 1;
}
