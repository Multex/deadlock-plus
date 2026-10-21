<script lang="ts">
    import type { Screen } from "@deadlock-plus/build-layout";
    import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { shopView, type ChipItem, type ScreenDifference, type ShopMode } from "../../shop-view";
    import ShopCategory from "./shop-category.svelte";

    let {
        build,
        resolve,
        screen,
        mode,
        differences = [],
    }: {
        build: BuildView;
        resolve: (abilityId: number) => ChipItem | undefined;
        screen: Screen;
        /** Fit scales the shop to this element's width; native draws one game px per CSS px. */
        mode: ShopMode;
        /** Categories that lay out differently on the user's own screen. */
        differences?: readonly ScreenDifference[];
    } = $props();

    let available = $state(0);
    const view = $derived(shopView(build.modCategories, screen, available, mode));
    const items = $derived(build.modCategories.map((category) => category.mods.map((mod) => resolve(mod.abilityId))));
    const differenceAt = $derived(new Map(differences.map((d) => [d.index, d])));
</script>

<div class="shop" class:native={mode === "native"} bind:clientWidth={available}>
    {#if mode === "native" || available > 0}
        <Tooltip.Provider>
            <div class="content" style:width="{view.contentWidth}px" style:height="{view.contentHeight}px">
                {#each view.categories as category (category.index)}
                    <ShopCategory
                        category={build.modCategories[category.index]}
                        view={category}
                        items={items[category.index]}
                        unit={view.unit}
                        border={view.border}
                        header={view.header}
                        difference={differenceAt.get(category.index)}
                    />
                {/each}
            </div>
        </Tooltip.Provider>
    {/if}
</div>

<style>
    .shop {
        width: 100%;
        min-width: 0;
    }
    .shop.native {
        overflow-x: auto;
    }
    .content {
        position: relative;
    }
</style>
