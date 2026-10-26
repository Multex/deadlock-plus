<script lang="ts">
    import type { Snippet } from "svelte";
    import type { Magazine } from "./magazine";
    import { paletteStyle } from "./palette";

    let {
        mag,
        side,
        folio,
        section,
        children,
    }: { mag: Magazine; side: "left" | "right"; folio: number; section: string; children: Snippet } = $props();
</script>

<div class="inner {side}" style={paletteStyle(mag.palette)}>
    <div class="body">{@render children()}</div>
    <div class="folio">
        {#if side === "left"}
            <b>{folio}</b><span class="name">{mag.folio}</span><span class="sec">{section}</span>
        {:else}
            <span class="sec">{section}</span><span class="name">{mag.folio}</span><b>{folio}</b>
        {/if}
    </div>
    <div class="gutter" aria-hidden="true"></div>
    <div class="sheen" aria-hidden="true"></div>
</div>

<style>
    .inner {
        position: absolute;
        inset: 0;
        overflow: hidden;
        color: var(--page-text);
        background: var(--page-paper);
        font-family: "Radiance", sans-serif;
        font-size: 14px;
        line-height: 1.3;
    }

    .body {
        position: absolute;
        inset: 0 0 40px;
    }

    .folio {
        position: absolute;
        left: 40px;
        right: 40px;
        bottom: 16px;
        display: flex;
        align-items: baseline;
        gap: 14px;
        color: var(--page-muted);
        font-family: "Retail Demo", sans-serif;
        font-weight: 600;
        font-size: 11px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        white-space: nowrap;
    }

    .folio b {
        color: var(--ink);
        font-size: 14px;
    }

    .name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .sec {
        flex: none;
        color: var(--ink);
    }

    .left .sec {
        margin-left: auto;
    }

    .right .sec {
        margin-right: auto;
    }

    .right .folio {
        justify-content: flex-end;
    }

    .gutter {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 70px;
        pointer-events: none;
    }

    .left .gutter {
        right: 0;
        background: linear-gradient(to left, rgb(0 0 0 / 0.26), rgb(0 0 0 / 0.08) 18%, transparent);
    }

    .right .gutter {
        left: 0;
        background: linear-gradient(to right, rgb(0 0 0 / 0.26), rgb(0 0 0 / 0.08) 18%, transparent);
    }

    .sheen {
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: linear-gradient(
            120deg,
            rgb(255 255 255 / 0.5) 0%,
            transparent 30%,
            transparent 75%,
            rgb(255 255 255 / 0.25)
        );
        mix-blend-mode: soft-light;
    }
</style>
