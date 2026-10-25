<script lang="ts">
    import { onMount } from "svelte";
    import { runCanvas } from "../../theme-decor-loop";
    import { seeded } from "../../theme-decor-random";
    import { STAR, createSpecks, crawl, layout, speckAt, starPoints, tangent, turnAt, type Point } from "./sigil";

    /** The sigil turns and its dashes crawl slowly enough that ten frames a second keep up. */
    const FRAME_MS = 100;
    const LINE = "#b98ae6";
    const NODE = "#d9b8ff";
    const DASH_DOT = [16, 5, 2, 5];
    const specks = createSpecks(seeded(0xdc5), 45);

    let canvas: HTMLCanvasElement;
    let contours: HTMLCanvasElement;

    /** Ripple lines down the left of the ring, like contours on a map; they never move, so they are painted once. */
    function paintContours() {
        const width = (contours.width = Math.max(1, contours.clientWidth));
        const height = (contours.height = Math.max(1, contours.clientHeight));
        const ctx = contours.getContext("2d");
        if (!ctx) return;
        const { cx, cy, r } = layout(width, height);
        const random = seeded(0xc0e7);
        ctx.strokeStyle = LINE;
        ctx.lineWidth = 0.8;
        for (let i = 0; i < 22; i++) {
            const y0 = cy - r * 1.1 + (i / 21) * r * 2.2;
            const amp = 4 + random() * 6;
            const freq = 0.012 + random() * 0.01;
            const phase = random() * Math.PI * 2;
            const left = cx - r * (1.9 + random() * 0.3);
            const right = cx - r * (0.95 + random() * 0.2);
            const fade = ctx.createLinearGradient(left, 0, right, 0);
            fade.addColorStop(0, "transparent");
            fade.addColorStop(0.5, LINE);
            fade.addColorStop(1, "transparent");
            ctx.strokeStyle = fade;
            ctx.globalAlpha = 0.1;
            ctx.beginPath();
            for (let x = left; x <= right; x += 6) {
                const y = y0 + Math.sin(x * freq + phase) * amp;
                if (x === left) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
    }

    function paint(ctx: CanvasRenderingContext2D, width: number, height: number, now: number) {
        ctx.clearRect(0, 0, width, height);
        const { cx, cy, r } = layout(width, height);
        const turn = turnAt(now);
        const cos = Math.cos(turn);
        const sin = Math.sin(turn);
        const at = (p: Point) => ({ x: cx + (p.x * cos - p.y * sin) * r, y: cy + (p.x * sin + p.y * cos) * r });
        const line = (from: Point, to: Point) => {
            const a = at(from);
            const b = at(to);
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
        };
        const ring = (radius: number) => {
            ctx.moveTo(cx + radius * r, cy);
            ctx.arc(cx, cy, radius * r, 0, Math.PI * 2);
        };
        const offset = crawl(now);

        ctx.strokeStyle = LINE;
        ctx.lineCap = "round";

        // The ring: a faint glow under a fine line, and a thinner echo just outside it.
        ctx.beginPath();
        ring(1);
        ctx.globalAlpha = 0.06;
        ctx.lineWidth = 7;
        ctx.stroke();
        ctx.globalAlpha = 0.42;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.beginPath();
        ring(1.035);
        ctx.globalAlpha = 0.15;
        ctx.lineWidth = 0.8;
        ctx.stroke();

        const star = starPoints();
        ctx.beginPath();
        for (let i = 1; i < STAR.length; i++) line(star[STAR[i - 1]!]!, star[STAR[i]!]!);
        ctx.setLineDash(DASH_DOT);
        ctx.lineDashOffset = -offset;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        line({ x: -1.15, y: -0.42 }, { x: 1.15, y: -0.42 });
        line({ x: -1.15, y: 0.42 }, { x: 1.15, y: 0.42 });
        ctx.globalAlpha = 0.22;
        ctx.stroke();

        ctx.beginPath();
        ring(0.382);
        ctx.setLineDash([4, 6]);
        ctx.lineDashOffset = offset;
        ctx.globalAlpha = 0.25;
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        for (const angle of [Math.PI * 0.32, Math.PI * 1.18]) {
            const { from, to } = tangent(angle, 3);
            line(from, to);
        }
        ctx.globalAlpha = 0.2;
        ctx.lineWidth = 0.9;
        ctx.stroke();

        // Small rings sitting on the circle, their middles blacked out so the lines stop at them.
        ctx.strokeStyle = NODE;
        ctx.fillStyle = "#000";
        for (const p of [star[1]!, star[3]!, { x: -1, y: 0 }]) {
            const c = at(p);
            ctx.beginPath();
            ctx.arc(c.x, c.y, r * 0.045, 0, Math.PI * 2);
            ctx.globalAlpha = 1;
            ctx.fill();
            ctx.globalAlpha = 0.55;
            ctx.lineWidth = 1.4;
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.03, 0, Math.PI * 2);
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = NODE;
        for (const s of specks) {
            const p = speckAt(s, now, width, height);
            ctx.globalAlpha = s.alpha;
            ctx.fillRect(p.x, p.y, s.size, s.size);
        }
        ctx.globalAlpha = 1;
    }

    onMount(() => {
        paintContours();
        const resized = new ResizeObserver(paintContours);
        resized.observe(contours);
        const stop = runCanvas(
            canvas,
            {
                fit(width, height) {
                    // Painted here too, so the sigil still hangs there while motion is reduced.
                    const ctx = canvas.getContext("2d");
                    if (!ctx) return;
                    const ratio = canvas.width / width;
                    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
                    paint(ctx, width, height, Date.now());
                },
                frame(ctx, _dt, now, _pointer, width, height) {
                    paint(ctx, width, height, now);
                    return FRAME_MS;
                },
            },
            1.5,
        );
        return () => {
            stop();
            resized.disconnect();
        };
    });
</script>

<div class="deadchaps">
    <div class="glow"></div>
    <canvas bind:this={contours} class="layer"></canvas>
    <canvas bind:this={canvas} class="layer"></canvas>
</div>

<style>
    .deadchaps {
        position: absolute;
        inset: 0;
    }

    /* The violet wash DeadChaps lays over its backdrop, strongest behind the sigil. */
    .glow {
        position: absolute;
        right: -30%;
        bottom: -40%;
        width: 90%;
        aspect-ratio: 1;
        background: radial-gradient(closest-side, rgb(157 78 221 / 14%), rgb(157 78 221 / 4%) 60%, transparent);
    }

    .layer {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
    }
</style>
