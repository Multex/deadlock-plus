<script lang="ts">
    import { ArrowBigUp } from "@lucide/svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import type { ItemStat } from "@deadlock-plus/ipc-types/ItemStat";
    import { t } from "$lib/core/i18n.svelte";
    import type { ShopItem } from "../../../catalog";
    import { drag } from "../../../editor/drag.svelte";
    import type { HeroPopularity } from "../../../editor/popularity.svelte";
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

    let failedArt = $state<string>();
    const showArt = $derived(!!item.art && failedArt !== item.art);
    const popular = $derived(popularity.isPopular(item.id));

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
                <span class="art" class:active={item.active}>
                    {#if showArt}
                        <img src={item.art} alt="" draggable="false" onerror={() => (failedArt = item.art)} />
                    {/if}
                    {#if item.imbue}
                        <span class="imbue">{t("builds.shop.imbue")}</span>
                    {/if}
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
                </span>
                <span class="name">{item.name}</span>
            </Button>
        {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content side="right" class="w-60">
        <TileTooltip {item} {stats} {count} lines={popularity.lines(item.id)} />
    </Tooltip.Content>
</Tooltip.Root>

<style>
    :global(.tile) {
        --bright: var(--muted-foreground);
        --dark: var(--muted);
        position: relative;
        display: flex;
        min-width: 0;
        flex-direction: column;
        align-items: center;
        gap: 3px;
        padding: 3px 2px 2px;
        border-radius: 4px;
        cursor: grab;
        touch-action: none;
        user-select: none;
    }
    :global(.tile[data-shop-slot="weapon"]) {
        --bright: #ec9719;
        --dark: #302306;
    }
    :global(.tile[data-shop-slot="vitality"]) {
        --bright: #7bba1d;
        --dark: #1f3400;
    }
    :global(.tile[data-shop-slot="spirit"]) {
        --bright: #ce90ff;
        --dark: #362147;
    }
    :global(.tile:hover) {
        background: color-mix(in oklch, var(--bright) 12%, transparent);
    }

    .art {
        position: relative;
        display: flex;
        width: 54px;
        height: 54px;
        flex: none;
        align-items: center;
        justify-content: center;
        border-radius: 3px;
        border-bottom: 3px solid var(--bright);
        background: radial-gradient(
            circle at 50% 40%,
            color-mix(in oklch, var(--bright) 30%, var(--dark)),
            var(--dark)
        );
        box-shadow: 1px 1px 4px #0006;
    }
    :global(.tile[data-tier="4"]) .art {
        outline: 1px solid var(--bright);
        outline-offset: -1px;
        background: radial-gradient(circle at 50% 40%, color-mix(in oklch, var(--bright) 18%, #000), #000);
    }
    .art.active {
        border-radius: 999px 999px 3px 3px;
    }
    .art > img {
        width: 82%;
        height: 82%;
        object-fit: contain;
    }
    .art.active > img {
        border-radius: 50%;
    }

    .imbue {
        position: absolute;
        bottom: 1px;
        left: 50%;
        translate: -50% 0;
        padding: 0 2px;
        border-radius: 2px;
        background: #000a;
        color: #e7c8ff;
        font-size: 7px;
        font-style: italic;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        white-space: nowrap;
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
        top: -3px;
        right: -3px;
        padding: 0 4px;
        border-radius: 999px;
        background: var(--brass, #c9a227);
        color: #10130d;
        font-size: 10px;
        font-weight: 700;
        line-height: 14px;
        font-variant-numeric: tabular-nums;
    }

    .name {
        width: 100%;
        overflow: hidden;
        color: var(--foreground);
        font-size: 10px;
        line-height: 1.2;
        text-align: center;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>
