<script lang="ts" module>
    import type { Sky } from "./sky";

    // Outside the component, so the sky carries on where it was when moving to Settings rebuilds the panel.
    const field: { sky: Sky | null; width: number; height: number } = { sky: null, width: 0, height: 0 };
</script>

<script lang="ts">
    import { onMount } from "svelte";
    import { BUSY_MS, CALM_MS, addStop, burst, glowSprite, lazy, runCanvas, runTicker } from "../../theme-decor-loop";
    import { seeded } from "../../theme-decor-random";
    import { constellationAlpha, createSky, stepSky } from "./sky";
    import { TAIL_HEIGHT, TAIL_WIDTH, furStrokes } from "./tail";

    const STAR = new Path2D(
        "M0 -10 L2.9 -3.9 L9.5 -3.1 L4.6 1.5 L5.9 8.1 L0 4.8 L-5.9 8.1 L-4.6 1.5 L-9.5 -3.1 L-2.9 -3.9 Z",
    );
    const SPARKLE = new Path2D("M0 -11 Q1 -1 11 0 Q1 1 0 11 Q-1 1 -11 0 Q-1 -1 0 -11 Z");
    const STAR_SVG = "M0 -10 L2.9 -3.9 L9.5 -3.1 L4.6 1.5 L5.9 8.1 L0 4.8 L-5.9 8.1 L-4.6 1.5 L-9.5 -3.1 L-2.9 -3.9 Z";
    const SPARKLE_SVG = "M0 -11 Q1 -1 11 0 Q1 1 0 11 Q-1 1 -11 0 Q-1 -1 0 -11 Z";

    const SHOOTING_PERIOD = 21_000;
    const SHOOTING_RUN = 900;
    const FLICK_PERIOD = 12_000;
    const FLICK_RUN = 1_600;
    const WALK_PERIOD = 30_000;
    const WALK_RUN = 12_000;
    const PRINTS = 10;

    // The reduced-motion stand-ins: the sheet's stars and sparkles, kept to the panel's edges.
    const still = [
        { x: 6, y: 10, size: 22, star: false },
        { x: 92, y: 7, size: 30, star: true },
        { x: 96, y: 34, size: 14, star: false },
        { x: 3, y: 58, size: 26, star: true },
        { x: 8, y: 90, size: 15, star: false },
    ];

    /** A drift across a 1000-wide strip: a few soft hills, smoothed. `crest` is the top edge alone. */
    function drift(seed: number, base: number, rise: number, hills: number): { fill: string; crest: string } {
        const r = seeded(seed);
        const points = Array.from({ length: hills + 1 }, (_, i) => [
            (i / hills) * 1000,
            base - rise * (0.35 + 0.65 * r()),
        ]);
        let crest = `M ${points[0]![0]} ${points[0]![1]}`;
        for (let i = 1; i < points.length; i++) {
            const [x0, y0] = points[i - 1]!;
            const [x1, y1] = points[i]!;
            crest += ` C ${x0 + (x1 - x0) / 2} ${y0} ${x0 + (x1 - x0) / 2} ${y1} ${x1} ${y1}`;
        }
        return { fill: `M 0 80 L ${crest.slice(2)} L 1000 80 Z`, crest };
    }
    const BACK_DRIFT = drift(0xb1, 40, 30, 5);
    const FRONT_DRIFT = drift(0xf2, 58, 24, 7);
    const glints = Array.from({ length: 14 }, (_, i) => {
        const r = seeded(0x917 + i);
        return { x: r() * 100, y: 62 + r() * 14, size: 1 + r() * 1.5 };
    });

    let { layers = {} }: { layers?: Record<string, boolean> } = $props();
    const snowOn = $derived(layers.snow !== false);
    const starsOn = $derived(layers.stars !== false);
    const tailOn = $derived(layers.tail !== false);
    const tracksOn = $derived(layers.tracks !== false);

    let canvas = $state<HTMLCanvasElement>();
    let tailCanvas = $state<HTMLCanvasElement>();

    function paintTail(target: HTMLCanvasElement) {
        const ctx = target.getContext("2d");
        if (!ctx) return;
        ctx.scale(2, 2);
        ctx.lineCap = "round";
        for (const s of furStrokes(seeded(0xf0c5))) {
            const length = Math.hypot(s.x1 - s.x0, s.y1 - s.y0) || 1;
            const cx = (s.x0 + s.x1) / 2 - ((s.y1 - s.y0) / length) * s.bend;
            const cy = (s.y0 + s.y1) / 2 + ((s.x1 - s.x0) / length) * s.bend;
            ctx.globalAlpha = s.alpha;
            ctx.strokeStyle = s.colour;
            ctx.lineWidth = s.width;
            ctx.beginPath();
            ctx.moveTo(s.x0, s.y0);
            ctx.quadraticCurveTo(cx, cy, s.x1, s.y1);
            ctx.stroke();
        }
    }
    let flicking = $state(false);
    let walking = $state(false);

    function fit(width: number, height: number) {
        if (!field.sky) field.sky = createSky(width, height, seeded(0xf1a7));
        else if (field.width && field.height) {
            const [sx, sy] = [width / field.width, height / field.height];
            for (const b of [...field.sky.flakes, ...field.sky.stars]) {
                b.x *= sx;
                b.y *= sy;
            }
        }
        field.width = width;
        field.height = height;
    }

    $effect(() => {
        if (tailCanvas) paintTail(tailCanvas);
    });

    $effect(() => {
        const target = canvas;
        const drawSnow = snowOn;
        const drawStars = starsOn;
        if (!target) return;
        const palette = lazy(() => {
            const style = getComputedStyle(target);
            const snow = style.getPropertyValue("--foreground").trim();
            const pink = style.getPropertyValue("--brass").trim();
            return snow && pink ? { snow, pink, flake: glowSprite(snow, snow, 16, 0.35) } : null;
        });
        const random = seeded(0x5a0f);

        const shape = (
            ctx: CanvasRenderingContext2D,
            path: Path2D,
            x: number,
            y: number,
            size: number,
            angle: number,
            draw: () => void,
        ) => {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            ctx.scale(size / 22, size / 22);
            draw();
            ctx.restore();
        };

        return runCanvas(
            target,
            {
                fit,
                frame(ctx, dt, now, pointer, width, height) {
                    const sky = field.sky;
                    const colours = palette();
                    if (!sky || !colours) return CALM_MS;
                    const { snow, pink, flake } = colours;
                    const busy = stepSky(sky, dt, width, height, pointer, random);
                    ctx.clearRect(0, 0, width, height);

                    if (drawSnow)
                        for (const f of sky.flakes) {
                            ctx.globalAlpha = f.alpha;
                            const s = f.size * 2.4;
                            ctx.drawImage(flake, f.x - s / 2, f.y - s / 2, s, s);
                        }

                    const c = sky.constellation;
                    const linked = c ? constellationAlpha(c, sky.time) : 0;
                    if (drawStars && c && linked > 0) {
                        ctx.globalAlpha = 0.28 * linked;
                        ctx.strokeStyle = snow;
                        ctx.lineWidth = 1;
                        ctx.setLineDash([2, 5]);
                        ctx.beginPath();
                        for (const [a, b] of c.links) {
                            const [s, e] = [sky.stars[a], sky.stars[b]];
                            if (!s || !e) continue;
                            ctx.moveTo(s.x, s.y);
                            ctx.lineTo(e.x, e.y);
                        }
                        ctx.stroke();
                        ctx.setLineDash([]);
                    }

                    if (drawStars)
                        for (const g of sky.glitter) {
                            ctx.globalAlpha = 0.7 * (1 - g.age / g.life);
                            ctx.fillStyle = g.pink ? pink : snow;
                            ctx.fillRect(g.x - g.size / 2, g.y - g.size / 2, g.size, g.size);
                        }

                    ctx.lineWidth = 1.6;
                    if (drawStars)
                        for (const s of sky.stars) {
                            // Mostly calm, with a sharp flash now and then.
                            const flash = Math.max(0, Math.sin(sky.time * 1.1 + s.phase)) ** 6;
                            const bright =
                                linked > 0 && c?.links.some(([a, b]) => sky.stars[a] === s || sky.stars[b] === s);
                            ctx.globalAlpha = Math.min(1, 0.4 + 0.5 * flash + (bright ? 0.25 * linked : 0));
                            shape(
                                ctx,
                                s.kind === "star" ? STAR : SPARKLE,
                                s.x,
                                s.y,
                                s.size * (1 + 0.3 * flash),
                                s.angle,
                                () => {
                                    ctx.strokeStyle = s.kind === "star" ? snow : pink;
                                    ctx.lineWidth = (1.6 * 22) / s.size;
                                    ctx.stroke(s.kind === "star" ? STAR : SPARKLE);
                                },
                            );
                        }

                    if (drawStars)
                        for (const p of sky.sparks) {
                            const t = p.age / p.life;
                            const grow = t < 0.15 ? t / 0.15 : 1 - ((t - 0.15) / 0.85) * 0.6;
                            ctx.globalAlpha = 0.85 * (1 - t);
                            shape(ctx, SPARKLE, p.x, p.y, p.size * grow, p.angle, () => {
                                ctx.fillStyle = p.pink ? pink : snow;
                                ctx.fill(SPARKLE);
                            });
                        }

                    const shooting = burst(now, SHOOTING_PERIOD, SHOOTING_RUN, 4_000);
                    if (drawStars && shooting.active) {
                        const t = shooting.progress;
                        const slope = Math.tan((14 * Math.PI) / 180);
                        const x = width * (0.1 + 0.7 * t);
                        const y = height * 0.08 + (x - width * 0.1) * slope;
                        const tail = 120;
                        const trail = ctx.createLinearGradient(x - tail, y - tail * slope, x, y);
                        addStop(trail, 0, "transparent");
                        addStop(trail, 1, snow);
                        ctx.globalAlpha = 0.85 * Math.min(1, (1 - t) * 4, t * 8);
                        ctx.strokeStyle = trail;
                        ctx.lineWidth = 1.2;
                        ctx.beginPath();
                        ctx.moveTo(x - tail, y - tail * slope);
                        ctx.lineTo(x, y);
                        ctx.stroke();
                        shape(ctx, SPARKLE, x, y, 12, 0, () => {
                            ctx.fillStyle = snow;
                            ctx.fill(SPARKLE);
                        });
                    }

                    return busy || (drawStars && shooting.active) ? BUSY_MS : CALM_MS;
                },
            },
            2,
        );
    });

    onMount(() => {
        const ticker = runTicker((now) => {
            const flick = burst(now, FLICK_PERIOD, FLICK_RUN, 2_000);
            const walk = burst(now, WALK_PERIOD, WALK_RUN, 9_000);
            flicking = flick.active;
            walking = walk.active;
            return Math.min(flick.untilChange, walk.untilChange);
        });

        return ticker.stop;
    });
</script>

<div class="flint-snow">
    {#if starsOn}
        {#each still as s, i (i)}
            <svg
                class="still-star"
                class:star={s.star}
                data-still
                viewBox="-12 -12 24 24"
                style:left="{s.x}%"
                style:top="{s.y}%"
                style:width="{s.size}px"
            >
                <path d={s.star ? STAR_SVG : SPARKLE_SVG} stroke-linejoin="round" />
            </svg>
        {/each}
    {/if}

    {#if snowOn || starsOn}
        <canvas bind:this={canvas} class="sky" data-motion></canvas>
    {/if}

    <!-- The snowbank: a shadowed drift behind Flint's tail and a brighter one in front, so the tail lies in the
         snow rather than on it. -->
    <svg class="snowbank" viewBox="0 0 1000 80" preserveAspectRatio="none">
        <path class="back" d={BACK_DRIFT.fill} />
    </svg>
    <!-- Flint's tail in the sheet's colours, painted once from fur strokes. -->
    {#if tailOn}
        <canvas bind:this={tailCanvas} class="tail" class:flicking width={TAIL_WIDTH * 2} height={TAIL_HEIGHT * 2}
        ></canvas>
    {/if}
    <svg class="snowbank" viewBox="0 0 1000 80" preserveAspectRatio="none">
        <path class="front" d={FRONT_DRIFT.fill} />
        <path class="crest" d={FRONT_DRIFT.crest} />
    </svg>
    <div class="glints">
        {#each glints as g, i (i)}
            <span style:left="{g.x}%" style:top="{g.y}%" style:width="{g.size}px" style:height="{g.size}px"></span>
        {/each}
    </div>

    <!-- Fox tracks crossing the snowbank now and then. -->
    {#if tracksOn}
        <div class="tracks" class:walking data-motion>
            {#each { length: PRINTS } as _, i (i)}
                <svg
                    class="print"
                    viewBox="0 0 20 20"
                    style:left="{6 + i * 3.4}%"
                    style:bottom="{i % 2 ? 14 : 22}px"
                    style:rotate="{i % 2 ? 98 : 82}deg"
                    style:animation-delay="{i * 0.45}s"
                >
                    <g class="dent">
                        <ellipse cx="10" cy="13.5" rx="5.6" ry="4.8" />
                        <circle cx="4.6" cy="7" r="2.8" />
                        <circle cx="8.3" cy="3.6" r="2.8" />
                        <circle cx="11.7" cy="3.6" r="2.8" />
                        <circle cx="15.4" cy="7" r="2.8" />
                    </g>
                    <g class="pads">
                        <ellipse cx="10" cy="14" rx="3.8" ry="3" />
                        <circle cx="4.8" cy="7.4" r="1.6" />
                        <circle cx="8.4" cy="4.1" r="1.6" />
                        <circle cx="11.6" cy="4.1" r="1.6" />
                        <circle cx="15.2" cy="7.4" r="1.6" />
                    </g>
                </svg>
            {/each}
        </div>
    {/if}
</div>

<style>
    .flint-snow {
        position: absolute;
        inset: 0;
    }

    .sky {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
    }

    .still-star {
        position: absolute;
        translate: -50% -50%;
        overflow: visible;
        fill: none;
        stroke: var(--brass);
        stroke-width: 1.6;
        opacity: 0.35;
    }

    .still-star.star {
        stroke: var(--foreground);
    }

    .still-star path {
        vector-effect: non-scaling-stroke;
    }

    .snowbank {
        position: absolute;
        inset: auto 0 0;
        width: 100%;
        height: clamp(56px, 9%, 96px);
    }

    /* Night snow: the sheet's cream lifted toward white, cooled by the navy around it. */
    .snowbank .back {
        fill: color-mix(in oklch, var(--foreground) 55%, oklch(0.75 0.04 270));
        opacity: 0.55;
    }

    .snowbank .front {
        fill: color-mix(in oklch, var(--foreground) 45%, white);
        opacity: 0.88;
    }

    .snowbank .crest {
        fill: none;
        stroke: white;
        stroke-width: 1.5;
        vector-effect: non-scaling-stroke;
        opacity: 0.5;
    }

    .glints {
        position: absolute;
        inset: auto 0 0;
        height: clamp(56px, 9%, 96px);
    }

    .glints span {
        position: absolute;
        border-radius: 50%;
        background: white;
        box-shadow: 0 0 4px white;
        opacity: 0.8;
    }

    .print {
        position: absolute;
        width: 17px;
        opacity: 0;
    }

    /* Pressed into the snow: a cool shadow where the paw sank, the pink pads at its bottom. */
    .print .dent {
        fill: oklch(0.45 0.05 275);
    }

    .print .pads {
        fill: color-mix(in oklch, var(--brass) 80%, oklch(0.45 0.05 275));
    }

    /* Each print presses in a step after the last, lingers, then fills back in with snow. */
    .walking .print {
        animation: step 12s ease-out both;
    }

    @keyframes step {
        0% {
            opacity: 0;
            scale: 0.6;
        }
        3% {
            opacity: 0.9;
            scale: 1;
        }
        60% {
            opacity: 0.75;
        }
        85%,
        100% {
            opacity: 0;
        }
    }

    .tail {
        position: absolute;
        right: -40px;
        bottom: -18px;
        width: 300px;
        transform-origin: 100% 70%;
    }

    .tail.flicking {
        animation: flick 1.6s ease-in-out;
    }

    @keyframes flick {
        0%,
        100% {
            rotate: 0deg;
        }
        25% {
            rotate: -9deg;
        }
        50% {
            rotate: 4deg;
        }
        75% {
            rotate: -2deg;
        }
    }
</style>
