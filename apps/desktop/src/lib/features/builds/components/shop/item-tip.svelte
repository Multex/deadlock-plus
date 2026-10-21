<script lang="ts">
    import type { Snippet } from "svelte";
    import { ItemTooltip, itemTooltipModel } from "@deadlock-plus/game-ui";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { drag } from "../../editor/drag.svelte";
    import { itemTooltipInput, popularityFor } from "../../game-item";
    import { itemTipSource } from "./item-tips";

    let {
        id,
        delay = 250,
        children,
    }: {
        /** Undefined draws the trigger without a tooltip. */
        id: number | undefined;
        delay?: number;
        /** The trigger; spread the props on its element. */
        children: Snippet<[Record<string, unknown>]>;
    } = $props();

    const source = itemTipSource();
    const current = $derived(id === undefined ? null : source());
</script>

{#if current && id !== undefined}
    {@const tip = current}
    {@const itemId = id}
    <Tooltip.Root delayDuration={delay} disableHoverableContent disabled={drag.current !== null}>
        <Tooltip.Trigger tabindex={-1}>
            {#snippet child({ props })}
                {@render children(props)}
            {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content
            side="right"
            align="start"
            sideOffset={8}
            collisionPadding={8}
            class="max-w-none rounded-none border-0 bg-transparent p-0 shadow-none"
        >
            {@const popularity = tip.popularity
                ? popularityFor(tip.popularity.game, tip.popularity.icon, itemId)
                : null}
            {@const input = itemTooltipInput(tip.catalog, itemId, { popularity })}
            {#if input}
                <ItemTooltip model={itemTooltipModel(input)} data-item-tooltip={itemId} />
            {/if}
        </Tooltip.Content>
    </Tooltip.Root>
{:else}
    {@render children({})}
{/if}
