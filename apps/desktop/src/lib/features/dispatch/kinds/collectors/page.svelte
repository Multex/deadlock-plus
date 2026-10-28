<script lang="ts">
    import type { Snippet } from "svelte";

    let {
        side,
        alone = false,
        label,
        folio,
        children,
    }: {
        side: "left" | "right";
        /** Shown by itself rather than in the open spread: no gutter shade, its own corners and shadow. */
        alone?: boolean;
        label: string;
        folio: string;
        children: Snippet;
    } = $props();
</script>

<section class="page {side}" class:alone aria-label={label}>
    {@render children()}
    <span class="folio">{folio}</span>
</section>

<style>
    .page {
        position: relative;
        width: 720px;
        height: 1080px;
        padding: 46px 48px 40px;
        overflow: hidden;
        color: #f4e9cc;
        background:
            repeating-linear-gradient(45deg, #ffffff05 0 1px, #0000 1px 4px),
            radial-gradient(at 50% 0, #1e1730 0%, #0000 60%), linear-gradient(#110d1a, #08070c);
    }
    .page.alone {
        border-radius: 6px;
        box-shadow:
            0 30px 60px -20px #000000bf,
            0 10px 22px #00000073;
    }
    .page::before {
        position: absolute;
        inset: 16px;
        pointer-events: none;
        content: "";
        border: 1px solid #c9a24a66;
    }
    .page:not(.alone)::after {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 60px;
        pointer-events: none;
        content: "";
    }
    .left:not(.alone)::after {
        right: 0;
        background: linear-gradient(90deg, #0000, #0000008c);
    }
    .right:not(.alone)::after {
        left: 0;
        background: linear-gradient(270deg, #0000, #0009);
    }
    .page :global(.foil) {
        color: #0000;
        background: linear-gradient(
            100deg,
            #8a6420 0%,
            #f3dc92 22%,
            #b48731 44%,
            #fff3c9 58%,
            #c99a3e 76%,
            #f1d688 100%
        );
        background-clip: text;
        filter: drop-shadow(0 2px #23180399);
    }
    .page :global(.kicker) {
        display: block;
        color: #c9a24a;
        font-family: "Retail Demo", sans-serif;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.22em;
        text-transform: uppercase;
    }
    .page :global(h2) {
        margin: 6px 0 0;
        overflow-x: clip;
        font-family: "Valve Pulp", sans-serif;
        font-size: 92px;
        font-weight: 700;
        line-height: 1;
        text-transform: uppercase;
        white-space: nowrap;
    }
    .folio {
        position: absolute;
        bottom: 24px;
        left: 48px;
        color: #c9a24a99;
        font-family: "Retail Demo", sans-serif;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.2em;
        text-transform: uppercase;
    }
    .right .folio {
        right: 48px;
        left: auto;
    }
</style>
