<script lang="ts">
    import { Monitor } from "@lucide/svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import type { GameItem } from "@deadlock-plus/game-ui/item";
    import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
    import { tn } from "$lib/core/i18n.svelte";
    import type { ScreenDifference, ShopCategoryView } from "../../shop-view";
    import CategoryTitle from "./category-title.svelte";
    import ItemChip from "./item-chip.svelte";

    let {
        category,
        view,
        items,
        unit,
        border,
        difference,
    }: {
        category: Pick<ModCategoryView, "name" | "description" | "optional" | "width" | "mods">;
        view: ShopCategoryView;
        /** One per chip; undefined for an item the game no longer has. */
        items: (GameItem | undefined)[];
        /** CSS px per game unit. */
        unit: number;
        border: number;
        /** How this category lays out differently on the user's own screen. */
        difference?: ScreenDifference;
    } = $props();

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
    <header style:height="{view.header}px">
        <CategoryTitle {category} {unit} />
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
            box={{ x: chip.x - view.box.x - border, y: chip.y - view.box.y - border }}
            scale={unit}
        />
    {/each}
</section>

<style>
    .category {
        position: absolute;
        box-sizing: border-box;
        overflow: clip;
        border: var(--edge) solid var(--border);
        background: color-mix(in oklch, var(--card) 70%, transparent);
    }
    .category.optional {
        background: color-mix(in oklch, #365b92 28%, var(--card));
    }
    header {
        position: relative;
        background: color-mix(in oklch, #10130d 70%, transparent);
    }
    /* Over the name's first line, so the name keeps the game's width to wrap in. */
    header :global(.screen-flag) {
        position: absolute;
        top: calc(var(--u) * 6);
        right: calc(var(--u) * 4);
        display: inline-flex;
        align-items: center;
        padding: calc(var(--u) * 2) calc(var(--u) * 4);
        border: 0;
        border-radius: 2px;
        background: color-mix(in oklch, var(--warning) 22%, #10130d);
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
