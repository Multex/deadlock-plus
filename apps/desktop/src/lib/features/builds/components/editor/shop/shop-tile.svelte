<script lang="ts">
    import { ArrowBigUp } from "@lucide/svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import type { ItemStat } from "@deadlock-plus/ipc-types/ItemStat";
    import { t } from "$lib/core/i18n.svelte";
    import type { ShopItem } from "../../../catalog";
    import { drag } from "../../../editor/drag.svelte";
    import type { HeroPopularity } from "../../../editor/popularity.svelte";
    import type { ChipItem } from "../../../shop-view";
    import ItemChip from "../../shop/item-chip.svelte";
    import TileTooltip from "./tile-tooltip.svelte";

    let {
        item,
        count,
        stats,
        popularity,
        focusable,
        onadd,
        onkeydown,
        onfocus,
    }: {
        item: ShopItem;
        count: number;
        stats: readonly ItemStat[];
        popularity: HeroPopularity;
        /** The one tile of the flyout in the tab order (roving tabindex). */
        focusable: boolean;
        onadd: () => void;
        onkeydown: (event: KeyboardEvent) => void;
        onfocus: () => void;
    } = $props();

    const CARD_WIDTH = 76;
    const CARD_HEIGHT = 114;

    let width = $state(0);
    const popular = $derived(popularity.isPopular(item.id));
    const chip = $derived<ChipItem>({
        name: item.name,
        slot: item.slot,
        tier: item.tier,
        active: item.active,
        imbue: item.imbue ?? false,
        ...(item.art !== undefined && { art: item.art }),
    });

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

<Tooltip.Root delayDuration={350}>
    <Tooltip.Trigger>
        {#snippet child({ props })}
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
                            item={chip}
                            box={{ x: 0, y: 0, width, height: (width * CARD_HEIGHT) / CARD_WIDTH }}
                            scale={width / CARD_WIDTH}
                            tooltip={false}
                        />
                    {/if}
                </span>
                {#if popular}
                    <span class="popular" aria-hidden="true">
                        {#if popularity.icon}
                            <img src={popularity.icon} alt="" draggable="false" />
                        {/if}
                        <ArrowBigUp class="arrow" />
                    </span>
                {/if}
                {#if count > 0}
                    <span class="count">{t("builds.editor.picker.count", { count })}</span>
                {/if}
            </Button>
        {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content
        side="right"
        align="start"
        sideOffset={8}
        collisionPadding={8}
        class="max-w-none rounded-none border-0 bg-transparent p-0 shadow-none"
    >
        <TileTooltip
            {item}
            {stats}
            {count}
            lines={popularity.lines(item.id)}
            heroIcon={popular ? popularity.icon : null}
        />
    </Tooltip.Content>
</Tooltip.Root>

<style>
    :global(.tile) {
        --bright: var(--muted-foreground);
        position: relative;
        display: block;
        min-width: 0;
        padding: 0;
        border-radius: 3px;
        cursor: grab;
        touch-action: none;
        user-select: none;
    }
    :global(.tile[data-shop-slot="weapon"]) {
        --bright: #ec9719;
    }
    :global(.tile[data-shop-slot="vitality"]) {
        --bright: #7bba1d;
    }
    :global(.tile[data-shop-slot="spirit"]) {
        --bright: #ce90ff;
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

    .popular {
        position: absolute;
        top: -3px;
        left: -3px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #10130d;
        box-shadow: 0 0 0 1px #6fd36f;
    }
    .popular > img {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        object-fit: cover;
    }
    .popular :global(.arrow) {
        position: absolute;
        right: -5px;
        bottom: -4px;
        width: 12px;
        height: 12px;
        fill: #6fd36f;
        color: #10130d;
        stroke-width: 1.5;
    }

    .count {
        position: absolute;
        bottom: -3px;
        right: -3px;
        padding: 0 4px;
        border-radius: 999px;
        background: var(--brass, #c9a227);
        box-shadow: 0 1px 3px #0008;
        color: #10130d;
        font-size: 10px;
        font-weight: 700;
        line-height: 14px;
        font-variant-numeric: tabular-nums;
    }
</style>
