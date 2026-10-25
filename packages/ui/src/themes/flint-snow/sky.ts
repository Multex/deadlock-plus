import { applyWake, type Pointer, type Wake } from "../../theme-decor-wake";

export interface Flake {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    alpha: number;
    /** 0 is far away (small, slow), 1 is close. */
    depth: number;
    phase: number;
}

export interface Star {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    /** An outlined five-point star, or a four-point sparkle, as on the character sheet. */
    kind: "star" | "sparkle";
    angle: number;
    spin: number;
    phase: number;
    /** Seconds until this star drops its next speck of glitter. */
    shed: number;
}

export interface Speck {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    age: number;
    life: number;
    angle: number;
    spin: number;
    /** Pink pads colour rather than snow white. */
    pink: boolean;
}

export interface Constellation {
    /** Pairs of indices into `stars`. */
    links: [number, number][];
    start: number;
    length: number;
}

export interface Sky {
    flakes: Flake[];
    stars: Star[];
    glitter: Speck[];
    sparks: Speck[];
    constellation: Constellation | null;
    nextConstellation: number;
    time: number;
}

export const CONSTELLATION_REACH = 320;

const MAX_STEP = 0.05;
const SETTLE = 1;
/** Faster than snow ever falls on its own, px/s: the cursor has stirred it. */
const STIRRED = 70;
const STAR_SPEED = 12;
const SHED_EVERY = 0.22;
const GLITTER_POOL = 90;
const SPARK_POOL = 80;
/** Cursor speed, px/s, below which it leaves no sparkles. */
const SPARK_FROM = 120;
const SPARKS_PER_PX = 1 / 22;
const SPARK_GRAVITY = 40;
const FADE = 1.2;
const WAKE: Wake = { radius: 150, drag: 10, part: 180, swirl: 0.3, fullStir: 300 };

const between = (random: () => number, min: number, max: number) => min + (max - min) * random();

export function createSky(width: number, height: number, random: () => number): Sky {
    const flakes = Array.from({ length: Math.min(60, Math.max(30, Math.round((width * height) / 30_000))) }, () => {
        const depth = random();
        return {
            x: random() * width,
            y: random() * height,
            vx: 0,
            vy: 0,
            size: 2 + depth * 3,
            alpha: between(random, 0.18, 0.5),
            depth,
            phase: random() * Math.PI * 2,
        };
    });
    const stars = Array.from({ length: 9 }, (_, i) => {
        const heading = random() * Math.PI * 2;
        const speed = between(random, 0.4, 1) * STAR_SPEED;
        return {
            x: random() * width,
            y: random() * height,
            vx: Math.cos(heading) * speed,
            vy: Math.sin(heading) * speed,
            size: i % 3 === 0 ? between(random, 22, 32) : between(random, 12, 22),
            kind: (i % 3 === 0 ? "star" : "sparkle") as Star["kind"],
            angle: random() * Math.PI,
            spin: between(random, -0.35, 0.35),
            phase: random() * Math.PI * 2,
            shed: random() * SHED_EVERY,
        };
    });
    return {
        flakes,
        stars,
        glitter: [],
        sparks: [],
        constellation: null,
        nextConstellation: between(random, 3, 8),
        time: 0,
    };
}

function wrap(value: number, size: number, margin = 0): number {
    if (value > size + margin) return value - size - 2 * margin;
    if (value < -margin) return value + size + 2 * margin;
    return value;
}

function age(specks: Speck[], step: number, gravity: number) {
    for (const s of specks) {
        s.age += step;
        s.vy += gravity * step;
        s.x += s.vx * step;
        s.y += s.vy * step;
        s.angle += s.spin * step;
    }
    return specks.filter((s) => s.age < s.life);
}

function pickConstellation(sky: Sky, random: () => number): Constellation | null {
    const seed = Math.floor(random() * sky.stars.length);
    const from = sky.stars[seed];
    if (!from) return null;
    const near = sky.stars
        .map((s, i) => ({ i, d: Math.hypot(s.x - from.x, s.y - from.y) }))
        .filter((n) => n.i !== seed && n.d <= CONSTELLATION_REACH)
        .sort((a, b) => a.d - b.d)
        .slice(0, 3);
    if (near.length < 2) return null;
    const links: [number, number][] = [
        [seed, near[0]!.i],
        [near[0]!.i, near[1]!.i],
    ];
    if (near[2]) links.push([seed, near[2].i]);
    return { links, start: sky.time, length: 5 };
}

/** Steps the whole sky and returns whether anything moves fast enough to need the full frame rate. */
export function stepSky(
    sky: Sky,
    dt: number,
    width: number,
    height: number,
    pointer: Pointer | null,
    random: () => number,
): boolean {
    const step = Math.min(dt, MAX_STEP);
    sky.time += step;
    const settle = Math.min(1, step * SETTLE);
    let stirred = false;

    for (const f of sky.flakes) {
        const fall = 14 + f.depth * 30;
        const sway = Math.sin(sky.time * 0.6 + f.phase) * (4 + f.depth * 6);
        f.vx += (sway - f.vx) * settle;
        f.vy += (fall - f.vy) * settle;
        applyWake(f, pointer, step, WAKE, 0.5 + f.depth * 0.5);
        if (!stirred && Math.hypot(f.vx, f.vy) > STIRRED) stirred = true;
        f.x = wrap(f.x + f.vx * step, width);
        f.y = wrap(f.y + f.vy * step, height, 6);
    }

    for (const s of sky.stars) {
        // A slow wander, so a star's path curves instead of crossing the panel in a straight line.
        const turn = Math.sin(sky.time * 0.15 + s.phase) * 0.25 * step;
        [s.vx, s.vy] = [s.vx * Math.cos(turn) - s.vy * Math.sin(turn), s.vx * Math.sin(turn) + s.vy * Math.cos(turn)];
        s.x = wrap(s.x + s.vx * step, width, 30);
        s.y = wrap(s.y + s.vy * step, height, 30);
        s.angle += s.spin * step;
        s.shed -= step;
        if (s.shed <= 0) {
            s.shed += SHED_EVERY;
            sky.glitter.push({
                x: s.x + between(random, -3, 3),
                y: s.y + between(random, -3, 3),
                vx: between(random, -4, 4),
                vy: between(random, 2, 8),
                size: between(random, 1, 2.2),
                age: 0,
                life: between(random, 1, 1.6),
                angle: 0,
                spin: 0,
                pink: random() < 0.5,
            });
        }
    }
    sky.glitter = age(sky.glitter, step, 0).slice(-GLITTER_POOL);

    sky.sparks = age(sky.sparks, step, SPARK_GRAVITY);
    const speed = pointer ? Math.hypot(pointer.vx, pointer.vy) : 0;
    if (pointer && speed > SPARK_FROM) {
        let count = speed * step * SPARKS_PER_PX;
        while (count > 0 && random() < count) {
            count -= 1;
            sky.sparks.push({
                x: pointer.x + between(random, -6, 6),
                y: pointer.y + between(random, -6, 6),
                vx: pointer.vx * 0.08 + between(random, -30, 30),
                vy: pointer.vy * 0.08 + between(random, -40, 10),
                size: between(random, 5, 11),
                age: 0,
                life: between(random, 0.6, 1),
                angle: random() * Math.PI,
                spin: between(random, -4, 4),
                pink: random() < 0.6,
            });
        }
        sky.sparks = sky.sparks.slice(-SPARK_POOL);
    }

    const c = sky.constellation;
    if (c && sky.time >= c.start + c.length) sky.constellation = null;
    if (!sky.constellation && sky.time >= sky.nextConstellation) {
        sky.constellation = pickConstellation(sky, random);
        sky.nextConstellation = sky.time + (sky.constellation ? between(random, 10, 16) : 2);
    }

    return stirred || sky.sparks.length > 0;
}

/** How visible a constellation is: fades in, holds, fades out. */
export function constellationAlpha(c: Pick<Constellation, "start" | "length">, time: number): number {
    const t = time - c.start;
    if (t <= 0 || t >= c.length) return 0;
    return Math.min(1, t / FADE, (c.length - t) / FADE);
}
