<script lang="ts">
    import type { Box } from "@deadlock-plus/build-layout";
    import { ItemCard } from "@deadlock-plus/game-ui";
    import type { CardLayout } from "@deadlock-plus/game-ui/item-card/card";
    import type { GameItem } from "@deadlock-plus/game-ui/item";
    import { t } from "$lib/core/i18n.svelte";
    import ItemTip from "./item-tip.svelte";

    type Popular = { minimap?: string };

    let {
        item,
        box,
        scale,
        layout = "build",
        tooltip = true,
        count = 0,
        popular,
    }: {
        /** Undefined when the build holds an item the game no longer has. */
        item: GameItem | undefined;
        /** Where the card sits in its positioned parent; its size comes from `scale`. */
        box: Pick<Box, "x" | "y">;
        /** CSS px per game unit. */
        scale: number;
        layout?: CardLayout;
        /** Shows the game's item tooltip on hover when an ancestor provides the catalog. */
        tooltip?: boolean;
        /** Copies already in the build; the badge shows above 0. */
        count?: number;
        /** The hero's popular marker. */
        popular?: Popular;
    } = $props();
</script>

{#snippet card(props: Record<string, unknown>)}
    <ItemCard
        {...props}
        {item}
        {layout}
        {count}
        {popular}
        countLabel={count > 0 ? t("builds.editor.picker.count", { count }) : undefined}
        style="position: absolute; left: {box.x}px; top: {box.y}px; margin: 0; --game-ui-scale: {scale}"
    />
{/snippet}

<ItemTip id={tooltip ? item?.id : undefined} children={card} />
