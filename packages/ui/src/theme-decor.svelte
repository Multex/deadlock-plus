<script lang="ts">
    import type { Component } from "svelte";
    import { decorLoader } from "./theme-decor";

    let { theme }: { theme: string } = $props();

    // Lazy, so only the theme in use ships its art to the page.
    const modules = import.meta.glob<{ default: Component }>("./themes/*/decor.svelte");
    const load = $derived(decorLoader(modules, theme));
</script>

<div class="theme-decor" aria-hidden="true">
    {#if load}
        {#await load() then decor}
            <decor.default />
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
