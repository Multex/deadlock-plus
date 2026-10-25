/** A black hole in the corner: matter whirling round a tilted disk and falling in. Radii are in shadow radii. */

import { between } from "../../theme-decor-random";

export interface Mote {
    r: number;
    angle: number;
}

/** Particles vanish here, just outside the shadow's photon ring. */
export const HORIZON = 1.1;
export const OUTER = 5;

const COUNT = 70;
/** Angular speed at radius 1, rad/s; it falls off with r^1.5, as orbits do. */
const SPIN = 0.6;
const DRIFT = 0.03;
const PULL = 0.08;
const BRIGHTEST = 1.8;
const DISK_PERIOD = 60_000;

export function createSwarm(random: () => number): Mote[] {
    return Array.from({ length: COUNT }, () => ({
        r: between(random, HORIZON + 0.2, OUTER),
        angle: random() * Math.PI * 2,
    }));
}

export function stepSwarm(swarm: Mote[], dt: number, random: () => number) {
    for (const p of swarm) {
        p.angle += SPIN * p.r ** -1.5 * dt;
        p.r -= (DRIFT + PULL / (p.r * p.r)) * dt;
        if (p.r <= HORIZON) {
            p.r = between(random, OUTER * 0.85, OUTER);
            p.angle = random() * Math.PI * 2;
        }
    }
}

/** A point in the disk's plane seen at `tilt` (1 face-on, 0 edge-on); the near half passes in front of the hole. */
export function project(r: number, angle: number, tilt: number): { x: number; y: number; front: boolean } {
    const s = Math.sin(angle);
    return { x: r * Math.cos(angle), y: r * s * tilt, front: s > 0 };
}

/** How brightly matter glows at radius `r`: fading in off the horizon, out toward the rim. */
export function glowAt(r: number): number {
    if (r <= HORIZON || r >= OUTER) return 0;
    if (r < BRIGHTEST) {
        const t = Math.min(1, (r - HORIZON) / 0.4);
        return t * t * (3 - 2 * t);
    }
    return (OUTER - r) / (OUTER - BRIGHTEST);
}

export function diskTurn(now: number): number {
    return ((now % DISK_PERIOD) / DISK_PERIOD) * Math.PI * 2;
}
