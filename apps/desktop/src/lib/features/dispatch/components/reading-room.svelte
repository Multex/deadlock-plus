<script lang="ts">
    import { prefersReducedMotion } from "$lib/core/reduced-motion";
    import { tick, untrack, type Snippet } from "svelte";
    import type { Edition } from "@deadlock-plus/stats/dispatch/types";
    import type { EditionView } from "../edition-view";
    import { focusLost } from "../room";
    import EditionObject from "./edition-object.svelte";

    let {
        edition,
        view,
        from = null,
        reveal = false,
        replays = 0,
        onrevealed,
        lead,
        actions,
        status,
    }: {
        /** `null` while the copy is still being read: `status` shows in its place. */
        edition: Edition | null;
        view: EditionView | null;
        /** Where the copy was picked up: the object grows out of that rect. */
        from?: DOMRect | null;
        /** First view of an issued edition: the kind's own arrival plays instead of the pickup. */
        reveal?: boolean;
        /** Bumped to play the arrival again. */
        replays?: number;
        onrevealed?: () => void;
        lead: Snippet;
        actions?: Snippet;
        status?: Snippet;
    } = $props();

    /** The strip an opened spread leaves free at the top for the room's buttons. */
    const BAR = 52;
    const PICKUP_MS = 520;

    let w = $state(0);
    let h = $state(0);
    let expanded = $state(false);
    let stageEl = $state<HTMLElement | null>(null);
    let leadEl = $state<HTMLElement | null>(null);

    let leadHeight = $state(0);
    let leadTop = $state(12);
    // A theme's corner frame can push the buttons down, and the free strip grows with them.
    const bar = $derived(Math.max(BAR, leadTop + leadHeight + 8));
    const top = $derived(expanded ? bar : 0);
    const stage = $derived({ width: w, height: h - top });

    const reduced = () => prefersReducedMotion();

    const frame = () => new Promise((r) => requestAnimationFrame(r));

    /** The object as drawn, whatever its kind and state. */
    function objectBox(): DOMRect | null {
        if (!stageEl) return null;
        const root = stageEl;
        const pick = (sel: string) =>
            [...root.querySelectorAll<HTMLElement>(sel)]
                .filter((el) => !el.closest("[inert]") && getComputedStyle(el).visibility !== "hidden")
                .map((el) => el.getBoundingClientRect())
                .filter((r) => r.width > 1 && r.height > 1);
        for (const sel of [
            "[data-weekly]",
            "[data-kind=collectors] .obj",
            "[data-year-end] .panel, [data-year-end] .flap",
            ".object .face, .object .slot",
        ]) {
            const rects = pick(sel);
            if (rects.length === 0) continue;
            const l = Math.min(...rects.map((r) => r.left));
            const t = Math.min(...rects.map((r) => r.top));
            const r = Math.max(...rects.map((r) => r.right));
            const b = Math.max(...rects.map((r) => r.bottom));
            return new DOMRect(l, t, r - l, b - t);
        }
        return null;
    }

    /** The object's own focus target or first control, else the way back to the table. */
    function control(): HTMLElement | null {
        const target = stageEl?.querySelector<HTMLElement>("[data-object-focus]");
        if (target && !target.closest("[inert]")) return target;
        const own = [...(stageEl?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? [])].find(
            (b) =>
                !b.closest("[inert]") && b.getClientRects().length > 0 && getComputedStyle(b).visibility !== "hidden",
        );
        return own ?? leadEl?.querySelector<HTMLElement>("button") ?? null;
    }

    function pickup(rect: DOMRect, box: DOMRect) {
        if (!stageEl || reduced()) return;
        const s = rect.height / box.height;
        const dx = rect.left + rect.width / 2 - (box.left + box.width / 2);
        const dy = rect.top + rect.height / 2 - (box.top + box.height / 2);
        const sr = stageEl.getBoundingClientRect();
        const origin = `${box.left + box.width / 2 - sr.left}px ${box.top + box.height / 2 - sr.top}px`;
        stageEl.animate(
            [
                { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(-3deg)`, transformOrigin: origin },
                {
                    transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 30}px) scale(${s + (1 - s) * 0.7}) rotate(1deg)`,
                    transformOrigin: origin,
                    offset: 0.6,
                },
                { transform: "none", transformOrigin: origin },
            ],
            { duration: PICKUP_MS, easing: "cubic-bezier(.2,.75,.25,1)" },
        );
    }

    /** Lifts the copy out of the table once the object is drawn, then hands it focus. */
    async function arrive(rect: DOMRect | null, lift: boolean) {
        await tick();
        let box: DOMRect | null = null;
        for (let i = 0; i < 40 && !box; i++) {
            await frame();
            box = objectBox();
        }
        if (rect && box && lift) pickup(rect, box);
        control()?.focus({ preventScroll: true });
    }

    const sized = $derived(w > 0);

    $effect(() => {
        void leadHeight;
        if (leadEl) leadTop = parseFloat(getComputedStyle(leadEl).top) || 12;
    });
    const id = $derived(edition?.id ?? null);

    $effect(() => {
        if (!sized) return;
        if (id === null) {
            untrack(() => leadEl?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true }));
            return;
        }
        void replays;
        untrack(() => {
            expanded = false;
            void arrive(from, !reveal);
        });
    });

    /** A kind swaps its open and close controls as it expands; focus would otherwise drop to the page body. */
    async function onexpand(next: boolean) {
        expanded = next;
        await tick();
        await frame();
        if (focusLost(document.activeElement, document.body)) control()?.focus({ preventScroll: true });
    }
</script>

<div class="room" bind:clientWidth={w} bind:clientHeight={h} data-room data-expanded={expanded}>
    <div
        class="stage"
        bind:this={stageEl}
        style="top: {top}px; width: {stage.width}px; height: {stage.height}px;"
        data-stage
    >
        {#if edition && view && w > 0 && stage.height > 0}
            {#key `${edition.id}#${replays}`}
                <EditionObject {edition} {view} {stage} {reveal} {onrevealed} {onexpand} />
            {/key}
        {:else if status}
            {@render status()}
        {/if}
    </div>
    <div class="corner left" bind:this={leadEl} bind:clientHeight={leadHeight} data-room-controls>{@render lead()}</div>
    {#if actions}<div class="corner right" data-room-controls>{@render actions()}</div>{/if}
</div>

<style>
    .room {
        position: absolute;
        inset: 0;
        overflow: hidden;
    }

    .stage {
        position: absolute;
        left: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        transition: top 200ms;
    }

    .corner {
        position: absolute;
        top: var(--decor-frame-y, 12px);
        z-index: 20;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .corner.left {
        left: var(--decor-frame-x, 16px);
    }

    .corner.right {
        right: var(--decor-frame-x, 16px);
    }
</style>
