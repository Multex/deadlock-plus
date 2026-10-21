<script lang="ts">
    import { Eye } from "@lucide/svelte";
    import type { Screen } from "@deadlock-plus/build-layout";
    import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { t } from "$lib/core/i18n.svelte";
    import type { ChipItem } from "../../shop-view";
    import ShopCategory from "../shop/shop-category.svelte";
    import { previewView } from "./canvas/preview";
    import type { Zoom } from "./canvas/zoom";

    let {
        build,
        resolve,
        screen,
        zoom = "fit",
        fit = $bindable(1),
    }: {
        build: BuildView;
        resolve: (abilityId: number) => ChipItem | undefined;
        screen: Screen;
        zoom?: Zoom;
        /** Out: the scale that fills the column, which caps `zoom`. */
        fit?: number;
    } = $props();

    let available = $state(0);
    const layout = $derived(previewView(build.modCategories, screen, available, zoom));
    const view = $derived(layout.view);
    const items = $derived(build.modCategories.map((category) => category.mods.map((mod) => resolve(mod.abilityId))));

    $effect(() => {
        if (available > 0) fit = layout.fit;
    });
</script>

<section
    class="preview"
    bind:clientWidth={available}
    aria-label={t("builds.editor.preview.label")}
    data-testid="preview-canvas"
>
    <p class="note" data-testid="preview-note">
        <Eye aria-hidden="true" />
        {t("builds.editor.preview.note")}
    </p>
    {#if available > 0}
        <Tooltip.Provider>
            <div
                class="content"
                style:width="{view.contentWidth}px"
                style:height="{view.contentHeight}px"
                data-scale={view.scale}
            >
                {#each view.categories as category (category.index)}
                    <ShopCategory
                        category={build.modCategories[category.index]!}
                        view={category}
                        items={items[category.index]!}
                        unit={view.unit}
                        border={view.border}
                        header={view.header}
                    />
                {/each}
            </div>
        </Tooltip.Provider>
    {/if}
</section>

<style>
    .preview {
        display: flex;
        width: 100%;
        min-width: 0;
        flex-direction: column;
        gap: 12px;
        user-select: none;
    }
    .note {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0;
        color: var(--muted-foreground);
        font-size: 12px;
    }
    .note :global(svg) {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
    }
    .content {
        position: relative;
    }
    /* The preview clips each category to its stored height; rows past it are not drawn. */
    .content :global(.category) {
        overflow: hidden;
    }
</style>
