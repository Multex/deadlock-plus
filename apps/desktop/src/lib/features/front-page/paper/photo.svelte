<script lang="ts">
    import type { Snippet } from "svelte";

    let {
        src,
        alt,
        caption,
        height = 250,
        dot = 6,
        position = "50% 20%",
        children,
    }: {
        src: string | null;
        alt: string;
        caption?: string;
        height?: number;
        /** Halftone cell size in px. */
        dot?: number;
        /** `object-position` of the picture in its frame. */
        position?: string;
        /** Laid over the top-right corner, e.g. a `Stamp`. */
        children?: Snippet;
    } = $props();
</script>

<figure class="photo">
    <div class="frame" style="height: {height}px;">
        <div class="halftone" style="--dot: {dot}px;" role="img" aria-label={alt}>
            {#if src}
                <img {src} alt="" style="object-position: {position};" />
            {/if}
        </div>
    </div>
    {#if children}
        <div class="corner">{@render children()}</div>
    {/if}
    {#if caption}
        <figcaption>{caption}</figcaption>
    {/if}
</figure>

<style>
    .photo {
        position: relative;
        margin: 0;
        min-width: 0;
    }

    .frame {
        border: 2px solid var(--fp-ink);
    }

    /* Grey dots multiplied over a blurred greyscale picture, then a hard contrast turns them into ink dots sized by
       how dark the picture is; multiply drops the white onto the paper. */
    .halftone {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #fff;
        filter: grayscale(1) contrast(12);
        mix-blend-mode: multiply;
    }

    .halftone img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        filter: blur(0.7px) brightness(1.12) contrast(1.15);
    }

    .halftone::after {
        content: "";
        position: absolute;
        inset: -50%;
        background: radial-gradient(closest-side, #5e5e5e, #fff) 0 0 / var(--dot) var(--dot);
        mix-blend-mode: multiply;
        transform: rotate(45deg);
    }

    .corner {
        position: absolute;
        right: -12px;
        top: -10px;
        z-index: 1;
    }

    figcaption {
        margin-top: 3px;
        color: var(--fp-ink-soft);
        font-size: 11px;
        font-style: italic;
    }
</style>
