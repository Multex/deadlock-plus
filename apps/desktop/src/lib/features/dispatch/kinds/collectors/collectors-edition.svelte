<script lang="ts">
    import { tick, untrack } from "svelte";
    import { ChevronLeft, ChevronRight, X } from "@lucide/svelte";
    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import { focusLost } from "../../room";
    import type { EditionObjectProps } from "../types";
    import { collectorsAssets } from "./assets.svelte";
    import ClimbPage from "./climb-page.svelte";
    import Cover from "./cover.svelte";
    import { CONTROLS_H, COVER, PAGE, SLEEVE, SPREAD, fitBox, insideMode, spotHeight, tearScale } from "./layout";
    import PeakPage from "./peak-page.svelte";
    import {
        AT_COVER,
        TURN_MS,
        hoverAction,
        keyAction,
        lastStop,
        pointerAction,
        request,
        settle,
        shown,
        sleeveAction,
        stopLabel,
        turnPose,
        type ReaderAction,
        type ReaderState,
        type SleevePhase,
    } from "./reader";
    import Sleeve from "./sleeve.svelte";
    import { TEAR_MS, tearFrame } from "./tear";
    import { collectorsView } from "./view";

    let { edition, stage, reveal, onrevealed, onexpand }: EditionObjectProps = $props();

    const assets = collectorsAssets();
    const v = $derived(assets.ready ? collectorsView(edition, assets.deps) : null);

    let phase = $state<SleevePhase>("open");
    let tearAt = $state(0);
    let reader = $state.raw<ReaderState>(AT_COVER);
    /** 0 to 1 through the page turn in flight. */
    let turnK = $state(0);
    let still = $state(false);
    let pointer = $state(false);
    let objectEl = $state<HTMLElement | null>(null);
    let spotEl = $state<HTMLElement | null>(null);
    let raf = 0;
    let turnRaf = 0;
    let announced = false;
    let expanded = false;

    // Read per tear and per turn as well as on arrival, so a motion setting changed while the page is open applies.
    const reducedMotion = () =>
        document.documentElement.hasAttribute("data-reduced-motion") ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const frame = $derived(phase === "tearing" ? tearFrame(tearAt) : null);
    const mode = $derived(insideMode(stage));
    const last = $derived(lastStop(mode));
    const stop = $derived(Math.min(shown(reader), last));
    const label = $derived.by(() => {
        if (phase !== "open") return "";
        const l = stopLabel(stop, mode);
        return t(l.key, l.params);
    });

    const boxOf = (s: number) => (s > 0 ? (mode === "spread" ? SPREAD : PAGE) : phase === "open" ? COVER : SLEEVE);
    const scaleOf = (s: number) =>
        s > 0 || phase === "open" ? fitBox(stage, boxOf(s)) : tearScale(stage, frame ? frame.settle : 0);

    /** The sheets on the stage: the one at rest, or both sides of a turn with the moving leaf on top. */
    const sheets = $derived.by(() => {
        const from = Math.min(reader.at, last);
        if (reader.turn === null) return [{ stop: from, angle: 0, top: false }];
        const to = Math.min(reader.turn, last);
        const pose = turnPose(turnK, to > from ? 1 : -1);
        const moving = pose.top === "from" ? from : to;
        const resting = moving === from ? to : from;
        return [
            { stop: resting, angle: 0, top: false },
            { stop: moving, angle: pose.angle, top: true },
        ];
    });
    const scale = $derived(scaleOf(stop));
    const spot = $derived(Math.max(...sheets.map((s) => spotHeight(stage, s.stop > 0 ? boxOf(s.stop) : null))));

    function expand(open: boolean) {
        if (expanded === open) return;
        expanded = open;
        onexpand?.(open);
    }

    $effect(() => () => {
        cancelAnimationFrame(turnRaf);
        if (expanded) onexpand?.(false);
    });

    function stopTear() {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
    }

    function arrived() {
        if (!reveal || announced) return;
        announced = true;
        onrevealed?.();
    }

    $effect(() => {
        void edition.id;
        const arriving = reveal;
        untrack(() => {
            stopTear();
            cancelAnimationFrame(turnRaf);
            still = reducedMotion();
            reader = AT_COVER;
            expand(false);
            announced = false;
            phase = arriving && !still ? "sealed" : "open";
            if (arriving && still) arrived();
        });
        return stopTear;
    });

    /** Swapped or disabled controls drop focus to the page body: keep it on the copy instead. */
    async function keepFocus(inside: boolean) {
        await tick();
        const active = document.activeElement;
        if (inside && (focusLost(active, document.body) || !objectEl?.contains(active) || active?.matches(":disabled")))
            spotEl?.focus({ preventScroll: true });
    }

    const focusInside = () => objectEl?.contains(document.activeElement) ?? false;

    function tear() {
        if (phase !== "sealed") return;
        const inside = focusInside();
        still = reducedMotion();
        if (still) {
            phase = "open";
            arrived();
            void keepFocus(inside);
            return;
        }
        tearAt = 0;
        phase = "tearing";
        const t0 = performance.now();
        const step = (now: number) => {
            tearAt = Math.min(TEAR_MS, Math.max(0, now - t0));
            if (tearAt < TEAR_MS) {
                raf = requestAnimationFrame(step);
                return;
            }
            raf = 0;
            phase = "open";
            arrived();
            void keepFocus(focusInside() || inside);
        };
        raf = requestAnimationFrame(step);
        void keepFocus(inside);
    }

    function reseal() {
        const inside = focusInside();
        cancelAnimationFrame(turnRaf);
        reader = AT_COVER;
        expand(false);
        phase = "sealed";
        void keepFocus(inside);
    }

    /** Plays the turn to `reader.turn`, then settles and plays any queued one. */
    function drive() {
        const to = reader.turn;
        if (to === null) return;
        cancelAnimationFrame(turnRaf);
        expand(to > 0);
        const finish = () => {
            reader = settle(reader);
            turnK = 0;
            drive();
        };
        if (reducedMotion()) return finish();
        turnK = 0;
        const t0 = performance.now();
        const step = (now: number) => {
            turnK = Math.min(1, (now - t0) / TURN_MS);
            if (turnK < 1) turnRaf = requestAnimationFrame(step);
            else finish();
        };
        turnRaf = requestAnimationFrame(step);
    }

    function go(action: ReaderAction) {
        if (phase !== "open") return;
        const next = request(
            { ...reader, at: Math.min(reader.at, last), goal: Math.min(reader.goal, last) },
            action,
            last,
        );
        if (next.goal === reader.goal && next.turn === reader.turn && next.at === reader.at) return;
        const inside = focusInside();
        const started = reader.turn === null;
        reader = next;
        pointer = false;
        if (started) drive();
        void keepFocus(inside);
    }

    let press: { id: number; x: number; y: number } | null = null;

    const spotBox = () => {
        const r = spotEl?.querySelector(".obj:not(.leaf)")?.getBoundingClientRect();
        return r ? { left: r.left, width: r.width } : null;
    };

    function onpointermove(e: PointerEvent) {
        if (phase === "sealed") return void (pointer = true);
        const b = spotBox();
        pointer = !!b && phase === "open" && reader.turn === null && hoverAction(e.clientX, b, stop, last) !== null;
    }
    function onpointerdown(e: PointerEvent) {
        if (e.button !== 0 || !e.isPrimary) return;
        press = { id: e.pointerId, x: e.clientX, y: e.clientY };
        spotEl?.setPointerCapture?.(e.pointerId);
    }
    function onpointerup(e: PointerEvent) {
        const p = press;
        press = null;
        if (!p || p.id !== e.pointerId) return;
        const moved = { x: e.clientX, dx: e.clientX - p.x, dy: e.clientY - p.y };
        if (phase === "sealed") {
            if (sleeveAction(moved)) tear();
            return;
        }
        const b = spotBox();
        const action = b && phase === "open" ? pointerAction(moved, b, stop, last) : null;
        if (action) go(action);
    }

    function onkeydown(e: KeyboardEvent) {
        if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
        // A focused button answers Enter and Space itself.
        if ((e.key === "Enter" || e.key === " ") && e.target instanceof HTMLButtonElement) return;
        const action = keyAction(e, phase, stop);
        if (!action) return;
        e.preventDefault();
        // Escape inside goes back to the cover only; the room must not also take it as "back to the table".
        if (action === "close") e.stopPropagation();
        if (action === "tear") tear();
        else go(action);
    }

    const leaf = (angle: number, w: number) =>
        angle === 0 ? "" : ` translateX(${-w / 2}px) perspective(2600px) rotateY(${angle}deg) translateX(${w / 2}px)`;
</script>

{#snippet sheet(s: number)}
    {#if v}
        {#if s > 0 && mode === "spread"}
            <div class="spread" role="group" aria-label={t("dispatch.collectors.inside_label", { season: v.season })}>
                <ClimbPage {v} />
                <PeakPage {v} />
            </div>
        {:else if s === 1}
            <ClimbPage {v} alone />
        {:else if s === 2}
            <PeakPage {v} alone />
        {:else if phase === "open"}
            <Cover {v} still={still || reader.turn !== null} />
        {:else}
            <Sleeve {frame} at={tearAt} {still} ontear={tear}>
                <Cover {v} still={still || phase === "tearing"} tilt={false} plate={frame?.plate ?? null} />
            </Sleeve>
        {/if}
    {/if}
{/snippet}

{#if v && scale > 0}
    <div
        class="object"
        bind:this={objectEl}
        {onkeydown}
        role="presentation"
        data-kind="collectors"
        data-phase={phase}
        data-stop={stop}
        data-view={stop > 0 ? `inside-${mode}` : "cover"}
    >
        <!-- A scrollable-region pattern: the copy is read with the keyboard, so it takes focus itself. -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div
            class="spot"
            class:pointer
            bind:this={spotEl}
            style="height: {spot}px;"
            data-reader
            data-object-focus
            role="region"
            tabindex="0"
            aria-label={t("dispatch.collectors.cover_label", { season: v.season, rank: v.peakName })}
            {onpointermove}
            onpointerleave={() => (pointer = false)}
            {onpointerdown}
            {onpointerup}
            onpointercancel={() => (press = null)}
        >
            {#each sheets as s (s.stop)}
                {@const box = boxOf(s.stop)}
                <div
                    class="obj"
                    class:leaf={s.top}
                    style="width: {box.width}px; height: {box.height}px; transform: translate(-50%, -50%) scale({scaleOf(
                        s.stop,
                    )}){leaf(s.angle, box.width)}; opacity: {s.angle < -80 ? Math.max(0, (100 + s.angle) / 20) : 1};"
                >
                    {@render sheet(s.stop)}
                    {#if s.top && s.angle !== 0}
                        <div class="shade" style="opacity: {Math.min(0.55, -s.angle / 160)};"></div>
                    {/if}
                </div>
            {/each}
        </div>

        <div class="controls" style="height: {CONTROLS_H}px;" data-reader-bar>
            <div class="pill">
                {#if phase !== "open"}
                    <Button variant="ghost" size="sm" onclick={tear}>{t("dispatch.collectors.tear_open")}</Button>
                {:else}
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("dispatch.collectors.previous_page")}
                        disabled={stop <= 0}
                        onclick={() => go("prev")}
                    >
                        <ChevronLeft aria-hidden="true" />
                    </Button>
                {/if}
                <span class="pages" class:sr-only={phase !== "open"} aria-live="polite">{label}</span>
                {#if phase === "open"}
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("dispatch.collectors.next_page")}
                        disabled={stop >= last}
                        onclick={() => go("next")}
                    >
                        <ChevronRight aria-hidden="true" />
                    </Button>
                    <span class="rule" aria-hidden="true"></span>
                    {#if stop > 0}
                        <Button variant="ghost" size="sm" onclick={() => go("close")}>
                            <X aria-hidden="true" />
                            {t("dispatch.collectors.back_to_cover")}
                        </Button>
                    {:else}
                        <Button variant="ghost" size="sm" onclick={reseal}>{t("dispatch.collectors.reseal")}</Button>
                    {/if}
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    .object {
        display: flex;
        flex-direction: column;
        align-self: stretch;
        justify-content: center;
        width: 100%;
        min-width: 0;
    }
    .spot {
        position: relative;
        flex: none;
        user-select: none;
        touch-action: pan-y;
    }
    .spot:focus {
        outline: none;
    }
    .spot:focus-visible .obj:not(.leaf) {
        outline: 2px solid color-mix(in oklch, var(--ring) 70%, transparent);
        outline-offset: 10px;
        border-radius: 6px;
    }
    .spot.pointer {
        cursor: pointer;
    }
    .obj {
        position: absolute;
        top: 50%;
        left: 50%;
        transform-origin: center;
    }
    .obj.leaf {
        z-index: 1;
    }
    .shade {
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: linear-gradient(90deg, #000000b3, #00000040);
        border-radius: 6px;
    }
    .spread {
        display: grid;
        grid-template-columns: 720px 720px;
        width: 1440px;
        height: 1080px;
        overflow: hidden;
        border-radius: 6px;
        box-shadow:
            0 30px 60px -20px #000000bf,
            0 10px 22px #00000073;
    }
    /* Above the turning leaf, which swings out toward the viewer. */
    .controls {
        position: relative;
        z-index: 2;
        display: flex;
        flex: none;
        align-items: flex-start;
        justify-content: center;
    }
    /* Its own backing, so the controls read the same over every theme's backdrop and decor. */
    .pill {
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 3px;
        border: 1px solid var(--border);
        border-radius: 10px;
        color: var(--popover-foreground);
        background: var(--popover);
        box-shadow: 0 6px 18px -6px rgb(0 0 0 / 0.45);
    }
    .pages {
        min-width: 96px;
        font-size: 13px;
        font-variant-numeric: tabular-nums;
        text-align: center;
        white-space: nowrap;
    }
    .rule {
        width: 1px;
        height: 20px;
        margin: 0 4px;
        background: var(--border);
    }
</style>
