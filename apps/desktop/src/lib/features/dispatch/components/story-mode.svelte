<script lang="ts">
    import { onMount } from "svelte";
    import { cubicOut } from "svelte/easing";
    import type { TransitionConfig } from "svelte/transition";
    import { Portal } from "bits-ui";
    import { X } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import IconButton from "@deadlock-plus/ui/icon-button.svelte";
    import { CARD_SIZES, sectionsFor, type EditionView } from "../edition-view";
    import { cardScale, clampCard, keyAction, stepCard, trapFocus, type StoryStep } from "../story-nav";
    import SectionCard from "./section-card.svelte";

    let { view, onclose }: { view: EditionView; onclose: () => void } = $props();

    const CARD = CARD_SIZES["9:16"];
    /** Room for the progress ticks above the card and a gap below it. */
    const MARGIN = 36;
    const SLIDE_PX = 40;
    const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

    let dialog = $state<HTMLElement | null>(null);
    let stageW = $state(0);
    let stageH = $state(0);
    let index = $state(0);
    let direction = $state<1 | -1>(1);

    const sections = $derived(sectionsFor(view));
    const at = $derived(clampCard(index, sections.length));
    const section = $derived(sections[at]);
    const scale = $derived(cardScale(stageW, stageH, CARD.width, CARD.height, MARGIN));

    // Read per transition, so a motion setting changed while open applies to the next card.
    const reducedMotion = () =>
        document.documentElement.hasAttribute("data-reduced-motion") ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function enter(_node: Element): TransitionConfig {
        if (reducedMotion()) return { duration: 0 };
        const from = direction * SLIDE_PX;
        return {
            duration: 220,
            easing: cubicOut,
            css: (p, u) => `opacity: ${p}; transform: translateX(${u * from}px);`,
        };
    }

    function leave(_node: Element): TransitionConfig {
        if (reducedMotion()) return { duration: 0 };
        const to = -direction * SLIDE_PX;
        return { duration: 160, css: (p, u) => `opacity: ${p}; transform: translateX(${u * to}px);` };
    }

    function go(step: StoryStep) {
        const next = stepCard(at, sections.length, step);
        if (next === at) return;
        direction = step === "next" ? 1 : -1;
        index = next;
    }

    function onkeydown(e: KeyboardEvent) {
        if (!dialog) return;
        if (e.key === "Tab") {
            const focusables = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
            const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            const target = trapFocus(active ? focusables.indexOf(active) : -1, focusables.length, e.shiftKey);
            if (target === null) return;
            e.preventDefault();
            (focusables[target] ?? dialog).focus();
            return;
        }
        const onControl = document.activeElement instanceof HTMLButtonElement;
        const action = keyAction(e.key, onControl);
        if (action === null) return;
        e.preventDefault();
        if (action === "close") onclose();
        else go(action);
    }

    onMount(() => {
        const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialog?.focus();
        return () => returnTo?.focus();
    });
</script>

<svelte:window {onkeydown} />

<Portal>
    <div bind:this={dialog} class="story" role="dialog" aria-modal="true" aria-label={view.label} tabindex="-1">
        <div class="ticks" aria-hidden="true" style="width: {CARD.width * scale}px;">
            {#each sections as id, i (id)}
                <span class="tick" class:done={i <= at}></span>
            {/each}
        </div>
        <p class="sr-only" aria-live="polite">
            {t("dispatch.story_mode.position", { current: at + 1, total: sections.length })}
        </p>

        <div class="stage" bind:clientWidth={stageW} bind:clientHeight={stageH}>
            {#if section && scale > 0}
                <div class="slot" style="width: {CARD.width * scale}px; height: {CARD.height * scale}px;">
                    {#key section}
                        <div class="frame" in:enter out:leave>
                            <div class="sheet" style="transform: scale({scale});">
                                <SectionCard {view} {section} aspect="9:16" />
                            </div>
                        </div>
                    {/key}
                </div>
            {/if}
            <button
                type="button"
                class="half prev"
                aria-label={t("dispatch.story_mode.previous")}
                aria-disabled={at === 0}
                onclick={() => go("prev")}
            ></button>
            <button
                type="button"
                class="half next"
                aria-label={t("dispatch.story_mode.next")}
                aria-disabled={at === sections.length - 1}
                onclick={() => go("next")}
            ></button>
        </div>

        <IconButton
            class="absolute right-3 top-2 text-white/90 hover:bg-white/10 hover:text-white"
            label={t("dispatch.story_mode.close")}
            onclick={onclose}
        >
            <X />
        </IconButton>
    </div>
</Portal>

<style>
    /* Leaves the 40px title bar uncovered so the window can still be dragged. */
    .story {
        position: fixed;
        inset: 40px 0 0 0;
        z-index: var(--z-popover);
        display: flex;
        flex-direction: column;
        align-items: center;
        background: color-mix(in oklch, var(--background) 30%, rgb(0 0 0 / 0.88));
        outline: none;
        animation: fade 180ms ease-out both;
    }

    .ticks {
        display: flex;
        gap: 4px;
        flex: none;
        min-width: 120px;
        margin-top: 14px;
    }

    .tick {
        flex: 1;
        height: 3px;
        border-radius: 2px;
        background: rgb(255 255 255 / 0.28);
        transition: background-color 180ms ease-out;
    }

    .tick.done {
        background: rgb(255 255 255 / 0.92);
    }

    .stage {
        position: relative;
        display: flex;
        flex: 1;
        align-items: center;
        justify-content: center;
        align-self: stretch;
        min-height: 0;
    }

    .slot {
        position: relative;
        display: grid;
        flex: none;
    }

    /* Leaving and entering cards share one cell so they cross over instead of stacking. */
    .frame {
        grid-area: 1 / 1;
    }

    .sheet {
        transform-origin: 0 0;
        box-shadow: 0 18px 50px rgb(0 0 0 / 0.55);
    }

    .half {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 50%;
        background: transparent;
        cursor: pointer;
        outline: none;
    }

    .half.prev {
        left: 0;
    }

    .half.next {
        right: 0;
    }

    .half[aria-disabled="true"] {
        cursor: default;
    }

    .half:focus-visible {
        box-shadow: inset 0 0 0 2px var(--ring);
    }

    @keyframes fade {
        from {
            opacity: 0;
        }
    }
</style>
