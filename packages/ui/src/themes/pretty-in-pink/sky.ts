import { between } from "../../theme-decor-random";

/** Clouds keep to this top share of the panel, over the page header rather than the cards. */
export const CLOUD_BAND = 0.45;
export const MAX_HEARTS = 10;

/** Margin either side of the page, as a share of the panel's width, where the page's cards leave the art seen. */
const MARGIN = 0.18;
const IN_MARGIN = 0.7;
const HEART_EVERY: [number, number] = [0.9, 1.8];
const FADE_IN = 0.15;
const FADE_OUT = 0.35;

export interface Puff {
    dx: number;
    dy: number;
    r: number;
}

export interface Cloud {
    x: number;
    y: number;
    scale: number;
    /** px/s, rightward; bigger (nearer) clouds drift faster. */
    speed: number;
    puffs: Puff[];
    width: number;
    height: number;
}

export interface Heart {
    x: number;
    y: number;
    size: number;
    age: number;
    life: number;
    /** How far it rocks side to side as it rises, px. */
    sway: number;
    phase: number;
    /** px/s, upward. */
    rise: number;
    kind: "heart" | "sparkle";
    /** Index into the decor's colours: pink, lilac, sky blue. */
    tint: number;
}

export interface Sky {
    clouds: Cloud[];
    hearts: Heart[];
    nextHeart: number;
    time: number;
}

/**
 * A cumulus at scale 1: a row of overlapping puffs sitting on one flat base, biggest in the middle. Each puff
 * overlaps the next, so the outline reads as one cloud.
 */
export function cloudPuffs(random: () => number): { puffs: Puff[]; width: number; height: number } {
    const count = 5 + Math.floor(random() * 3);
    const radii = Array.from({ length: count }, (_, i) => {
        const swell = Math.sin((Math.PI * (i + 0.5)) / count);
        return 13 + 21 * swell * between(random, 0.75, 1);
    });
    const height = 2 * Math.max(...radii);
    const puffs: Puff[] = [];
    let dx = radii[0]!;
    radii.forEach((r, i) => {
        if (i > 0) dx += (radii[i - 1]! + r) * between(random, 0.5, 0.6);
        puffs.push({ dx, dy: height - r, r });
    });
    return { puffs, width: dx + radii.at(-1)!, height };
}

/** A bank of cloud along the bottom edge, `span` wide and `height` tall, puffs sunk partly below the edge. */
export function bankPuffs(random: () => number, span: number, height: number): Puff[] {
    const radius = () => height * between(random, 0.3, 0.55);
    const puffs: Puff[] = [];
    let r = radius();
    let dx = 0;
    while (dx - r < span) {
        puffs.push({ dx, dy: height - r * between(random, 0.2, 0.45), r });
        const next = radius();
        dx += (r + next) * between(random, 0.55, 0.7);
        r = next;
    }
    return puffs;
}

function placeCloud(cloud: Cloud, height: number, random: () => number) {
    const room = Math.max(0, height * CLOUD_BAND - cloud.height * cloud.scale);
    cloud.y = random() * room;
}

export function createSky(width: number, height: number, random: () => number): Sky {
    const count = Math.min(7, Math.max(4, Math.round(width / 260)));
    const clouds = Array.from({ length: count }, (_, i) => {
        const shape = cloudPuffs(random);
        const scale = between(random, 0.6, 1.3);
        const cloud: Cloud = { ...shape, x: 0, y: 0, scale, speed: 2 + 5 * scale };
        // Spread across the width in slots, so they never start bunched together.
        cloud.x = ((i + random() * 0.6) / count) * (width + cloud.width * scale) - cloud.width * scale;
        placeCloud(cloud, height, random);
        return cloud;
    });
    return { clouds, hearts: [], nextHeart: between(random, 0.8, 2), time: 0 };
}

/** Mostly in the margins beside the page, sometimes anywhere. */
export function edgeX(random: () => number, width: number): number {
    if (random() >= IN_MARGIN) return random() * width;
    const inset = random() * width * MARGIN;
    return random() < 0.5 ? inset : width - inset;
}

function spawnHeart(width: number, height: number, random: () => number): Heart {
    const sparkle = random() < 0.25;
    return {
        x: edgeX(random, width),
        y: between(random, height * 0.35, height * 0.95),
        size: sparkle ? between(random, 8, 13) : between(random, 8, 16),
        age: 0,
        life: between(random, 7, 11),
        sway: between(random, 6, 14),
        phase: random() * Math.PI * 2,
        rise: between(random, 10, 20),
        kind: sparkle ? "sparkle" : "heart",
        tint: Math.floor(random() * 3),
    };
}

export function stepSky(sky: Sky, dt: number, width: number, height: number, random: () => number): void {
    if (dt <= 0) return;
    sky.time += dt;

    for (const c of sky.clouds) {
        c.x += c.speed * dt;
        if (c.x > width) {
            c.x = -c.width * c.scale - random() * 60;
            placeCloud(c, height, random);
        }
    }

    for (const h of sky.hearts) {
        h.age += dt;
        h.y -= h.rise * dt;
    }
    sky.hearts = sky.hearts.filter((h) => h.age < h.life);

    sky.nextHeart -= dt;
    if (sky.nextHeart <= 0) {
        if (sky.hearts.length < MAX_HEARTS) sky.hearts.push(spawnHeart(width, height, random));
        sky.nextHeart = between(random, ...HEART_EVERY);
    }
}

/** Where a heart is drawn across: its column, rocked side to side as it rises. */
export function heartX(heart: Heart): number {
    return heart.x + Math.sin(heart.age * 1.3 + heart.phase) * heart.sway;
}

export function heartAlpha(heart: Heart): number {
    const t = heart.age / heart.life;
    return Math.max(0, Math.min(1, t / FADE_IN, (1 - t) / FADE_OUT));
}

export function fitSky(sky: Sky, fromW: number, fromH: number, toW: number, toH: number): void {
    if (!fromW || !fromH) return;
    const [sx, sy] = [toW / fromW, toH / fromH];
    for (const b of [...sky.clouds, ...sky.hearts]) {
        b.x *= sx;
        b.y *= sy;
    }
}
