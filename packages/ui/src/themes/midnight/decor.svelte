<script lang="ts">
    import { onMount } from "svelte";
    import { burst, runTicker } from "../../theme-decor-loop";
    import { between, seeded } from "../../theme-decor-random";

    const random = seeded(0x1d17e);
    const WIDTH = 1200;
    const HEIGHT = 170;

    type Building = { x: number; w: number; h: number; spire: boolean; step: boolean };
    type Light = { x: number; y: number; blink: boolean; offset: number; period: number };

    const buildings: Building[] = [];
    for (let x = -10; x < WIDTH;) {
        const w = between(random, 34, 90);
        const tall = random() < 0.25;
        buildings.push({
            x,
            w,
            h: tall ? between(random, 110, 160) : between(random, 40, 105),
            spire: tall && random() < 0.6,
            step: random() < 0.35,
        });
        x += w + between(random, -6, 4);
    }

    const lights: Light[] = buildings.flatMap((b) =>
        Array.from({ length: Math.round(b.w * b.h * 0.0016) }, () => ({
            x: b.x + 6 + Math.floor(random() * Math.max(1, (b.w - 14) / 8)) * 8,
            y: HEIGHT - b.h + 10 + Math.floor(random() * Math.max(1, (b.h - 20) / 10)) * 10,
            blink: random() < 0.18,
            offset: between(random, 0, 14_000),
            period: between(random, 9_000, 16_000),
        })),
    );

    function outline(b: Building): string {
        const top = HEIGHT - b.h;
        const pts = [`${b.x},${HEIGHT}`, `${b.x},${top}`];
        if (b.step)
            pts.push(
                `${b.x + b.w * 0.25},${top}`,
                `${b.x + b.w * 0.25},${top - 10}`,
                `${b.x + b.w * 0.75},${top - 10}`,
                `${b.x + b.w * 0.75},${top}`,
            );
        if (b.spire)
            pts.push(`${b.x + b.w / 2 - 2},${top}`, `${b.x + b.w / 2},${top - 26}`, `${b.x + b.w / 2 + 2},${top}`);
        pts.push(`${b.x + b.w},${top}`, `${b.x + b.w},${HEIGHT}`);
        return pts.join(" ");
    }

    const FOG_PERIOD = 140_000;
    /** Fog this soft moves under a pixel per step at 4 steps a second, so it reads as smooth. */
    const FOG_STEP_MS = 250;

    let now = $state(Date.now());
    // Each blinking window is dark for the middle stretch of its own cycle.
    const dark = (l: Light) => l.blink && burst(now, l.period, l.period * 0.4, l.offset + l.period * 0.4).active;
    const fog = $derived(1 - Math.abs(((now % FOG_PERIOD) / FOG_PERIOD) * 2 - 1));

    onMount(() => {
        const ticker = runTicker((at) => {
            now = at;
            return FOG_STEP_MS;
        });
        return ticker.stop;
    });
</script>

<div class="midnight">
    <div class="moon"></div>
    <div class="fog" data-motion style:transform="translateX({fog * 30}%)"></div>
    <svg class="skyline" viewBox="0 0 {WIDTH} {HEIGHT}" preserveAspectRatio="xMidYMax slice">
        {#each buildings as b, i (i)}
            <polygon points={outline(b)} />
        {/each}
        {#each lights as l, i (i)}
            <rect class="window" class:dark={dark(l)} x={l.x} y={l.y} width="3" height="4" />
        {/each}
    </svg>
</div>

<style>
    .midnight {
        position: absolute;
        inset: 0;
        container-type: size;
    }

    .moon {
        position: absolute;
        top: -18cqh;
        right: -6cqw;
        width: 46cqh;
        aspect-ratio: 1;
        border-radius: 50%;
        background: radial-gradient(
            circle,
            color-mix(in oklch, var(--brass) 22%, transparent) 0%,
            color-mix(in oklch, var(--brass) 7%, transparent) 35%,
            transparent 70%
        );
    }

    .fog {
        position: absolute;
        inset: auto -50% 6cqh;
        height: 22cqh;
        background:
            radial-gradient(40% 50% at 25% 60%, color-mix(in oklch, var(--brass) 7%, transparent), transparent 70%),
            radial-gradient(35% 45% at 70% 50%, color-mix(in oklch, var(--brass) 5%, transparent), transparent 70%);
        will-change: transform;
    }

    .skyline {
        position: absolute;
        inset: auto 0 0;
        width: 100%;
        height: min(20cqh, 170px);
        fill: var(--chrome);
        opacity: 0.85;
    }

    .window {
        fill: var(--brass);
        opacity: 0.22;
    }

    .window.dark {
        opacity: 0.03;
    }
</style>
