<script lang="ts" module>
    import { seeded } from "../../theme-decor-random";
    import { createSwarm } from "./hole";

    // Outside the component, so the swarm carries on where it was when Settings rebuilds the panel.
    const swarm = createSwarm(seeded(0x0b1d));
</script>

<script lang="ts">
    import { onMount } from "svelte";
    import { DRIFT_MS, glowSprite, runCanvas } from "../../theme-decor-loop";
    import { between } from "../../theme-decor-random";
    import { HORIZON, OUTER, diskTurn, glowAt, project, stepSwarm } from "./hole";

    /** The shadow's radius in px; the hole's other sizes are measured in it. */
    const SHADOW = 54;
    const TILT = 0.22;
    /** The disk's far side, bent up over the shadow by its gravity: a smaller ring, seen nearly face-on. */
    const LENSED_SCALE = 0.84;
    const LENSED_TILT = 0.9;
    const DISK_INNER = 1.25;
    const SIZE = Math.ceil(SHADOW * OUTER * 2 + 40);

    let canvas: HTMLCanvasElement;

    /** The disk seen face-on: hot white at its inner edge, cooling to violet, streaked with orbiting gas. */
    function diskTexture(): HTMLCanvasElement {
        const size = SHADOW * OUTER * 2;
        const c = size / 2;
        const inner = SHADOW * DISK_INNER;
        const outer = SHADOW * OUTER;
        const s = document.createElement("canvas");
        s.width = s.height = size;
        const ctx = s.getContext("2d");
        if (!ctx) return s;
        const base = ctx.createRadialGradient(c, c, inner, c, c, outer);
        base.addColorStop(0, "rgba(251, 245, 255, 0.9)");
        base.addColorStop(0.12, "rgba(201, 166, 255, 0.7)");
        base.addColorStop(0.35, "rgba(155, 92, 255, 0.4)");
        base.addColorStop(0.7, "rgba(90, 34, 200, 0.12)");
        base.addColorStop(1, "rgba(60, 20, 140, 0)");
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, size, size);

        const random = seeded(0xd15c);
        ctx.lineCap = "round";
        for (let i = 0; i < 520; i++) {
            const t = random() ** 1.6;
            const r = inner + (outer - inner) * t;
            const start = random() * Math.PI * 2;
            ctx.globalAlpha = between(random, 0.08, 0.35) * glowAt(r / SHADOW);
            ctx.strokeStyle = t < 0.15 ? "#fbf5ff" : t < 0.45 ? "#c9a6ff" : "#8a4dff";
            ctx.lineWidth = between(random, 0.6, 1.8);
            ctx.beginPath();
            ctx.arc(c, c, r, start, start + between(random, 0.3, 1.6));
            ctx.stroke();
        }

        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.arc(c, c, inner, 0, Math.PI * 2);
        ctx.fill();
        return s;
    }

    /** The photon ring: light caught orbiting just outside the shadow. */
    function ringSprite(): HTMLCanvasElement {
        const size = Math.ceil(SHADOW * 3);
        const s = document.createElement("canvas");
        s.width = s.height = size;
        const ctx = s.getContext("2d");
        if (!ctx) return s;
        ctx.shadowColor = "#b98cff";
        ctx.shadowBlur = 14;
        ctx.strokeStyle = "#f4ecff";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, SHADOW * 1.03, 0, Math.PI * 2);
        ctx.stroke();
        return s;
    }

    onMount(() => {
        const disk = diskTexture();
        const ring = ringSprite();
        const mote = glowSprite("#fbf5ff", "#9b5cff", 24, 0.6);
        const random = seeded(0x5ee);

        const half = (
            ctx: CanvasRenderingContext2D,
            cx: number,
            cy: number,
            side: "far" | "near",
            scale: number,
            tilt: number,
            turn: number,
            alpha: number,
        ) => {
            ctx.save();
            ctx.beginPath();
            if (side === "far") ctx.rect(cx - SIZE, cy - SIZE, SIZE * 2, SIZE);
            else ctx.rect(cx - SIZE, cy, SIZE * 2, SIZE);
            ctx.clip();
            ctx.translate(cx, cy);
            ctx.scale(scale, scale * tilt);
            ctx.rotate(turn);
            ctx.globalAlpha = alpha;
            ctx.drawImage(disk, -disk.width / 2, -disk.height / 2);
            ctx.restore();
        };

        const motes = (ctx: CanvasRenderingContext2D, cx: number, cy: number, front: boolean) => {
            for (const p of swarm) {
                const at = project(p.r, p.angle, TILT);
                if (at.front !== front) continue;
                // A mote behind the hole disappears into its shadow.
                if (!front && Math.hypot(at.x, at.y) < HORIZON) continue;
                ctx.globalAlpha = glowAt(p.r) * 0.9;
                ctx.drawImage(mote, cx + at.x * SHADOW - 6, cy + at.y * SHADOW - 6, 12, 12);
            }
            ctx.globalAlpha = 1;
        };

        // The disk's near half crosses the shadow, so it is drawn and beamed apart, keeping the shadow true black.
        const near = document.createElement("canvas");
        const nearCtx = near.getContext("2d");

        /** The side turning toward the viewer burns brighter; the receding side dims. */
        const beam = (ctx: CanvasRenderingContext2D, cx: number, width: number, height: number) => {
            const fade = ctx.createLinearGradient(cx - SHADOW * OUTER, 0, cx + SHADOW * OUTER, 0);
            fade.addColorStop(0, "rgba(0, 0, 0, 0.6)");
            fade.addColorStop(1, "rgba(0, 0, 0, 0)");
            ctx.globalCompositeOperation = "destination-out";
            ctx.fillStyle = fade;
            ctx.fillRect(0, 0, width, height);
            ctx.globalCompositeOperation = "source-over";
        };

        const paint = (ctx: CanvasRenderingContext2D, width: number, height: number, now: number) => {
            const cx = width / 2;
            const cy = height / 2;
            const turn = diskTurn(now);
            ctx.clearRect(0, 0, width, height);
            half(ctx, cx, cy, "far", 1, TILT, turn, 1);
            half(ctx, cx, cy, "far", LENSED_SCALE, LENSED_TILT, turn, 0.9);
            half(ctx, cx, cy, "near", LENSED_SCALE, LENSED_TILT, turn, 0.3);
            motes(ctx, cx, cy, false);
            beam(ctx, cx, width, height);

            ctx.fillStyle = "#000";
            ctx.beginPath();
            ctx.arc(cx, cy, SHADOW, 0, Math.PI * 2);
            ctx.fill();
            ctx.drawImage(ring, cx - ring.width / 2, cy - ring.height / 2);

            if (nearCtx) {
                if (near.width !== ctx.canvas.width || near.height !== ctx.canvas.height) {
                    near.width = ctx.canvas.width;
                    near.height = ctx.canvas.height;
                }
                nearCtx.setTransform(ctx.getTransform());
                nearCtx.clearRect(0, 0, width, height);
                half(nearCtx, cx, cy, "near", 1, TILT, turn, 1);
                beam(nearCtx, cx, width, height);
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.drawImage(near, 0, 0);
                ctx.restore();
            }
            motes(ctx, cx, cy, true);
        };

        return runCanvas(
            canvas,
            {
                fit(width, height) {
                    // Painted here too, so the hole still hangs in the corner while motion is reduced.
                    const ctx = canvas.getContext("2d");
                    if (!ctx) return;
                    const ratio = canvas.width / width;
                    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
                    paint(ctx, width, height, Date.now());
                },
                frame(ctx, dt, now, _pointer, width, height) {
                    stepSwarm(swarm, dt, random);
                    paint(ctx, width, height, now);
                    return DRIFT_MS;
                },
            },
            1.5,
        );
    });
</script>

<div class="void">
    <div class="haze" style:--size="{SIZE}px"></div>
    <canvas bind:this={canvas} class="hole" style:--size="{SIZE}px"></canvas>
</div>

<style>
    .void {
        position: absolute;
        inset: 0;
    }

    /* Low in the corner: page headers put their titles and buttons along the top. */
    .hole,
    .haze {
        position: absolute;
        bottom: calc(var(--size) / -2 + 96px);
        right: calc(var(--size) / -2 + 120px);
        width: var(--size);
        height: var(--size);
    }

    /* Light scattered round the hole, kept tight to it so the rest of the screen stays true black. */
    .haze {
        background: radial-gradient(closest-side, rgb(155 92 255 / 9%), transparent 70%);
    }
</style>
