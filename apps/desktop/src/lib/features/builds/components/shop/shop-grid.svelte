<script lang="ts">
    import type { Screen } from "@deadlock-plus/build-layout";
    import type { GameItem } from "@deadlock-plus/game-ui/item";
    import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { headerLinesFor } from "../../header-lines.svelte";
    import { fitWidth, shopView, type ScreenDifference, type ShopMode } from "../../shop-view";
    import ShopCategory from "./shop-category.svelte";

    let {
        build,
        resolve,
        screen,
        mode,
        differences = [],
    }: {
        build: BuildView;
        resolve: (abilityId: number) => GameItem | undefined;
        screen: Screen;
        /** Fit scales the shop to this element's width, never past native; native draws one game px per CSS px. */
        mode: ShopMode;
        /** Categories that lay out differently on the user's own screen. */
        differences?: readonly ScreenDifference[];
    } = $props();

    let available = $state(0);
    const view = $derived(
        shopView(build.modCategories, screen, fitWidth(available, screen), mode, headerLinesFor(build.modCategories)),
    );
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
