<script lang="ts">
    import type { Snippet } from "svelte";
    import { AbilityTooltipView, type AbilityTooltipModel } from "@deadlock-plus/game-ui";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { ABILITY_TOOLTIP_SCALE } from "../../../ability-tooltip";

    let {
        model,
        name,
        children,
    }: {
        /** Null while the game cannot be read: the hover then names the ability in a plain popover. */
        model: AbilityTooltipModel | null;
        name: string;
        /** Lines about the build itself, under the game's tooltip. */
        children?: Snippet;
    } = $props();
</script>

{#if model}
    <Tooltip.Content
        side="top"
        class="flex max-w-none flex-col items-stretch border-0 bg-transparent p-0 shadow-none"
        style="--game-ui-scale: {ABILITY_TOOLTIP_SCALE}"
    >
        <AbilityTooltipView {model} />
        {#if children}
            <!-- The tooltip's own 10 px padding, scaled, so the lines line up with its painted edge. -->
            <div
                class="mx-[calc(var(--game-ui-scale)*10px)] rounded-md border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md"
            >
                {@render children()}
            </div>
        {/if}
    </Tooltip.Content>
{:else}
    <Tooltip.Content side="top" class="max-w-64">
        <p class="font-semibold">{name}</p>
        {@render children?.()}
    </Tooltip.Content>
{/if}
