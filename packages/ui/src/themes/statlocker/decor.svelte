<script lang="ts">
    import { onMount } from "svelte";
    import { CALM_MS, addStop, burst, lazy, runCanvas } from "../../theme-decor-loop";
    import { between, seeded } from "../../theme-decor-random";

    const random = seeded(0x57a7);
    const WIDTH = 1000;
    const HEIGHT = 120;
    const STEPS = 36;
    const CHART_MAX_PX = 140;
    /** Redraws as if new data came in, then holds the finished line (asleep) until the next round. */
    const PERIOD = 16_000;
    const DRAW = 7_200;

    // A climbing win-rate line: a random walk with an upward lean.
    let y = HEIGHT * 0.7;
    const points = Array.from({ length: STEPS + 1 }, (_, i) => {
        if (i > 0) y = Math.min(HEIGHT - 8, Math.max(10, y + between(random, -14, 10)));
        return [(i / STEPS) * WIDTH, y] as const;
    });
    const line = points.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
    const area = `0,${HEIGHT} ${line} ${WIDTH},${HEIGHT}`;

    let canvas: HTMLCanvasElement;

    onMount(() => {
        const brass = lazy(() => getComputedStyle(canvas).getPropertyValue("--brass").trim() || null);
        let held = false;

        const draw = (ctx: CanvasRenderingContext2D, width: number, height: number, reveal: number, tint: string) => {
            const chart = Math.min(height * 0.16, CHART_MAX_PX);
            const top = height - chart;
            const trace = () => {
                for (const [px, py] of points) ctx.lineTo((px / WIDTH) * width, top + (py / HEIGHT) * chart);
            };
            ctx.clearRect(0, top - 4, width, chart + 4);
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, top - 4, width * reveal, chart + 4);
            ctx.clip();

            const fill = ctx.createLinearGradient(0, top, 0, height);
            addStop(fill, 0, tint);
            addStop(fill, 1, "transparent");
            ctx.globalAlpha = 0.1;
            ctx.fillStyle = fill;
            ctx.beginPath();
            ctx.moveTo(0, height);
            trace();
            ctx.lineTo(width, height);
            ctx.fill();

            ctx.globalAlpha = 0.4;
            ctx.strokeStyle = tint;
            ctx.lineWidth = 1.5;
            ctx.lineJoin = "round";
            ctx.beginPath();
            trace();
            ctx.stroke();
            ctx.restore();
        };

        return runCanvas(
            canvas,
            {
                fit() {
                    held = false;
                },
                frame(ctx, _dt, now, _pointer, width, height) {
                    const tint = brass();
                    if (!tint) return CALM_MS;
                    const round = burst(now, PERIOD, DRAW);
                    if (!round.active) {
                        if (!held) draw(ctx, width, height, 1, tint);
                        held = true;
                        return round.untilChange;
                    }
                    held = false;
                    draw(ctx, width, height, 1 - (1 - round.progress) ** 3, tint);
                    return CALM_MS;
                },
            },
            2,
        );
    });
</script>

<div class="statlocker">
    <div class="grid"></div>
    <canvas bind:this={canvas} class="chart-motion" data-motion></canvas>
    <svg class="chart" data-still viewBox="0 0 {WIDTH} {HEIGHT}" preserveAspectRatio="none">
        <defs>
            <linearGradient id="statlocker-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="var(--brass)" stop-opacity="0.1" />
                <stop offset="1" stop-color="var(--brass)" stop-opacity="0" />
            </linearGradient>
        </defs>
        <polygon class="area" points={area} fill="url(#statlocker-area)" />
        <polyline class="line" points={line} />
    </svg>
</div>

<style>
    .statlocker {
        position: absolute;
        inset: 0;
        container-type: size;
    }

    .grid {
        position: absolute;
        inset: 0;
        background-image:
            linear-gradient(to right, oklch(1 0 0 / 4%) 1px, transparent 1px),
            linear-gradient(to bottom, oklch(1 0 0 / 4%) 1px, transparent 1px),
            linear-gradient(to right, oklch(1 0 0 / 2%) 1px, transparent 1px),
            linear-gradient(to bottom, oklch(1 0 0 / 2%) 1px, transparent 1px);
        background-size:
            120px 120px,
            120px 120px,
            24px 24px,
            24px 24px;
        mask: radial-gradient(90% 80% at 50% 100%, #000, transparent 85%);
    }

    .chart-motion {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
    }

    /* The reduced-motion stand-in: the finished line, drawn once. */
    .chart {
        position: absolute;
        inset: auto 0 0;
        width: 100%;
        height: min(16cqh, 140px);
        overflow: visible;
    }

    .line {
        fill: none;
        stroke: var(--brass);
        stroke-width: 1.5;
        stroke-linejoin: round;
        vector-effect: non-scaling-stroke;
        opacity: 0.4;
    }
</style>
