<script lang="ts">
    import type { Snippet } from "svelte";
    import { PAPER_STYLE } from "./tokens";

    let {
        width = 720,
        height = 960,
        angle = 1.6,
        label,
        class: className = "",
        children,
    }: {
        width?: number;
        height?: number;
        /** Degrees; pass 0 for an image export. */
        angle?: number;
        label?: string;
        class?: string;
        children?: Snippet;
    } = $props();

    const id = $props.id();
    const grain = `${id}-grain`;
</script>

<article
    class="paper {className}"
    aria-label={label}
    style="{PAPER_STYLE}; width: {width}px; height: {height}px; transform: rotate({angle}deg);"
>
    <svg class="grain" aria-hidden="true">
        <filter id={grain}>
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix values="0 0 0 0 0.32 0 0 0 0 0.26 0 0 0 0 0.17 0 0 0 0.13 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#{grain})" />
    </svg>
    <div class="content">
        {@render children?.()}
    </div>
    <div class="fold" aria-hidden="true"></div>
</article>

<style>
    .paper {
        position: relative;
        flex: none;
        overflow: hidden;
        color: var(--fp-ink);
        font-family: "Radiance", sans-serif;
        font-size: 14px;
        line-height: 1.3;
        text-align: left;
        background-color: var(--fp-paper);
        background-image:
            radial-gradient(ellipse at 50% 40%, transparent 55%, var(--fp-paper-edge) 130%),
            linear-gradient(100deg, rgb(255 255 255 / 0.18), transparent 40%, rgb(120 90 40 / 0.06));
        box-shadow:
            inset 0 0 0 1px rgb(120 95 55 / 0.25),
            0 1px 2px rgb(0 0 0 / 0.35),
            0 14px 28px -6px rgb(0 0 0 / 0.5),
            0 38px 80px -18px rgb(0 0 0 / 0.6);
    }

    .grain {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
    }

    .content {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        padding: 20px 26px 14px;
    }

    .fold {
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: linear-gradient(
            to bottom,
            rgb(255 255 255 / 0.1) 0%,
            transparent 48.6%,
            rgb(70 50 20 / 0.12) 49.9%,
            rgb(255 255 255 / 0.32) 50.1%,
            transparent 51.6%,
            rgb(60 45 20 / 0.05) 100%
        );
        mix-blend-mode: multiply;
    }
</style>
