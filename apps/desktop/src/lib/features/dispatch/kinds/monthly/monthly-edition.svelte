<script lang="ts">
    import { onMount, tick, untrack } from "svelte";
    import { BookOpen, ChevronLeft, ChevronRight, X } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import type { RankTier } from "@deadlock-plus/stats/rank";
    import { loadHeroes, onHeroesRefreshed, type Hero } from "$lib/features/heroes/heroes";
    import { loadApiRanks } from "$lib/features/ranks/ranks";
    import type { EditionObjectProps } from "../types";
    import { coverArt, type CoverArt } from "./art";
    import Book from "./book.svelte";
    import { magazineDeps } from "./deps";
    import { BAR, BOOK, bookLayout, PAGE } from "./layout";
    import { buildMagazine } from "./magazine";
    import { ARRIVE_END, TURN_MS, arrival, easeInOut, turnAngles } from "./timeline";

    let { edition, view, stage, reveal, onrevealed, onexpand }: EditionObjectProps = $props();

    let heroes = $state.raw<Record<number, Hero>>({});
    let ranks = $state.raw<RankTier[]>([]);
    let art = $state.raw<CoverArt>({ card: null, backdrop: null });
    let artReady = $state(false);
    let clock = $state(ARRIVE_END);
    let p1 = $state(0);
    let p2 = $state(0);
    let openButton = $state<HTMLButtonElement | null>(null);
    let closeButton = $state<HTMLButtonElement | null>(null);
    let expanded = false;

    const mag = $derived(buildMagazine(edition, view, magazineDeps(heroes, ranks)));
    const coverHeroId = $derived(mag.coverHero?.heroId ?? null);

    const reduced = () =>
        document.documentElement.hasAttribute("data-reduced-motion") ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

    // A different copy picked on the rack arrives closed.
    $effect(() => {
        void edition.id;
        untrack(() => {
            stopTurns();
            p1 = 0;
            p2 = 0;
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

    const turns = new Map<string, number>();
    function stopTurns() {
        for (const raf of turns.values()) cancelAnimationFrame(raf);
        turns.clear();
    }
    function animate(name: string, set: (v: number) => void, from: number, to: number) {
        cancelAnimationFrame(turns.get(name) ?? 0);
        if (reduced()) return set(to);
        const start = performance.now();
        const step = (now: number) => {
            const k = Math.min(1, (now - start) / TURN_MS);
            set(from + (to - from) * easeInOut(k));
            if (k < 1) turns.set(name, requestAnimationFrame(step));
        };
        turns.set(name, requestAnimationFrame(step));
    }

    async function openMag() {
        expand(true);
        animate("p1", (v) => (p1 = v), p1, 1);
        await tick();
        closeButton?.focus();
    }
    async function closeMag() {
        expand(false);
        if (p2 > 0) animate("p2", (v) => (p2 = v), p2, 0);
        animate("p1", (v) => (p1 = v), p1, 0);
        await tick();
        openButton?.focus();
    }
    const nextSpread = () => (p1 < 1 ? openMag() : animate("p2", (v) => (p2 = v), p2, 1));
    const prevSpread = () => (p2 > 0 ? animate("p2", (v) => (p2 = v), p2, 0) : closeMag());

    const isOpen = $derived(p1 > 0);
    const frame = $derived(arrival(clock));
    const angles = $derived(turnAngles(frame, p1, p2));
    const o = $derived(easeInOut(Math.min(1, Math.max(0, p1))));
    // While expanded the page hands over the whole room as `stage`, so closed and open both fit the same box.
    const layout = $derived(bookLayout(stage, { left: 0, top: 0, ...stage }, o));
    const barIn = $derived(Math.min(1, Math.max(0, (clock - (ARRIVE_END - 400)) / 400)));
    const spreadLabel = $derived(
        p1 < 0.5
            ? t("dispatch.monthly.spread.cover")
            : p2 < 0.5
              ? t("dispatch.monthly.spread.pages", { from: 2, to: 3 })
              : t("dispatch.monthly.spread.pages", { from: 4, to: 5 }),
    );

    function onkeydown(e: KeyboardEvent) {
        if (!isOpen || e.defaultPrevented) return;
        if (e.key === "Escape") void closeMag();
        else if (e.key === "ArrowRight") void nextSpread();
        else if (e.key === "ArrowLeft") void prevSpread();
        else return;
        e.preventDefault();
    }
</script>

<svelte:window {onkeydown} />

<div class="object">
    {#if layout.scale > 0}
        <div
            class="spot"
            style="left: {layout.cx}px; top: {layout.cy}px; width: {BOOK.width}px; height: {PAGE.height}px; opacity: {frame.opacity}; transform: translate(-50%, -50%) translateY({frame.y}px) rotate({frame.rot +
                (layout.rot - frame.rot) * o}deg) scale({layout.scale}) translateX({layout.tx}px);"
        >
            <div class="shadow" style="left: {PAGE.width + 7}px;"></div>
            <div
                class="shadow"
                style="left: 7px; right: {PAGE.width + 7}px; opacity: {Math.min(1, Math.max(0, (p1 - 0.9) / 0.1))};"
            ></div>
            <div class="book">
                {#key mag}
                    <Book {mag} {art} a1={angles.a1} a2={angles.a2} glare={frame.glare} sticker={frame.sticker} />
                {/key}
            </div>
        </div>

        <div class="bar" style="height: {BAR}px; opacity: {barIn};" inert={barIn < 1}>
            {#if isOpen}
                <Button variant="outline" size="sm" bind:ref={closeButton} onclick={closeMag}>
                    <X aria-hidden="true" />
                    {t("dispatch.monthly.close")}
                </Button>
                <Button variant="outline" size="icon" aria-label={t("dispatch.monthly.prev")} onclick={prevSpread}>
                    <ChevronLeft aria-hidden="true" />
                </Button>
                <span class="pages" aria-live="polite">{spreadLabel}</span>
                <Button
                    variant="outline"
                    size="icon"
                    aria-label={t("dispatch.monthly.next")}
                    disabled={p2 >= 1}
                    onclick={nextSpread}
                >
                    <ChevronRight aria-hidden="true" />
                </Button>
            {:else}
                <Button variant="outline" size="sm" bind:ref={openButton} onclick={openMag}>
                    <BookOpen aria-hidden="true" />
                    {t("dispatch.monthly.open")}
                </Button>
            {/if}
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
        gap: 10px;
        transform: translateX(-50%);
    }

    .pages {
        min-width: 90px;
        color: var(--muted-foreground);
        font-size: 13px;
        text-align: center;
        white-space: nowrap;
    }
</style>
