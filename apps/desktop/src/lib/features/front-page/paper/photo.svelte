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

    let loaded = $state(false);

    function watch(img: HTMLImageElement) {
        const done = () => (loaded = img.complete && img.naturalWidth > 0);
        done();
        img.addEventListener("load", done);
        img.addEventListener("error", done);
        return () => {
            img.removeEventListener("load", done);
            img.removeEventListener("error", done);
        };
    }
</script>

<figure class="photo">
    <div class="frame" class:blank={!loaded} style="height: {height}px;">
        <div class="halftone" style="--dot: {dot}px;" role="img" aria-label={alt}>
            {#if src}
                {#key src}
                    <img {src} alt="" style="object-position: {position};" {@attach watch} />
                {/key}
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
        transition: opacity 220ms ease-out;
    }

    .halftone img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        filter: blur(0.7px) brightness(1.12) contrast(1.15);
    }

    /* The contrast filter snaps any soft tone to white, so the plate shown until the picture is drawn sits on the
       frame and the halftone stays hidden over it, fading in once the picture loads. */
    .frame.blank {
        background:
            repeating-linear-gradient(
                -45deg,
                color-mix(in oklab, var(--fp-ink) 9%, transparent) 0 1px,
                transparent 1px 7px
            ),
            color-mix(in oklab, var(--fp-ink) 7%, transparent);
    }

    .frame.blank .halftone {
        opacity: 0;
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
