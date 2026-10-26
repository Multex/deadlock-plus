<script lang="ts">
    import { tick, untrack } from "svelte";
    import { FoldVertical } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import { focusLost } from "../../room";
    import type { EditionObjectProps } from "../types";
    import { FOLD_MS, foldAnnouncement, foldFrame, foldKey, foldRequest, type Fold, type FoldAction } from "./fold";
    import { CLOSED, flapAngles, foldFit, frameAt, OPEN, PANEL, REVEAL, scrapFade, type FoldFrame } from "./reveal";
    import { drawScraps, makeScraps } from "./scraps";
    import { useYearEnd } from "./year-end-data.svelte";
    import YearEndCover from "./year-end-cover.svelte";
    import YearEndPoster from "./year-end-poster.svelte";

    const HOVER_PEEK = 14;
    const SCRAP_COUNT = 150;

    let { edition, view, stage, reveal, onrevealed, onexpand }: EditionObjectProps = $props();

    const data = useYearEnd(
        () => edition,
        () => view,
    );

    let fold = $state<Fold>("closed");
    let clock = $state(0);
    let foldClock = $state(0);
    let foldFrom = $state.raw<FoldFrame>(OPEN);
    /** The user has folded the poster up at least once, so the folded copy is worth announcing. */
    let folded = $state(false);
    let hover = $state(false);
    let back = $state<HTMLCanvasElement | null>(null);
    let front = $state<HTMLCanvasElement | null>(null);
    let rootEl = $state<HTMLElement | null>(null);
    let raf = 0;
    let played = false;
    let expanded = false;

    const frame = $derived(
        fold === "closed"
            ? CLOSED
            : fold === "open"
              ? OPEN
              : fold === "folding"
                ? foldFrame(foldClock, foldFrom)
                : frameAt(clock),
    );
    const fit = $derived(foldFit(frame, stage));
    const angles = $derived(flapAngles(frame, fold === "closed" && hover ? HOVER_PEEK : 0));
    const scraps = $derived(makeScraps(SCRAP_COUNT, edition.volume * 31 + edition.stats.matches));
    const announcement = $derived(foldAnnouncement(fold, folded));
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

    /**
     * The open poster is three panels wide: the page gives it the whole room. Asked for as the unfold starts, so the
     * rack slides away while the cover swings.
     */
    function expand(next: boolean) {
        if (expanded === next) return;
        expanded = next;
        onexpand?.(next);
    }

    const focusInside = () => rootEl?.contains(document.activeElement) ?? false;

    /** Unfold and Fold up swap places as the poster moves: keep focus on whichever is on show. */
    async function keepFocus(inside: boolean) {
        await tick();
        const active = document.activeElement;
        if (inside && (focusLost(active, document.body) || !rootEl?.contains(active)))
            rootEl?.querySelector<HTMLElement>("[data-object-focus]")?.focus({ preventScroll: true });
    }

    function opened() {
        cancelAnimationFrame(raf);
        fold = "open";
        onrevealed?.();
    }

    function play() {
        const inside = focusInside();
        cancelAnimationFrame(raf);
        hover = false;
        expand(true);
        if (reducedMotion()) {
            opened();
            void keepFocus(inside);
            return;
        }
        clock = 0;
        fold = "unfolding";
        const start = performance.now();
        const step = (now: number) => {
            clock = now - start;
            if (clock >= REVEAL.end) opened();
            else raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        void keepFocus(inside);
    }

    function foldUp() {
        const inside = focusInside();
        foldFrom = frame;
        cancelAnimationFrame(raf);
        folded = true;
        expand(false);
        const shut = () => {
            fold = "closed";
            void keepFocus(focusInside() || inside);
        };
        if (reducedMotion()) return shut();
        foldClock = 0;
        fold = "folding";
        const start = performance.now();
        const step = (now: number) => {
            foldClock = now - start;
            if (foldClock >= FOLD_MS) shut();
            else raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
    }

    function act(action: FoldAction) {
        const next = foldRequest(fold, action);
        if (next === "unfolding") play();
        else if (next === "folding") foldUp();
    }

    function onkeydown(e: KeyboardEvent) {
        if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
        // A focused button answers Enter and Space itself.
        if ((e.key === "Enter" || e.key === " ") && e.target instanceof HTMLButtonElement) return;
        const action = foldKey(e, fold);
        if (!action) return;
        e.preventDefault();
        // Escape folds the poster only; the room must not also take it as "back to the table".
        if (e.key === "Escape") e.stopPropagation();
        if (action !== "swallow") act(action);
    }

    $effect(() => {
        void edition.id;
        untrack(() => {
            played = false;
            folded = false;
            cancelAnimationFrame(raf);
            fold = "closed";
            expand(false);
        });
    });

    $effect(() => {
        if (reveal && !played) {
            played = true;
            untrack(play);
        }
    });

    $effect(() => () => {
        cancelAnimationFrame(raf);
        expand(false);
    });

    $effect(() => {
        const t = (clock - REVEAL.burstAt) / 1000;
        const showing = fold === "unfolding" && t > 0;
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

<div
    class="room"
    bind:this={rootEl}
    style="width: {stage.width}px; height: {stage.height}px;"
    data-year-end={fold}
    {onkeydown}
    role="presentation"
>
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
                data-object-focus
                onpointerenter={() => (hover = true)}
                onpointerleave={() => (hover = false)}
                onclick={() => act("unfold")}
            />
        {:else}
            <div class="pill" class:leaving={fold === "folding"} data-fold-bar>
                <Button variant="ghost" size="sm" data-object-focus onclick={() => act("fold")}>
                    <FoldVertical aria-hidden="true" />
                    {t("dispatch.year_end.fold_up")}
                </Button>
            </div>
        {/if}
    {/if}
    <span class="sr-only" aria-live="polite">{announcement ? t(announcement) : ""}</span>

    {#if fold === "unfolding"}
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

    /* Its own backing, so Fold up reads the same over every theme's backdrop and decor. */
    .pill {
        position: absolute;
        top: 12px;
        right: 12px;
        z-index: 2;
        display: flex;
        padding: 3px;
        border: 1px solid var(--border);
        border-radius: 10px;
        color: var(--popover-foreground);
        background: var(--popover);
        box-shadow: 0 6px 18px -6px rgb(0 0 0 / 0.45);
        transition: opacity 150ms;
    }

    /*
     * The room gives back its top strip as the fold starts, which lifts the pill under the room's own corner
     * buttons: it fades out instead. It stays in the tree so a focused Fold up keeps focus until Unfold returns.
     */
    .pill.leaving {
        opacity: 0;
        pointer-events: none;
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
