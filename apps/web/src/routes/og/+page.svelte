<script lang="ts">
    import BrandMark from "@deadlock-plus/ui/brand-mark.svelte";
    import { SITE_URL } from "@deadlock-plus/links/urls";
    import { OG_IMAGE } from "$lib/components/seo";
</script>

<svelte:head>
    <title>Link preview image | Deadlock+</title>
</svelte:head>

<!-- Fixed over the site's header, footer and film grain (the grain doubles the PNG's size): `scripts/og.mjs` captures exactly this box as `static/og.png`. -->
<div
    data-og
    class="noir-panel fixed top-0 left-0 z-[calc(var(--z-grain)+1)] flex items-center gap-12 overflow-hidden px-16"
    style:width="{OG_IMAGE.width}px"
    style:height="{OG_IMAGE.height}px"
>
    <div class="flex min-w-0 flex-1 flex-col items-start">
        <BrandMark class="[zoom:3]" />
        <p class="mt-[34px] font-heading text-[3.4rem] leading-[1.15] font-semibold text-foreground">
            A free companion app for <span class="text-brass">Deadlock</span>
        </p>
        <p class="mt-[34px] text-[1.9rem] text-muted-foreground">{new URL(SITE_URL).host}</p>
    </div>

    <!-- The crop is drawn a little larger and shifted, so its own card border and outer gutter fall outside the frame and the frame ends on a row line. -->
    <div
        class="h-[510px] w-[520px] shrink-0 overflow-hidden rounded-xl border border-brass/40 bg-chrome shadow-2xl shadow-black/60"
    >
        <img src="/screenshots/match-mobile.webp" alt="" class="-mt-[7px] -ml-[7px] w-[532px] max-w-none" />
    </div>
</div>
