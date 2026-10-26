<script lang="ts">
    import type { CardAspect } from "../edition-view";
    import { ratioOf } from "./share-sheet";

    let { aspect, size = 20 }: { aspect: CardAspect; size?: number } = $props();
    const r = $derived(ratioOf(aspect));
    const box = $derived(r >= 1 ? { w: size, h: size / r } : { w: size * r, h: size });
</script>

<span class="glyph" style="width: {box.w}px; height: {box.h}px;" aria-hidden="true"></span>

<style>
    .glyph {
        display: inline-block;
        flex: none;
        border: 2px solid currentColor;
        border-radius: 2px;
    }
</style>
