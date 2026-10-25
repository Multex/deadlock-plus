import { applyWake, type Pointer, type Wake } from "../../theme-decor-wake";

export type { Pointer };

export interface Mote {
    x: number;
    y: number;
    vx: number;
    vy: number;
    /** 0 is far away (small, slow, dim), 1 is close to the viewer. */
    depth: number;
    phase: number;
}

export const WAKE_RADIUS = 180;

/** A frame after a stall (a hidden window, a long task) counts as at most this long, so nothing jumps. */
const MAX_STEP = 0.05;
/** How fast a stirred mote falls back to the room's slow drift, per second. */
const SETTLE = 1.2;
/** Faster than the room's own drift ever gets, px/s: something has stirred the mote. */
const STIRRED = 20;
const WAKE: Wake = { radius: WAKE_RADIUS, drag: 14, part: 220, swirl: 0.35, fullStir: 300 };

export function moteCount(width: number, height: number): number {
    return Math.min(180, Math.max(70, Math.round((width * height) / 6000)));
}

export function createMotes(count: number, width: number, height: number, random: () => number): Mote[] {
    return Array.from({ length: count }, () => ({
        x: random() * width,
        y: random() * height,
        vx: 0,
        vy: 0,
        depth: random(),
        phase: random() * Math.PI * 2,
    }));
}

export function stepMotes(
    motes: Mote[],
    dt: number,
    time: number,
    width: number,
    height: number,
    pointer: Pointer | null,
): boolean {
    const step = Math.min(dt, MAX_STEP);
    const settle = Math.min(1, step * SETTLE);
    let stirred = false;
    for (const m of motes) {
        const pace = 0.4 + m.depth * 0.8;
        const driftX = Math.sin(time * 0.11 + m.phase) * 7 * pace;
        const driftY = (-2.5 + Math.cos(time * 0.09 + m.phase * 1.7) * 5) * pace;
        m.vx += (driftX - m.vx) * settle;
        m.vy += (driftY - m.vy) * settle;

        applyWake(m, pointer, step, WAKE, 0.5 + m.depth * 0.5);

        if (!stirred && Math.hypot(m.vx, m.vy) > STIRRED) stirred = true;
        m.x += m.vx * step;
        m.y += m.vy * step;
        if (m.x > width) m.x -= width;
        else if (m.x < 0) m.x += width;
        if (m.y > height) m.y -= height;
        else if (m.y < 0) m.y += height;
    }
    return stirred;
}

/** How much of the lamp's light reaches a point: the panel is lit from just above its top centre. */
export function beam(x: number, y: number, width: number, height: number): number {
    const spread = width * 0.18 + y * 0.55;
    const across = Math.exp(-(((x - width / 2) / spread) ** 2));
    const down = Math.max(0, 1 - y / (height * 1.1)) ** 0.8;
    return across * down;
}
