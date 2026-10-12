<script lang="ts">
    import type { Snippet } from "svelte";
    import { tipPlacement, type Size } from "../../../deep-dive/chart";

    let { anchor, area, children }: { anchor: { x: number; y: number }; area: Size; children: Snippet } = $props();

    const OFFSET_PX = 14;

    let width = $state(0);
    let height = $state(0);

    const measured = $derived(width > 0 && height > 0);
    const at = $derived(tipPlacement(anchor, { width, height }, area, OFFSET_PX));
</script>

<div
    bind:offsetWidth={width}
    bind:offsetHeight={height}
    class="pointer-events-none absolute left-0 top-0 z-30 w-max rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md will-change-transform"
    style:transform="translate({Math.round(at.left)}px, {Math.round(at.top)}px)"
    style:visibility={measured ? "visible" : "hidden"}
    role="status"
    data-export-ignore
>
    {@render children()}
</div>
