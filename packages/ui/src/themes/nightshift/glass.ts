/** Rain on the window: drops that cling, grow, slide and merge, over condensation the cursor wipes. */

import type { Pointer } from "../../theme-decor-wake";

export interface Drop {
    x: number;
    y: number;
    r: number;
    vy: number;
    sliding: boolean;
    /** Distance until a sliding drop leaves its next bead. */
    shed: number;
}

export interface Glass {
    drops: Drop[];
    /** Condensation per cell, 0 (wiped clear) to 1 (fogged). */
    fog: Float32Array;
    cols: number;
    rows: number;
    /** Seconds between new drops landing; `Infinity` stops new rain. */
    spawnEvery: number;
    spawnIn: number;
}

export const FOG_CELL = 16;
/** Drops at least this big (px radius) are heavy enough to run down the glass. */
export const SLIDE_RADIUS = 4;

const MAX_STEP = 0.05;
const POOL = 260;
const GRAVITY = 260;
const MAX_SLIDE = 140;
const BEAD_EVERY = 9;
/** A sliding drop loses this much radius per bead it leaves. */
const BEAD_COST = 0.08;
const REFOG = 0.06;
const WIPE_RADIUS = 46;
/** Cursor speed, px/s, at which a pass wipes the glass fully clear. */
const FULL_WIPE = 500;

const between = (random: () => number, min: number, max: number) => min + (max - min) * random();

export function createGlass(width: number, height: number, random: () => number): Glass {
    const cols = Math.ceil(width / FOG_CELL) + 1;
    const rows = Math.ceil(height / FOG_CELL) + 1;
    const drops = Array.from({ length: Math.round((width * height) / 9_000) }, () => ({
        x: random() * width,
        y: random() * height,
        r: between(random, 1, 3.4),
        vy: 0,
        sliding: false,
        shed: BEAD_EVERY,
    }));
    return { drops, fog: new Float32Array(cols * rows).fill(1), cols, rows, spawnEvery: 0.12, spawnIn: 0 };
}

function cell(glass: Glass, x: number, y: number): number {
    const c = Math.min(glass.cols - 1, Math.max(0, Math.floor(x / FOG_CELL)));
    const r = Math.min(glass.rows - 1, Math.max(0, Math.floor(y / FOG_CELL)));
    return r * glass.cols + c;
}

export function fogAt(glass: Glass, x: number, y: number): number {
    return glass.fog[cell(glass, x, y)] ?? 1;
}

function clear(glass: Glass, x: number, y: number, radius: number, amount: number) {
    const reach = Math.ceil(radius / FOG_CELL);
    const cx = Math.floor(x / FOG_CELL);
    const cy = Math.floor(y / FOG_CELL);
    for (let r = cy - reach; r <= cy + reach; r++) {
        if (r < 0 || r >= glass.rows) continue;
        for (let c = cx - reach; c <= cx + reach; c++) {
            if (c < 0 || c >= glass.cols) continue;
            const d = Math.hypot((c + 0.5) * FOG_CELL - x, (r + 0.5) * FOG_CELL - y);
            if (d > radius) continue;
            const i = r * glass.cols + c;
            glass.fog[i] = (glass.fog[i] ?? 1) * (1 - amount * (1 - d / radius));
        }
    }
}

/** Steps the glass and returns whether anything moves fast enough to need the full frame rate. */
export function stepGlass(
    glass: Glass,
    dt: number,
    width: number,
    height: number,
    pointer: Pointer | null,
    random: () => number,
): boolean {
    const step = Math.min(dt, MAX_STEP);
    let busy = false;

    for (let i = 0; i < glass.fog.length; i++) glass.fog[i] = Math.min(1, (glass.fog[i] ?? 1) + REFOG * step);
    const speed = pointer ? Math.hypot(pointer.vx, pointer.vy) : 0;
    if (pointer && speed > 0) {
        busy = true;
        clear(glass, pointer.x, pointer.y, WIPE_RADIUS, Math.min(1, speed / FULL_WIPE));
    }

    glass.spawnIn -= step;
    while (glass.spawnIn <= 0 && glass.spawnEvery !== Infinity) {
        glass.spawnIn += glass.spawnEvery;
        glass.drops.push({
            x: random() * width,
            y: random() * height,
            r: between(random, 0.9, 2.6),
            vy: 0,
            sliding: false,
            shed: BEAD_EVERY,
        });
    }

    const beads: Drop[] = [];
    for (const d of glass.drops) {
        if (!d.sliding && d.r >= SLIDE_RADIUS) d.sliding = true;
        if (!d.sliding) continue;
        busy = true;
        d.vy = Math.min(MAX_SLIDE * (d.r / SLIDE_RADIUS), d.vy + GRAVITY * step);
        const fall = d.vy * step;
        d.y += fall;
        // Water does not run straight: a small sideways wander.
        d.x += (random() - 0.5) * 0.6;
        clear(glass, d.x, d.y, d.r * 2.2, 0.8);
        d.shed -= fall;
        while (d.shed <= 0 && d.r > SLIDE_RADIUS * 0.6) {
            d.shed += BEAD_EVERY;
            d.r -= BEAD_COST;
            const r = between(random, 0.6, 1.4);
            // Left just clear of the drop, or the merge below would take it straight back.
            beads.push({ x: d.x, y: d.y - d.r - r - 1, r, vy: 0, sliding: false, shed: BEAD_EVERY });
        }
        // A drop that has shed most of its water sticks again.
        if (d.r < SLIDE_RADIUS * 0.6) d.sliding = false;
    }
    glass.drops.push(...beads);

    // Merge drops that touch: the bigger one keeps going with both drops' water.
    const sorted = glass.drops.sort((a, b) => b.r - a.r);
    const kept: Drop[] = [];
    for (const d of sorted) {
        const into = kept.find((k) => Math.hypot(k.x - d.x, k.y - d.y) < (k.r + d.r) * 0.9);
        if (into) into.r = Math.sqrt(into.r * into.r + d.r * d.r);
        else kept.push(d);
    }
    glass.drops = kept.filter((d) => d.y - d.r < height).slice(0, POOL);

    return busy;
}
