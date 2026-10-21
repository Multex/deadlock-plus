<script lang="ts">
    import type { ItemStat } from "@deadlock-plus/ipc-types/ItemStat";
    import type { ShopItem } from "../../../catalog";
    import type { PopularityText } from "../../../editor/popularity.svelte";
    import { itemTooltipSource } from "../../item-tooltip/context";
    import { itemTooltip } from "../../item-tooltip/item-tooltip";
    import ItemTooltip from "../../item-tooltip/item-tooltip.svelte";

    let {
        item,
        stats,
        count,
        lines,
        heroIcon = null,
    }: {
        item: ShopItem;
        stats: readonly ItemStat[];
        count: number;
        lines: PopularityText;
        heroIcon?: string | null;
    } = $props();

    const source = itemTooltipSource();
    // Without a provided catalog the tooltip still shows the item, just without its upgrade links.
    const model = $derived(
        itemTooltip(source()?.catalog.byId ?? new Map([[item.id, item]]), new Map([[item.id, stats]]), item.id),
    );
</script>

{#if model}
    <ItemTooltip {model} popularity={lines} {heroIcon} {count} />
{/if}
