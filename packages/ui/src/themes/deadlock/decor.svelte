<script lang="ts" module>
    import type { Mote } from "./dust";

    // Outside the component, so the dust carries on where it was when moving to Settings rebuilds the panel.
    const field = { motes: [] as Mote[], width: 0, height: 0, time: 0 };
</script>

<script lang="ts">
    import { onMount } from "svelte";
    import { BUSY_MS, DRIFT_MS, glowSprite, runCanvas } from "../../theme-decor-loop";
    import { seeded } from "../../theme-decor-random";
    import { beam, createMotes, moteCount, stepMotes } from "./dust";

    let canvas: HTMLCanvasElement;

    function fit(width: number, height: number) {
        const { motes } = field;
        if (!motes.length) {
            field.motes = createMotes(moteCount(width, height), width, height, seeded(0xdead));
        } else if (field.width && field.height) {
            for (const m of motes) {
                m.x *= width / field.width;
                m.y *= height / field.height;
            }
            const want = moteCount(width, height);
            if (want < motes.length) motes.length = want;
            else motes.push(...createMotes(want - motes.length, width, height, seeded(motes.length)));
        }
        field.width = width;
        field.height = height;
    }

    onMount(() => {
        const style = getComputedStyle(canvas);
        const glint = glowSprite(
            style.getPropertyValue("--foreground").trim(),
            style.getPropertyValue("--brass").trim(),
        );

        return runCanvas(canvas, {
            fit,
            frame(ctx, dt, _now, pointer, width, height) {
                const { motes } = field;
                field.time += Math.min(dt, 0.05);
                const stirred = stepMotes(motes, dt, field.time, width, height, pointer);

                ctx.clearRect(0, 0, width, height);
                for (const m of motes) {
                    const light = beam(m.x, m.y, width, height);
                    const twinkle = 0.75 + 0.25 * Math.sin(field.time * 1.3 + m.phase * 3);
                    const glow = Math.min(0.6, Math.hypot(m.vx, m.vy) / 220);
                    const alpha = ((0.22 + 0.7 * light) * twinkle + glow) * (0.5 + 0.5 * m.depth);
                    if (alpha < 0.02) continue;
                    ctx.globalAlpha = Math.min(1, alpha);
                    const size = (1.4 + m.depth ** 2 * 4) * 4.5;
                    ctx.drawImage(glint, m.x - size / 2, m.y - size / 2, size, size);
                }
                return stirred ? BUSY_MS : DRIFT_MS;
            },
        });
    });
</script>

<canvas bind:this={canvas} class="dust" data-motion></canvas>

<style>
    .dust {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
    }
</style>
