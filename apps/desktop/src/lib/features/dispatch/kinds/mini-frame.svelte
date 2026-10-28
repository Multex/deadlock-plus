<script lang="ts">
    import type { Snippet } from "svelte";
    import { i18n, t } from "$lib/core/i18n.svelte";
    import { PAPER_STYLE } from "$lib/features/front-page/paper/tokens";
    import { MINI_SIZE, type MiniCopy } from "./minis";

    let {
        copy,
        height,
        children,
    }: {
        copy: MiniCopy;
        /** Drawn height in px. */
        height: number;
        children: Snippet;
    } = $props();

    const base = $derived(MINI_SIZE[copy.kind]);
    const scale = $derived(height / base.h);
</script>

<span
    class="mini"
    class:faded={copy.state === "too_few"}
    style="width: {base.w * scale}px; height: {base.h * scale}px; {PAPER_STYLE};"
    data-mini={copy.kind}
    data-status={copy.state}
>
    <span class="face" style="width: {base.w}px; height: {base.h}px; transform: scale({scale});">
        {@render children()}
        {#if copy.isNew}<span class="new">{t("dispatch.shelf.new").toLocaleUpperCase(i18n.locale)}</span>{/if}
    </span>
</span>

<style>
    .mini {
        position: relative;
        display: block;
        flex: none;
    }

    /* Opaque, so a faded copy never shows the one packed under it. */
    .mini.faded {
        filter: grayscale(0.85) brightness(0.55) contrast(0.9);
    }

    .face {
        position: absolute;
        top: 0;
        left: 0;
        display: block;
        transform-origin: 0 0;
    }

    .new {
        position: absolute;
        top: -8px;
        right: -8px;
        z-index: 3;
        padding: 3px 10px;
        border-radius: 999px;
        background: var(--brass, #c9a347);
        color: #1b1408;
        font-family: "Retail Demo", sans-serif;
        font-weight: 700;
        font-size: 18px;
        line-height: 1.2;
        letter-spacing: 0.06em;
        box-shadow: 0 2px 6px rgb(0 0 0 / 0.5);
    }
</style>
