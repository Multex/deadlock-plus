<script lang="ts" module>
    import { seeded } from "../../theme-decor-random";
    import { bankPuffs, cloudPuffs, type Puff, type Sky } from "./sky";

    // Outside the component, so the clouds carry on where they were when moving to Settings rebuilds the panel.
    const field: { sky: Sky | null; width: number; height: number } = { sky: null, width: 0, height: 0 };

    const BANK_WIDTH = 2000;
    const BANK_HEIGHT = 100;
    const BACK_BANK = bankPuffs(seeded(0xba4c), BANK_WIDTH, BANK_HEIGHT * 0.9);
    const FRONT_BANK = bankPuffs(seeded(0xf40e), BANK_WIDTH, BANK_HEIGHT * 0.62).map((p) => ({
        ...p,
        dy: p.dy + BANK_HEIGHT * 0.38,
    }));

    // The reduced-motion stand-ins, kept to the top and the margins.
    const STILL_CLOUDS = [
        { x: 1, y: 24, scale: 0.8, shape: cloudPuffs(seeded(0xc1)) },
        { x: 30, y: 3, scale: 0.6, shape: cloudPuffs(seeded(0xc2)) },
        { x: 86, y: 6, scale: 1.1, shape: cloudPuffs(seeded(0xc3)) },
    ];
    const STILL_HEARTS = [
        { x: 5, y: 52, size: 14, tint: 0, sparkle: false },
        { x: 9, y: 70, size: 10, tint: 1, sparkle: true },
        { x: 94, y: 44, size: 12, tint: 2, sparkle: false },
        { x: 91, y: 63, size: 11, tint: 0, sparkle: true },
        { x: 96, y: 78, size: 9, tint: 1, sparkle: false },
    ];

    function circles(puffs: Puff[], grow = 0): string {
        return puffs
            .map((p) => {
                const r = p.r + grow;
                return `M ${p.dx - r} ${p.dy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
            })
            .join(" ");
    }
</script>

<script lang="ts">
    import { onMount } from "svelte";
    import { DRIFT_MS, burst, runCanvas, runTicker } from "../../theme-decor-loop";
    import { createSky, fitSky, heartAlpha, heartX, stepSky } from "./sky";

    const HEART_SVG =
        "M0 9 C-3 6.5 -10 2.5 -10 -3 C-10 -7 -6.5 -9.5 -3.5 -9.5 C-1.8 -9.5 -0.6 -8.5 0 -7.2 C0.6 -8.5 1.8 -9.5 3.5 -9.5 C6.5 -9.5 10 -7 10 -3 C10 2.5 3 6.5 0 9 Z";
    const SPARKLE_SVG = "M0 -10 Q1.2 -1.2 10 0 Q1.2 1.2 0 10 Q-1.2 1.2 -10 0 Q-1.2 -1.2 0 -10 Z";
    const HEART = new Path2D(HEART_SVG);
    const SPARKLE = new Path2D(SPARKLE_SVG);
    const LILAC = "oklch(0.8 0.085 305)";
    const SKY = "oklch(0.82 0.075 232)";
    const CLOUD = "oklch(0.995 0.004 350)";
    const CLOUD_EDGE = "oklch(0.88 0.045 240)";
    const CLOUD_SHADE = "oklch(0.88 0.05 305 / 45%)";
    const CLOUD_SHADE_CLEAR = "oklch(0.88 0.05 305 / 0%)";
    const SPRITE = 40;

    const WIGGLE_PERIOD = 16_000;
    const WIGGLE_RUN = 1_400;

    let { layers = {} }: { layers?: Record<string, boolean> } = $props();
    const cloudsOn = $derived(layers.clouds !== false);
    const heartsOn = $derived(layers.hearts !== false);
    const bowOn = $derived(layers.bow !== false);

    let canvas = $state<HTMLCanvasElement>();
    let wiggling = $state(false);

    function fitField(width: number, height: number) {
        if (!field.sky) field.sky = createSky(width, height, seeded(0x9e7));
        else fitSky(field.sky, field.width, field.height, width, height);
        field.width = width;
        field.height = height;
    }

    /** A cloud's puffs, ringed in pale blue, then filled white with a flat base, drawn once at its own scale. */
    function cloudSprite(puffs: Puff[], width: number, height: number, scale: number): HTMLCanvasElement {
        const pad = 4;
        const sprite = document.createElement("canvas");
        sprite.width = Math.ceil((width + pad * 2) * scale);
        sprite.height = Math.ceil((height + pad * 2) * scale);
        const ctx = sprite.getContext("2d");
        if (!ctx) return sprite;
        ctx.scale(scale, scale);
        ctx.translate(pad, pad);
        const base = (grow: number) => {
            const first = puffs[0]!;
            const last = puffs.at(-1)!;
            ctx.beginPath();
            ctx.roundRect(
                first.dx - grow,
                height - first.r * 0.9 - grow,
                last.dx - first.dx + grow * 2,
                first.r * 0.9 + grow * 2,
                first.r * 0.6,
            );
            ctx.fill();
            ctx.fill(new Path2D(circles(puffs, grow)));
        };
        ctx.fillStyle = CLOUD_EDGE;
        base(1.6);
        ctx.fillStyle = CLOUD;
        base(0);
        // A blush of lilac along the underside gives the puffs some depth.
        const shade = ctx.createLinearGradient(0, height * 0.4, 0, height);
        shade.addColorStop(0, CLOUD_SHADE_CLEAR);
        shade.addColorStop(1, CLOUD_SHADE);
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = shade;
        ctx.fillRect(-pad, -pad, width + pad * 2, height + pad * 2);
        return sprite;
    }

    /** `fills` are laid one over another, each at its own opacity, so the trim can be tinted toward white. */
    function shapeSprite(path: Path2D, fills: [string, number][], shine: boolean): HTMLCanvasElement {
        const sprite = document.createElement("canvas");
        sprite.width = sprite.height = SPRITE;
        const ctx = sprite.getContext("2d");
        if (!ctx) return sprite;
        ctx.translate(SPRITE / 2, SPRITE / 2);
        ctx.scale(SPRITE / 24, SPRITE / 24);
        for (const [fill, alpha] of fills) {
            ctx.globalAlpha = alpha;
            ctx.fillStyle = fill;
            ctx.fill(path);
        }
        ctx.globalAlpha = 1;
        if (shine) {
            ctx.fillStyle = "rgb(255 255 255 / 70%)";
            ctx.beginPath();
            ctx.ellipse(-5, -4.5, 2.2, 1.4, -0.6, 0, Math.PI * 2);
            ctx.fill();
        }
        return sprite;
    }

    $effect(() => {
        const target = canvas;
        const drawClouds = cloudsOn;
        const drawHearts = heartsOn;
        if (!target) return;
        const brass = getComputedStyle(target).getPropertyValue("--brass").trim();
        // Pink from the theme's trim, so a custom accent carries through, then lilac and sky blue.
        const fills: [string, number][][] = [
            [
                ["white", 1],
                [brass, 0.55],
            ],
            [[LILAC, 1]],
            [[SKY, 1]],
        ];
        const hearts = fills.map((f) => shapeSprite(HEART, f, true));
        const sparkles = fills.map((f) => shapeSprite(SPARKLE, f, false));
        const ratio = Math.min(1.5, window.devicePixelRatio || 1);
        let clouds: HTMLCanvasElement[] = [];
        const random = seeded(0x4ea7);

        return runCanvas(
            target,
            {
                fit(width, height) {
                    fitField(width, height);
                    clouds = (field.sky?.clouds ?? []).map((c) =>
                        cloudSprite(c.puffs, c.width, c.height, c.scale * ratio),
                    );
                },
                frame(ctx, dt, _now, _pointer, width, height) {
                    const sky = field.sky;
                    if (!sky) return DRIFT_MS;
                    stepSky(sky, dt, width, height, random);
                    ctx.clearRect(0, 0, width, height);

                    if (drawClouds) {
                        ctx.globalAlpha = 0.92;
                        sky.clouds.forEach((c, i) => {
                            const sprite = clouds[i];
                            if (sprite) ctx.drawImage(sprite, c.x, c.y, sprite.width / ratio, sprite.height / ratio);
                        });
                    }

                    if (drawHearts)
                        for (const h of sky.hearts) {
                            const sprite = (h.kind === "heart" ? hearts : sparkles)[h.tint];
                            if (!sprite) continue;
                            const s = (h.size * SPRITE) / 24;
                            ctx.globalAlpha = heartAlpha(h) * 0.85;
                            ctx.drawImage(sprite, heartX(h) - s / 2, h.y - s / 2, s, s);
                        }
                    ctx.globalAlpha = 1;
                    return DRIFT_MS;
                },
            },
            1.5,
        );
    });

    onMount(() => {
        const ticker = runTicker((now) => {
            const wiggle = burst(now, WIGGLE_PERIOD, WIGGLE_RUN, 5_000);
            wiggling = wiggle.active;
            return wiggle.untilChange;
        });
        return ticker.stop;
    });
</script>

<div class="pretty-in-pink">
    <div class="dots"></div>

    {#if cloudsOn}
        {#each STILL_CLOUDS as c, i (i)}
            <svg
                class="still-cloud"
                data-still
                viewBox="-2 -2 {c.shape.width + 4} {c.shape.height + 4}"
                style:left="{c.x}%"
                style:top="{c.y}%"
                style:width="{c.shape.width * c.scale}px"
            >
                <defs>
                    <linearGradient id="pretty-in-pink-shade-{i}" x1="0" y1="0.4" x2="0" y2="1">
                        <stop offset="0" stop-color={CLOUD_SHADE_CLEAR} />
                        <stop offset="1" stop-color={CLOUD_SHADE} />
                    </linearGradient>
                </defs>
                <path class="edge" d={circles(c.shape.puffs, 1.6)} />
                <path class="body" d={circles(c.shape.puffs)} />
                <path d={circles(c.shape.puffs)} fill="url(#pretty-in-pink-shade-{i})" />
            </svg>
        {/each}
    {/if}
    {#if heartsOn}
        {#each STILL_HEARTS as h, i (i)}
            <svg
                class="still-heart tint-{h.tint}"
                data-still
                viewBox="-12 -12 24 24"
                style:left="{h.x}%"
                style:top="{h.y}%"
                style:width="{h.size}px"
            >
                <path d={h.sparkle ? SPARKLE_SVG : HEART_SVG} />
            </svg>
        {/each}
    {/if}

    {#if cloudsOn || heartsOn}
        <canvas bind:this={canvas} class="sky" data-motion></canvas>
    {/if}

    <svg class="bank" viewBox="0 0 {BANK_WIDTH} {BANK_HEIGHT}" preserveAspectRatio="xMidYMax slice">
        <path class="back" d={circles(BACK_BANK)} />
        <path class="front" d={circles(FRONT_BANK)} />
    </svg>

    {#if bowOn}
        <svg class="bow" class:wiggling viewBox="0 0 120 100">
            <defs>
                <clipPath id="pretty-in-pink-loops">
                    <path
                        d="M60 40 C40 8 6 6 9 34 C12 58 40 56 60 40 Z M60 40 C80 8 114 6 111 34 C108 58 80 56 60 40 Z"
                    />
                </clipPath>
            </defs>
            <path class="tail" d="M55 46 C49 62 41 78 31 94 L41 89 L45 98 C53 82 59 64 62 48 Z" />
            <path class="tail" d="M65 46 C71 62 79 78 89 94 L79 89 L75 98 C67 82 61 64 58 48 Z" />
            <path class="loop" d="M60 40 C40 8 6 6 9 34 C12 58 40 56 60 40 Z" />
            <path class="loop" d="M60 40 C80 8 114 6 111 34 C108 58 80 56 60 40 Z" />
            <g class="spots" clip-path="url(#pretty-in-pink-loops)">
                <circle cx="22" cy="24" r="3.2" />
                <circle cx="17" cy="40" r="2.6" />
                <circle cx="33" cy="34" r="2.8" />
                <circle cx="98" cy="24" r="3.2" />
                <circle cx="103" cy="40" r="2.6" />
                <circle cx="87" cy="34" r="2.8" />
            </g>
            <path class="fold" d="M60 40 C50 26 34 24 32 34 C34 44 48 46 60 40 Z" />
            <path class="fold" d="M60 40 C70 26 86 24 88 34 C86 44 72 46 60 40 Z" />
            <rect class="knot" x="50" y="29" width="20" height="23" rx="8" />
            <path class="shine" d="M15 28 C17 20 24 16 31 17" />
            <path class="shine" d="M105 28 C103 20 96 16 89 17" />
        </svg>
    {/if}
</div>

<style>
    .pretty-in-pink {
        position: absolute;
        inset: 0;
        --pink-heart: color-mix(in oklch, var(--brass) 55%, white);
    }

    /* Polka dots in the margins either side of the page, faded out before they reach it. */
    .dots {
        position: absolute;
        inset: 0;
        background-image:
            radial-gradient(circle, color-mix(in oklch, var(--brass) 13%, transparent) 2.6px, transparent 3.2px),
            radial-gradient(circle, color-mix(in oklch, var(--brass) 13%, transparent) 2.6px, transparent 3.2px);
        background-position:
            0 0,
            15px 15px;
        background-size: 30px 30px;
        mask: linear-gradient(to right, #000, transparent 220px, transparent calc(100% - 220px), #000);
    }

    .sky {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
    }

    .still-cloud,
    .still-heart {
        position: absolute;
        overflow: visible;
    }

    .still-cloud {
        opacity: 0.92;
    }

    .still-cloud .edge {
        fill: oklch(0.88 0.045 240);
    }

    .still-cloud .body {
        fill: oklch(0.995 0.004 350);
    }

    .still-heart {
        translate: -50% -50%;
        opacity: 0.8;
    }

    .still-heart.tint-0 {
        fill: var(--pink-heart);
    }

    .still-heart.tint-1 {
        fill: oklch(0.8 0.085 305);
    }

    .still-heart.tint-2 {
        fill: oklch(0.82 0.075 232);
    }

    /* A soft cloud bank along the bottom: lilac behind, white in front. */
    .bank {
        position: absolute;
        inset: auto 0 0;
        width: 100%;
        height: clamp(48px, 8%, 84px);
    }

    .bank .back {
        fill: oklch(0.91 0.04 300);
        opacity: 0.8;
    }

    .bank .front {
        fill: oklch(0.995 0.004 350);
        opacity: 0.95;
    }

    /* Tied on the bottom corner, on the cloud bank: page headers own the top corners. */
    .bow {
        position: absolute;
        bottom: 22px;
        left: 12px;
        width: 104px;
        rotate: -12deg;
        transform-origin: 50% 40%;
        overflow: visible;
        filter: drop-shadow(0 2px 2px color-mix(in oklch, var(--brass) 25%, transparent));
    }

    .bow .loop,
    .bow .tail,
    .bow .knot {
        stroke: var(--brass);
        stroke-width: 2;
        stroke-linejoin: round;
    }

    .bow .loop {
        fill: color-mix(in oklch, var(--brass) 42%, white);
    }

    .bow .tail {
        fill: color-mix(in oklch, var(--brass) 58%, white);
    }

    .bow .fold {
        fill: color-mix(in oklch, var(--brass) 62%, white);
        opacity: 0.75;
    }

    .bow .knot {
        fill: color-mix(in oklch, var(--brass) 55%, white);
    }

    .bow .spots {
        fill: white;
        opacity: 0.85;
    }

    .bow .shine {
        fill: none;
        stroke: white;
        stroke-width: 2.4;
        stroke-linecap: round;
        opacity: 0.7;
    }

    /* Now and then the bow gives a little wiggle, started from script and run once. */
    .bow.wiggling {
        animation: wiggle 1.4s ease-in-out;
    }

    @keyframes wiggle {
        0%,
        100% {
            rotate: -12deg;
            scale: 1;
        }
        20% {
            rotate: -18deg;
            scale: 1.04;
        }
        45% {
            rotate: -7deg;
        }
        70% {
            rotate: -14deg;
        }
        85% {
            rotate: -11deg;
        }
    }
</style>
