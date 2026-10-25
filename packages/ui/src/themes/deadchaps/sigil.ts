/** A sigil in the corner: a pentagram in a ring with its construction lines, turning slowly, with dust drifting by. */

import { between } from "../../theme-decor-random";

export interface Point {
    x: number;
    y: number;
}

/** The order the star's points are joined in: every second one, the pentagram's single stroke. */
export const STAR = [0, 2, 4, 1, 3, 0];

const TURN_PERIOD = 600_000;
/** How fast the dashes crawl along the lines, px/s. */
const CRAWL = 6;
const DASH_CYCLE = 2_800;

export function starPoints(): Point[] {
    return Array.from({ length: 5 }, (_, i) => {
        const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
        return { x: Math.cos(a), y: Math.sin(a) };
    });
}

/** A line touching the unit circle at `angle`, running `length` past the touch point each way. */
export function tangent(angle: number, length: number): { from: Point; to: Point } {
    const p = { x: Math.cos(angle), y: Math.sin(angle) };
    const d = { x: -Math.sin(angle), y: Math.cos(angle) };
    return {
        from: { x: p.x - d.x * length, y: p.y - d.y * length },
        to: { x: p.x + d.x * length, y: p.y + d.y * length },
    };
}

/** Low on the right and big, so part of the ring runs off the panel and the page sits clear of its middle. */
export function layout(width: number, height: number): { cx: number; cy: number; r: number } {
    return { cx: width * 0.86, cy: height * 0.66, r: Math.max(220, height * 0.5) };
}

export function turnAt(now: number): number {
    return ((now % TURN_PERIOD) / TURN_PERIOD) * Math.PI * 2;
}

export function crawl(now: number): number {
    return ((now / 1000) * CRAWL) % DASH_CYCLE;
}

export interface Speck {
    x: number;
    y: number;
    rise: number;
    sway: number;
    phase: number;
    size: number;
    alpha: number;
}

export function createSpecks(random: () => number, count: number): Speck[] {
    return Array.from({ length: count }, () => ({
        x: random(),
        y: random(),
        rise: between(random, 2, 5),
        sway: between(random, 4, 14),
        phase: random() * Math.PI * 2,
        size: between(random, 0.6, 1.6),
        alpha: between(random, 0.2, 0.6),
    }));
}

const wrap = (v: number, max: number) => ((v % max) + max) % max;

export function speckAt(speck: Speck, now: number, width: number, height: number): Point {
    const t = now / 1000;
    return {
        x: wrap(speck.x * width + Math.sin(t * 0.2 + speck.phase) * speck.sway, width),
        y: wrap(speck.y * height - speck.rise * t, height),
    };
}
