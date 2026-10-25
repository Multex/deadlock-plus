<script lang="ts">
    import { onMount } from "svelte";
    import { BUSY_MS, burst, runCanvas } from "../../theme-decor-loop";

    const PERIOD = 10_000;
    const RUN = 4_500;

    let root: HTMLElement;
    let canvas: HTMLCanvasElement;

    /**
     * The panel's own border: rounded where the panel is, square against the window edge, and only the top edge
     * when the panel sits flush with no sidebar. Returns the path and its length.
     */
    function edge(width: number, height: number, r: number): [Path2D, number] {
        const o = 0.5;
        if (!r) return [new Path2D(`M ${width} ${o} H 0`), width];
        const d = [
            `M ${width} ${o}`,
            `H ${r + o}`,
            `A ${r} ${r} 0 0 0 ${o} ${r + o}`,
            `V ${height - r - o}`,
            `A ${r} ${r} 0 0 0 ${r + o} ${height - o}`,
            `H ${width}`,
        ].join(" ");
        return [new Path2D(d), 2 * (width - r) + (height - 2 * r) + Math.PI * r];
    }

    onMount(() => {
        const panel = root.closest(".theme-decor")?.parentElement;
        const radius = panel ? parseFloat(getComputedStyle(panel).borderTopLeftRadius) || 0 : 0;
        const tint = getComputedStyle(canvas).getPropertyValue("--brass").trim();
        let path = new Path2D();
        let length = 1;
        let idle = false;

        // Halo, tail, then the bright head: each a dash of this many px ending at the pulse's front.
        const strokes = [
            { dash: 90, width: 7, alpha: 0.12 },
            { dash: 70, width: 2, alpha: 0.35 },
            { dash: 18, width: 1.5, alpha: 0.9 },
        ];

        return runCanvas(
            canvas,
            {
                fit(width, height) {
                    [path, length] = edge(width, height, radius);
                    idle = false;
                },
                frame(ctx, _dt, now, _pointer, width, height) {
                    const run = burst(now, PERIOD, RUN);
                    if (!run.active) {
                        if (!idle) ctx.clearRect(0, 0, width, height);
                        idle = true;
                        return run.untilChange;
                    }
                    idle = false;
                    ctx.clearRect(0, 0, width, height);
                    // The front enters at the top right, runs the whole edge, and leaves at the bottom right.
                    const front = run.progress * (length + 90);
                    ctx.strokeStyle = tint;
                    ctx.lineCap = "round";
                    for (const s of strokes) {
                        ctx.globalAlpha = s.alpha;
                        ctx.lineWidth = s.width;
                        ctx.setLineDash([s.dash, length + 200]);
                        ctx.lineDashOffset = s.dash - front;
                        ctx.stroke(path);
                    }
                    return BUSY_MS;
                },
            },
            2,
        );
    });
</script>

<div class="deadlock-api" bind:this={root}>
    <div class="corner top-left"></div>
    <div class="corner bottom-right"></div>
    <!-- One canvas for the whole edge, asleep between pulses, instead of a canvas loop per card. -->
    <canvas bind:this={canvas} class="current" data-motion></canvas>
</div>

<style>
    .deadlock-api {
        position: absolute;
        inset: 0;
    }

    .corner {
        position: absolute;
        width: 55%;
        height: 55%;
        opacity: 0.5;
    }

    .top-left {
        top: 0;
        left: 0;
        background: radial-gradient(
            farthest-side at 0 0,
            color-mix(in oklch, var(--brass) 16%, transparent),
            transparent
        );
    }

    .bottom-right {
        right: 0;
        bottom: 0;
        background: radial-gradient(
            farthest-side at 100% 100%,
            color-mix(in oklch, var(--brass) 12%, transparent),
            transparent
        );
    }

    .current {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
    }
</style>
