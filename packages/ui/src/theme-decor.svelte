<script lang="ts">
    import type { Component } from "svelte";
    import { decorLoader } from "./theme-decor";

    /** `layers` says which of the theme's effect layers are on; a layer it leaves out is on. */
    let { theme, layers = {} }: { theme: string; layers?: Record<string, boolean> } = $props();

    // Lazy, so only the theme in use ships its art to the page.
    const modules = import.meta.glob<{ default: Component<{ layers: Record<string, boolean> }> }>(
        "./themes/*/decor.svelte",
    );
    const load = $derived(decorLoader(modules, theme));
</script>

<div class="theme-decor" aria-hidden="true">
    {#if load}
        {#await load() then decor}
            <decor.default {layers} />
        {/await}
    {/if}
</div>

<style>
    .theme-decor {
        position: absolute;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
        contain: strict;
    }
</style>
