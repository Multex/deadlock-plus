<script lang="ts">
    import { prefersReducedMotion } from "$lib/core/reduced-motion";
    import { onMount, tick, untrack } from "svelte";
    import { ChevronLeft, ChevronRight, X } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import type { RankTier } from "@deadlock-plus/stats/rank";
    import { loadHeroes, onHeroesRefreshed, type Hero } from "$lib/features/heroes/heroes";
    import { loadApiRanks } from "$lib/features/ranks/ranks";
    import { focusLost } from "../../room";
    import type { EditionObjectProps } from "../types";
    import { coverArt, type CoverArt } from "./art";
    import Book from "./book.svelte";
    import { magazineDeps } from "./deps";
    import { BAR, BOOK, bookLayout, PAGE } from "./layout";
    import { buildMagazine } from "./magazine";
    import {
        CLOSED,
        LAST_SPREAD,
        hoverEdge,
        keyAction,
        leafTargets,
        leftStack,
        pointerAction,
        request,
        settle,
        shown,
        spreadPages,
        type ReaderAction,
        type ReaderState,
    } from "./reader";
    import { ARRIVE_END, TURN_MS, arrival, easeInOut, turnAngles } from "./timeline";

    let { edition, view, stage, reveal, onrevealed, onexpand }: EditionObjectProps = $props();

    let heroes = $state.raw<Record<number, Hero>>({});
    let ranks = $state.raw<RankTier[]>([]);
    let art = $state.raw<CoverArt>({ card: null, backdrop: null });
    let artReady = $state(false);
    let clock = $state(ARRIVE_END);
    let p1 = $state(0);
    let p2 = $state(0);
    let reader = $state.raw<ReaderState>(CLOSED);
    let edge = $state<"next" | "prev" | null>(null);
    let objectEl = $state<HTMLElement | null>(null);
    let spotEl = $state<HTMLElement | null>(null);
    let expanded = false;

    const mag = $derived(buildMagazine(edition, view, magazineDeps(heroes, ranks)));
    const coverHeroId = $derived(mag.coverHero?.heroId ?? null);

    const reduced = () => prefersReducedMotion();

    function expand(next: boolean) {
        if (next === expanded) return;
        expanded = next;
        onexpand?.(next);
    }

    onMount(() => {
        void loadHeroes().then((h) => (heroes = h));
        void loadApiRanks().then((r) => (ranks = r));
        const off = onHeroesRefreshed((h) => (heroes = h));
        return () => {
            off();
            stopTurns();
            expand(false);
        };
    });

    $effect(() => {
        const id = coverHeroId;
        let live = true;
        artReady = false;
        if (id === null) {
            art = { card: null, backdrop: null };
            artReady = true;
            return;
        }
        void coverArt(id).then((a) => {
            if (!live) return;
            art = a;
            artReady = true;
        });
        return () => (live = false);
    });

    // A different copy picked on the table arrives closed.
    $effect(() => {
        void edition.id;
        untrack(() => {
            stopTurns();
            reader = CLOSED;
            p1 = 0;
            p2 = 0;
            edge = null;
            expand(false);
        });
    });

    // One clock per reveal; it waits for the cover art so the drop shows the finished cover.
    $effect(() => {
        if (!reveal || !artReady) return;
        if (reduced()) {
            clock = ARRIVE_END;
            untrack(() => onrevealed?.());
            return;
        }
        let start: number | null = null;
        let raf = requestAnimationFrame(function step(now) {
            start ??= now;
            clock = Math.min(ARRIVE_END, now - start);
            if (clock < ARRIVE_END) raf = requestAnimationFrame(step);
            else untrack(() => onrevealed?.());
        });
        clock = 0;
        return () => {
            cancelAnimationFrame(raf);
            clock = ARRIVE_END;
        };
    });

    let raf = 0;
    let gen = 0;
    function stopTurns() {
        cancelAnimationFrame(raf);
        gen++;
    }

    // In a flip that moves both leaves, the one on top of the pile leads by this share of the turn.
    const LAG = 0.18;

    /** Moves the leaves to `reader.turn` from wherever they are, then settles and plays any queued turn. */
    function drive() {
        const to = reader.turn;
        if (to === null) return;
        stopTurns();
        const my = gen;
        expand(to > 0);
        const { p1: t1, p2: t2 } = leafTargets(to);
        const f1 = p1;
        const f2 = p2;
        const finish = () => {
            if (my !== gen) return;
            reader = settle(reader);
            drive();
        };
        if (reduced()) {
            p1 = t1;
            p2 = t2;
            return finish();
        }
        const both = t1 !== f1 && t2 !== f2;
        const lag = both ? LAG : 0;
        const forward = t1 + t2 > f1 + f2;
        const d1 = both && !forward ? lag : 0;
        const d2 = both && forward ? lag : 0;
        const span = Math.max(Math.abs(t1 - f1), Math.abs(t2 - f2));
        const total = Math.max(260, TURN_MS * span) * (1 + lag);
        const leaf = (k: number, delay: number) => easeInOut(Math.min(1, Math.max(0, k * (1 + lag) - delay)));
        const start = performance.now();
        const step = (now: number) => {
            if (my !== gen) return;
            const k = Math.min(1, (now - start) / total);
            p1 = f1 + (t1 - f1) * leaf(k, d1);
            p2 = f2 + (t2 - f2) * leaf(k, d2);
            if (k < 1) raf = requestAnimationFrame(step);
            else finish();
        };
        raf = requestAnimationFrame(step);
    }

    async function go(action: ReaderAction) {
        if (clock < ARRIVE_END) return;
        const next = request(reader, action);
        if (next === reader) return;
        const inside = objectEl?.contains(document.activeElement) ?? false;
        // A queued step leaves the leaf in flight on its own clock.
        const retarget = next.turn !== reader.turn;
        reader = next;
        edge = null;
        if (retarget) drive();
        await tick();
        const active = document.activeElement;
        // Close goes away on the cover and Previous/Next go disabled at the ends: focus stays on the magazine.
        if (inside && (focusLost(active, document.body) || !objectEl?.contains(active) || active?.matches(":disabled")))
            spotEl?.focus({ preventScroll: true });
    }

    const spread = $derived(shown(reader));
    const isOpen = $derived(spread > 0);
    const frame = $derived(arrival(clock));
    const angles = $derived(turnAngles(frame, p1, p2));
    const o = $derived(easeInOut(Math.min(1, Math.max(0, p1))));
    // While expanded the page hands over the whole room as `stage`, so closed and open both fit the same box.
    const layout = $derived(bookLayout(stage, { left: 0, top: 0, ...stage }, o));
    const barIn = $derived(Math.min(1, Math.max(0, (clock - (ARRIVE_END - 400)) / 400)));
    const spreadLabel = $derived.by(() => {
        const pages = spreadPages(spread);
        return pages ? t("dispatch.monthly.spread.pages", pages) : t("dispatch.monthly.spread.cover");
    });

    let press: { id: number; x: number; y: number } | null = null;

    const box = () => {
        const r = spotEl?.getBoundingClientRect();
        return r ? { left: r.left, width: r.width } : null;
    };

    function onpointermove(e: PointerEvent) {
        const b = box();
        edge = b && reader.turn === null && clock >= ARRIVE_END ? hoverEdge(e.clientX, b, spread) : null;
    }
    function onpointerdown(e: PointerEvent) {
        if (e.button !== 0 || !e.isPrimary) return;
        press = { id: e.pointerId, x: e.clientX, y: e.clientY };
        spotEl?.setPointerCapture?.(e.pointerId);
    }
    function onpointerup(e: PointerEvent) {
        const p = press;
        press = null;
        const b = box();
        if (!p || p.id !== e.pointerId || !b) return;
        const action = pointerAction({ x: e.clientX, dx: e.clientX - p.x, dy: e.clientY - p.y }, b, spread);
        if (action) void go(action);
    }

    function onkeydown(e: KeyboardEvent) {
        if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
        // A focused bar button answers Enter and Space itself.
        if ((e.key === "Enter" || e.key === " ") && e.target instanceof HTMLButtonElement) return;
        const action = keyAction(e, isOpen);
        if (!action) return;
        e.preventDefault();
        // Escape here closes the magazine only; the room must not also take it as "back to the table".
        if (action === "close") e.stopPropagation();
        void go(action);
    }
</script>

<div class="object" bind:this={objectEl} {onkeydown} role="presentation">
    {#if layout.scale > 0}
        <!-- A scrollable-region pattern: the magazine is read with the keyboard, so it takes focus itself. -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div
            class="spot"
            class:turnable={edge !== null}
            bind:this={spotEl}
            data-reader
            data-object-focus
            data-spread={spread}
            role="region"
            tabindex="0"
            aria-label={mag.issueLine}
            {onpointermove}
            onpointerleave={() => (edge = null)}
            {onpointerdown}
            {onpointerup}
            onpointercancel={() => (press = null)}
            style="left: {layout.cx}px; top: {layout.cy}px; width: {BOOK.width}px; height: {PAGE.height}px; opacity: {frame.opacity}; transform: translate(-50%, -50%) translateY({frame.y}px) rotate({frame.rot +
                (layout.rot - frame.rot) * o}deg) scale({layout.scale}) translateX({layout.tx}px);"
        >
            <div class="shadow" style="left: {PAGE.width + 7}px;"></div>
            <div class="shadow" style="left: 7px; right: {PAGE.width + 7}px; opacity: {leftStack(angles.a1)};"></div>
            <div class="book">
                {#key mag}
                    <Book
                        {mag}
                        {art}
                        a1={angles.a1}
                        a2={angles.a2}
                        glare={frame.glare}
                        sticker={frame.sticker}
                        curl={edge}
                    />
                {/key}
            </div>
        </div>

        <div class="bar" style="height: {BAR}px; opacity: {barIn};" inert={barIn < 1} data-reader-bar>
            <div class="pill">
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("dispatch.monthly.prev")}
                    disabled={spread <= 0}
                    onclick={() => go("prev")}
                >
                    <ChevronLeft aria-hidden="true" />
                </Button>
                <span class="pages" aria-live="polite">{spreadLabel}</span>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("dispatch.monthly.next")}
                    disabled={spread >= LAST_SPREAD}
                    onclick={() => go("next")}
                >
                    <ChevronRight aria-hidden="true" />
                </Button>
                {#if isOpen}
                    <span class="rule" aria-hidden="true"></span>
                    <Button variant="ghost" size="sm" onclick={() => go("close")}>
                        <X aria-hidden="true" />
                        {t("dispatch.monthly.close")}
                    </Button>
                {/if}
            </div>
        </div>
    {/if}
</div>

<style>
    .object {
        position: relative;
        flex: none;
        align-self: stretch;
        width: 100%;
        height: 100%;
    }

    .spot {
        position: absolute;
        transform-origin: center;
        user-select: none;
        touch-action: pan-y;
    }

    .spot:focus {
        outline: none;
    }

    .spot:focus-visible .book {
        outline: 2px solid color-mix(in oklch, var(--ring) 70%, transparent);
        outline-offset: 10px;
        border-radius: 4px;
    }

    .spot.turnable {
        cursor: pointer;
    }

    .book {
        position: absolute;
        top: 0;
        left: 7px;
    }

    .shadow {
        position: absolute;
        top: 0;
        right: 7px;
        bottom: 0;
        box-shadow:
            0 2px 3px rgb(0 0 0 / 0.35),
            0 18px 34px -8px rgb(0 0 0 / 0.55),
            0 44px 90px -20px rgb(0 0 0 / 0.6);
    }

    .bar {
        position: absolute;
        bottom: 0;
        left: 50%;
        display: flex;
        align-items: center;
        transform: translateX(-50%);
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
