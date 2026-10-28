<script lang="ts">
    import { onMount, type Component } from "svelte";
    import { THEMES, WIDE_QUERY } from "$lib/content/themes";
    import { themeState } from "$lib/content/theme-state.svelte";
    import { mirrorReducedMotion, whenIdle } from "./theme-backdrop";

    type Decor = Component<{ theme: string; layers?: Record<string, boolean> }>;

    let idle = $state(false);
    let Decor = $state<Decor | null>(null);

    const on = $derived(idle && themeState.effects && !!THEMES.find((t) => t.id === themeState.theme)?.effects);

    onMount(() => {
        themeState.load();
        const wide = window.matchMedia(WIDE_QUERY);
        const syncWide = () => (themeState.wide = wide.matches);
        syncWide();
        wide.addEventListener("change", syncWide);
        const stopMotion = mirrorReducedMotion(
            document.documentElement,
            window.matchMedia("(prefers-reduced-motion: reduce)"),
        );
        const cancelIdle = whenIdle(window, () => (idle = true));
        return () => {
            wide.removeEventListener("change", syncWide);
            stopMotion();
            cancelIdle();
        };
    });

    // Fetched only once a theme with decor is on, so a visitor who never sees effects never downloads them.
    $effect(() => {
        if (!on || Decor) return;
        import("@deadlock-plus/ui/theme-decor.svelte").then((module) => (Decor = module.default));
    });
</script>

<div class="theme-backdrop noir-panel" aria-hidden="true">
    {#if on && Decor}
        <Decor theme={themeState.theme} />
        <div class="scrim"></div>
    {/if}
</div>

<style>
    /* Sized to the large viewport, so a phone's address bar sliding away does not resize the scene. */
    .theme-backdrop {
        position: fixed;
        inset: 0 0 auto;
        height: 100lvh;
        z-index: -1;
        pointer-events: none;
    }

    /* Keeps body text readable over rain, snow and stars without hiding the scene at the edges. */
    .scrim {
        position: absolute;
        inset: 0;
        background: linear-gradient(
            90deg,
            transparent,
            color-mix(in oklch, var(--background) 45%, transparent) 25% 75%,
            transparent
        );
    }
</style>
