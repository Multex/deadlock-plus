<script lang="ts">
    import { untrack } from "svelte";
    import { FoldVertical } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import type { EditionObjectProps } from "../types";
    import { CLOSED, flapAngles, foldFit, frameAt, OPEN, PANEL, REVEAL, scrapFade } from "./reveal";
    import { drawScraps, makeScraps } from "./scraps";
    import { useYearEnd } from "./year-end-data.svelte";
    import YearEndCover from "./year-end-cover.svelte";
    import YearEndPoster from "./year-end-poster.svelte";

    type Fold = "closed" | "playing" | "open";

    const HOVER_PEEK = 14;
    const SCRAP_COUNT = 150;

    let { edition, view, stage, reveal, onrevealed }: EditionObjectProps = $props();

    const data = useYearEnd(
        () => edition,
        () => view,
    );

    let fold = $state<Fold>("closed");
    let clock = $state(0);
    let hover = $state(false);
    let back = $state<HTMLCanvasElement | null>(null);
    let front = $state<HTMLCanvasElement | null>(null);
    let raf = 0;
    let played = false;

    const frame = $derived(fold === "closed" ? CLOSED : fold === "open" ? OPEN : frameAt(clock));
    const fit = $derived(foldFit(frame, stage));
    const angles = $derived(flapAngles(frame, fold === "closed" && hover ? HOVER_PEEK : 0));
    const scraps = $derived(makeScraps(SCRAP_COUNT, edition.volume * 31 + edition.stats.matches));
    const edges = $derived(
        [1, 2, 3, 4]
            .map(
                (k) =>
                    `${k * 3 * fit.thick}px ${k * 3 * fit.thick}px 0 ${k % 2 ? "oklch(0.86 0.025 86)" : "oklch(0.2 0.01 80)"}`,
            )
            .join(", "),
    );

    const reducedMotion = () =>
        document.documentElement.hasAttribute("data-reduced-motion") ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function finish() {
        cancelAnimationFrame(raf);
        fold = "open";
        onrevealed?.();
    }

    function play() {
        cancelAnimationFrame(raf);
        hover = false;
        if (reducedMotion()) {
            finish();
            return;
        }
        clock = 0;
        fold = "playing";
        const start = performance.now();
        const tick = (now: number) => {
            clock = now - start;
            if (clock >= REVEAL.end) finish();
            else raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
    }

    function foldUp() {
        cancelAnimationFrame(raf);
        fold = "closed";
    }

    $effect(() => {
        void edition.id;
        untrack(() => {
            played = false;
            foldUp();
        });
    });

    $effect(() => {
        if (reveal && !played) {
            played = true;
            untrack(play);
        }
    });

    $effect(() => () => cancelAnimationFrame(raf));

    $effect(() => {
        const t = (clock - REVEAL.burstAt) / 1000;
        const showing = fold === "playing" && t > 0;
        const { width, height } = stage;
        const ratio = window.devicePixelRatio || 1;
        for (const [canvas, side] of [
            [back, false],
            [front, true],
        ] as const) {
            if (!canvas) continue;
            const w = Math.round(width * ratio);
            const h = Math.round(height * ratio);
            if (canvas.width !== w) canvas.width = w;
            if (canvas.height !== h) canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) continue;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, w, h);
            if (!showing) continue;
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
            drawScraps(ctx, scraps, {
                t,
                stage: { width, height },
                scale: fit.scale,
                alpha: scrapFade(clock),
                front: side,
            });
        }
    });
</script>

{#snippet slice(index: number)}
    <div class="slice">
        <div class="poster-at" style="left: {-PANEL.w * index}px">
            <YearEndPoster poster={data.view.poster} />
        </div>
        <div class="crease crease-{index}"></div>
    </div>
{/snippet}

<div class="room" style="width: {stage.width}px; height: {stage.height}px;" data-year-end={fold}>
    <canvas class="scraps" bind:this={back} aria-hidden="true"></canvas>

    {#if fit.scale > 0}
        <div class="object" style="transform: translate(-50%, -50%) scale({fit.scale}) translateX({fit.shift}px);">
            <div class="rig" style="width: {PANEL.w}px; height: {PANEL.h}px;">
                <div class="panel" style="box-shadow: {edges}, 0 {30 - 20 * fit.thick}px 60px oklch(0 0 0 / 0.5);">
                    {@render slice(1)}
                </div>
                <div class="flap left" style="transform: translateZ(2px) rotateY({angles.left}deg);">
                    <div class="face">{@render slice(0)}</div>
                    <div class="face reverse">
                        <div class="inside">
                            <p class="inside-kicker">{data.view.poster.inside.kicker}</p>
                            <p class="inside-title">{data.view.poster.inside.title}</p>
                            <p class="inside-span">{data.view.poster.inside.span}</p>
                        </div>
                    </div>
                </div>
                <div
                    class="flap right"
                    class:resting={fold === "closed"}
                    style="transform: translateZ(4px) rotateY({angles.right}deg);"
                >
                    <div class="face">{@render slice(2)}</div>
                    <div class="face reverse">
                        <YearEndCover cover={data.view.cover} backdrop={data.backdrop} portrait={data.portrait} />
                    </div>
                </div>
            </div>
        </div>

        {#if fold === "closed"}
            <Button
                variant="unstyled"
                class="unfold"
                style="width: {PANEL.w * fit.scale}px; height: {PANEL.h * fit.scale}px;"
                aria-label={t("dispatch.year_end.unfold")}
                onpointerenter={() => (hover = true)}
                onpointerleave={() => (hover = false)}
                onclick={play}
            />
        {:else}
            <Button variant="outline" size="sm" class="fold-up" onclick={foldUp}>
                <FoldVertical aria-hidden="true" />
                {t("dispatch.year_end.fold_up")}
            </Button>
        {/if}
    {/if}

    {#if fold === "playing"}
        <div class="dim" style="opacity: {1 - frame.light}"></div>
    {/if}
    <canvas class="scraps" bind:this={front} aria-hidden="true"></canvas>
    {#if frame.flash > 0}
        <div class="flash" style="opacity: {frame.flash}"></div>
        <div
            class="bulb"
            style="opacity: {frame.flash}; transform: translate(-50%, -50%) scale({0.6 + frame.flash});"
        ></div>
    {/if}
</div>

<style>
    .room {
        position: relative;
        flex: none;
        overflow: hidden;
    }

    .object {
        position: absolute;
        top: 50%;
        left: 50%;
    }

    .rig {
        position: relative;
        perspective: 3200px;
    }

    .panel,
    .flap {
        position: absolute;
        top: 0;
        width: 600px;
        height: 900px;
    }

    .panel {
        left: 0;
    }

    .flap {
        transform-style: preserve-3d;
    }

    .flap.left {
        left: -600px;
        transform-origin: right;
    }

    .flap.right {
        left: 600px;
        transform-origin: left;
    }

    .flap.right.resting {
        transition: transform 0.26s cubic-bezier(0.2, 0.8, 0.2, 1);
    }

    .face {
        position: absolute;
        inset: 0;
        overflow: hidden;
        backface-visibility: hidden;
    }

    .face.reverse {
        transform: rotateY(180deg);
    }

    .slice {
        position: relative;
        width: 600px;
        height: 900px;
        overflow: hidden;
    }

    .poster-at {
        position: absolute;
        top: 0;
        width: 1800px;
        height: 900px;
    }

    .crease {
        position: absolute;
        inset: 0;
        pointer-events: none;
    }

    .crease-0 {
        background: linear-gradient(270deg, oklch(0 0 0 / 0.2), transparent 9%);
    }

    .crease-1 {
        background:
            linear-gradient(90deg, oklch(1 0 0 / 0.35) 0 1px, oklch(0 0 0 / 0.12) 2px, transparent 6%),
            linear-gradient(270deg, oklch(1 0 0 / 0.35) 0 1px, oklch(0 0 0 / 0.12) 2px, transparent 6%);
    }

    .crease-2 {
        background: linear-gradient(90deg, oklch(0 0 0 / 0.2), transparent 9%);
    }

    .inside {
        display: flex;
        flex-direction: column;
        justify-content: center;
        width: 100%;
        height: 100%;
        padding: 60px;
        text-align: center;
        color: oklch(0.8 0.11 85);
        background:
            repeating-linear-gradient(45deg, oklch(0.8 0.11 85 / 0.06) 0 2px, transparent 2px 22px), oklch(0.15 0.01 80);
        box-shadow:
            inset 0 0 0 16px oklch(0.15 0.01 80),
            inset 0 0 0 18px oklch(0.58 0.1 75);
    }

    .inside p {
        margin: 0;
    }

    .inside-kicker,
    .inside-span {
        font-family: "Retail Demo", sans-serif;
        font-size: 18px;
        letter-spacing: 0.2em;
        text-transform: uppercase;
    }

    .inside-kicker {
        font-weight: 700;
    }

    .inside-title {
        margin: 26px 0 !important;
        font-family: "Valve Oracle", serif;
        font-size: 92px;
        font-style: italic;
        font-weight: 600;
        line-height: 1;
        overflow-wrap: anywhere;
        color: oklch(0.95 0.02 88);
    }

    .room :global(.unfold) {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        cursor: pointer;
    }

    .room :global(.fold-up) {
        position: absolute;
        top: 12px;
        right: 12px;
    }

    .scraps {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
    }

    .dim {
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: radial-gradient(at 50% 45%, oklch(0 0 0 / 0.5), oklch(0 0 0 / 0.9));
    }

    .flash {
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: radial-gradient(
            circle at 28% 16%,
            oklch(1 0 0) 0%,
            oklch(0.99 0.02 95 / 0.96) 28%,
            oklch(0.97 0.03 90 / 0.75) 70%
        );
    }

    .bulb {
        position: absolute;
        top: 16%;
        left: 28%;
        width: 420px;
        height: 420px;
        pointer-events: none;
        mix-blend-mode: screen;
        background:
            linear-gradient(90deg, transparent 0 49.4%, oklch(1 0 0) 49.4% 50.6%, transparent 50.6%),
            linear-gradient(0deg, transparent 0 49.4%, oklch(1 0 0) 49.4% 50.6%, transparent 50.6%),
            radial-gradient(circle, oklch(1 0 0) 0 8%, oklch(1 0.03 95 / 0.6) 16%, transparent 40%);
        mask-image: radial-gradient(circle, #000 12%, transparent 62%);
    }
</style>
