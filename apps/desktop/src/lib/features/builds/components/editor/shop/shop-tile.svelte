<script lang="ts">
    import Button from "@deadlock-plus/ui/button.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import type { ShopItem } from "../../../catalog";
    import { drag } from "../../../editor/drag.svelte";
    import type { HeroPopularity } from "../../../editor/popularity.svelte";
    import { gameItem } from "../../../game-item";
    import ItemChip from "../../shop/item-chip.svelte";
    import ItemTip from "../../shop/item-tip.svelte";

    let {
        item,
        count,
        popularity,
        focusable,
        onadd,
        onkeydown,
        onfocus,
    }: {
        item: ShopItem;
        count: number;
        popularity: HeroPopularity;
        /** The one tile of the flyout in the tab order (roving tabindex). */
        focusable: boolean;
        onadd: () => void;
        onkeydown: (event: KeyboardEvent) => void;
        onfocus: () => void;
    } = $props();

    const CARD_WIDTH = 76;

    let width = $state(0);
    const popular = $derived(popularity.isPopular(item.id));
    const card = $derived(gameItem(item));
    const marker = $derived(popular ? { ...(popularity.icon && { minimap: popularity.icon }) } : undefined);

    function pointerDown(event: PointerEvent) {
        drag.begin({ kind: "new", abilityIds: [item.id] }, event, { art: item.art, label: item.name });
    }

    // The tooltip trigger's own handlers come in `props`; a plain handler after the spread would replace them.
    function chain<E extends Event>(theirs: unknown, mine: (event: E) => void) {
        return (event: E) => {
            if (typeof theirs === "function") theirs(event);
            mine(event);
        };
    }
</script>

{#snippet tile(props: Record<string, unknown>)}
    <Button
        {...props}
        variant="unstyled"
        type="button"
        class="tile"
        data-tile
        data-shop-slot={item.slot}
        data-tier={item.tier}
        data-popular={popular || undefined}
        tabindex={focusable ? 0 : -1}
        aria-label={count > 0
            ? t("builds.editor.picker.add_counted", { name: item.name, count })
            : t("builds.editor.picker.add", { name: item.name })}
        onpointerdown={chain(props.onpointerdown, pointerDown)}
        onclick={chain(props.onclick, onadd)}
        onkeydown={chain(props.onkeydown, onkeydown)}
        onfocus={chain(props.onfocus, onfocus)}
    >
        <span class="card" bind:clientWidth={width}>
            {#if width > 0}
                <ItemChip
                    item={card}
                    box={{ x: 0, y: 0 }}
                    scale={width / CARD_WIDTH}
                    layout="shop"
                    tooltip={false}
                    {count}
                    popular={marker}
                />
            {/if}
        </span>
    </Button>
{/snippet}

<ItemTip id={item.id} delay={350} children={tile} />

<style>
    :global(.tile) {
        position: relative;
        display: block;
        min-width: 0;
        padding: 0;
        border-radius: 3px;
        cursor: grab;
        touch-action: none;
        user-select: none;
    }
    :global(.tile:hover) .card {
        filter: brightness(1.12);
    }
    :global(.tile:focus-visible) {
        outline: 2px solid var(--ring);
        outline-offset: 2px;
    }

    /* The game's shop shows the same 76 x 114 card as the build page. */
    .card {
        position: relative;
        display: block;
        width: 100%;
        aspect-ratio: 76 / 114;
    }
</style>
