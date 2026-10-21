<script lang="ts">
    import { CircleDashed, Info, Monitor } from "@lucide/svelte";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
    import { t, tn } from "$lib/core/i18n.svelte";
    import type { ChipItem, ScreenDifference, ShopCategoryView } from "../../shop-view";
    import ItemChip from "./item-chip.svelte";

    let {
        category,
        view,
        items,
        unit,
        border,
        header,
        difference,
    }: {
        category: Pick<ModCategoryView, "name" | "description" | "optional">;
        view: ShopCategoryView;
        /** One per chip; undefined for an item the game no longer has. */
        items: (ChipItem | undefined)[];
        /** CSS px per game unit. */
        unit: number;
        border: number;
        header: number;
        /** How this category lays out differently on the user's own screen. */
        difference?: ScreenDifference;
    } = $props();

    const description = $derived(category.description.trim());
    const differs = $derived(
        difference ? tn("builds.view.differs", difference.columns, { reference: difference.referenceColumns }) : null,
    );
</script>

<section
    class="category"
    class:optional={category.optional}
    class:capped={view.capped}
    aria-label={category.name || undefined}
    style:left="{view.box.x}px"
    style:top="{view.box.y}px"
    style:width="{view.box.width}px"
    style:height="{view.box.height}px"
    style:--u="{unit}px"
    style:--edge="{border}px"
>
    <header style:height="{header}px">
        {#if description}
            <Tooltip.Root delayDuration={100}>
                <Tooltip.Trigger class="title described">
                    <span class="name">{category.name}</span>
                    <Info class="hint" aria-hidden="true" />
                </Tooltip.Trigger>
                <Tooltip.Content class="whitespace-pre-line">{description}</Tooltip.Content>
            </Tooltip.Root>
        {:else}
            <span class="title"><span class="name">{category.name}</span></span>
        {/if}
        {#if category.optional && view.columns < 3}
            <!-- Below three columns the header has room for the name only. -->
            <Tooltip.Root delayDuration={100}>
                <Tooltip.Trigger class="optional-pill compact" aria-label={t("builds.shop.optional")}>
                    <CircleDashed aria-hidden="true" />
                </Tooltip.Trigger>
                <Tooltip.Content>{t("builds.shop.optional")}</Tooltip.Content>
            </Tooltip.Root>
        {:else if category.optional}
            <Badge variant="outline" class="optional-pill">{t("builds.shop.optional")}</Badge>
        {/if}
        {#if difference && differs}
            <Tooltip.Root delayDuration={100}>
                <Tooltip.Trigger
                    class="screen-flag"
                    aria-label={differs}
                    data-screen-difference
                    data-columns={difference.columns}
                    data-reference-columns={difference.referenceColumns}
                >
                    <Monitor aria-hidden="true" />
                </Tooltip.Trigger>
                <Tooltip.Content>{differs}</Tooltip.Content>
            </Tooltip.Root>
        {/if}
    </header>
    {#each view.chips as chip, i (i)}
        <ItemChip
            item={items[i]}
            box={{
                x: chip.x - view.box.x - border,
                y: chip.y - view.box.y - border,
                width: chip.width,
                height: chip.height,
            }}
            scale={unit}
        />
    {/each}
</section>

<style>
    .category {
        position: absolute;
        box-sizing: border-box;
        border: var(--edge) solid var(--border);
        background: color-mix(in oklch, var(--card) 70%, transparent);
    }
    .category.optional {
        background: color-mix(in oklch, #365b92 28%, var(--card));
    }
    header {
        display: flex;
        align-items: center;
        gap: calc(var(--u) * 6);
        overflow: hidden;
        padding: 0 calc(var(--u) * 6) 0 calc(var(--u) * 12);
        background: color-mix(in oklch, #10130d 70%, transparent);
    }
    header :global(.title) {
        display: inline-flex;
        min-width: 0;
        align-items: center;
        gap: calc(var(--u) * 4);
        padding: 0;
        border: 0;
        border-radius: 2px;
        background: none;
        color: var(--foreground);
        font: inherit;
        font-size: calc(var(--u) * 16);
        font-weight: 700;
    }
    header :global(.title.described) {
        cursor: help;
    }
    header :global(.title:focus-visible) {
        outline: 2px solid var(--ring);
        outline-offset: 1px;
    }
    .name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    header :global(.hint) {
        flex-shrink: 0;
        width: calc(var(--u) * 13);
        height: calc(var(--u) * 13);
        color: var(--muted-foreground);
    }
    header :global(.optional-pill) {
        padding: 0 calc(var(--u) * 4);
        border: 0;
        border-radius: 2px;
        background: #00000050;
        color: color-mix(in oklch, #85b5ff 90%, transparent);
        font-size: calc(var(--u) * 12);
        font-weight: 700;
        line-height: 1.4;
        text-transform: uppercase;
    }
    header :global(.optional-pill.compact) {
        display: inline-grid;
        flex-shrink: 0;
        place-items: center;
        width: calc(var(--u) * 18);
        height: calc(var(--u) * 18);
        padding: 0;
        cursor: help;
    }
    header :global(.optional-pill.compact svg) {
        width: calc(var(--u) * 12);
        height: calc(var(--u) * 12);
    }
    header :global(.screen-flag) {
        display: inline-flex;
        flex-shrink: 0;
        align-items: center;
        margin-left: auto;
        padding: calc(var(--u) * 2) calc(var(--u) * 4);
        border: 0;
        border-radius: 2px;
        background: color-mix(in oklch, var(--warning) 22%, transparent);
        color: var(--warning);
        cursor: help;
    }
    header :global(.screen-flag:focus-visible) {
        outline: 2px solid var(--ring);
        outline-offset: 1px;
    }
    header :global(.screen-flag svg) {
        width: calc(var(--u) * 13);
        height: calc(var(--u) * 13);
    }
</style>
