<script lang="ts">
    import type { IconPaint } from "./view";

    type Props = {
        paint: IconPaint | null;
        /** Panorama px. */
        size: number;
        /** Drawn as a dot when the art is missing; nothing when null. */
        fallback?: string | null;
    };

    let { paint, size, fallback = null }: Props = $props();
</script>

{#if paint}
    <span
        class="icon"
        class:washed={!!paint.wash}
        style:--size={size}
        style:--image={paint.image}
        style:--wash={paint.wash ?? undefined}
        aria-hidden="true"
    ></span>
{:else if fallback}
    <span class="icon fallback" style:--size={size} style:--wash={fallback} aria-hidden="true"></span>
{/if}

<style>
    .icon {
        display: inline-block;
        flex: none;
        width: calc(var(--u, 1px) * var(--size));
        height: calc(var(--u, 1px) * var(--size));
        background: var(--image) center / contain no-repeat;
        vertical-align: middle;
    }
    /* Panorama's `wash-color` multiplies the image by the colour. */
    .washed {
        background:
            var(--image) center / contain no-repeat,
            var(--wash);
        background-blend-mode: multiply;
        mask: var(--image) center / contain no-repeat;
    }
    .fallback {
        border-radius: 50%;
        background: var(--wash);
        scale: 0.5;
    }
</style>
