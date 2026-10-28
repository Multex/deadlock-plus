<script lang="ts">
    import type { Snippet } from "svelte";
    import { afterNextPaint } from "$lib/core/after-paint";

    /** Mounts below-the-fold content after the first paint, so the content above it shows without waiting. */
    let { children }: { children: Snippet } = $props();

    let painted = $state(false);
    $effect(() => afterNextPaint(() => (painted = true)));
</script>

{#if painted}{@render children()}{/if}
