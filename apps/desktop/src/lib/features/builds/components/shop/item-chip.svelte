<script lang="ts">
    import { TriangleAlert } from "@lucide/svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import type { Box } from "@deadlock-plus/build-layout";
    import { t } from "$lib/core/i18n.svelte";
    import { drag } from "../../editor/drag.svelte";
    import type { ChipItem } from "../../shop-view";
    import { itemTooltipSource, type TooltipChip } from "../item-tooltip/context";
    import { itemTooltip, romanTier } from "../item-tooltip/item-tooltip";
    import ItemTooltip from "../item-tooltip/item-tooltip.svelte";
    import { cardArt } from "./card-art.svelte";

    let {
        item,
        box,
        scale,
        tooltip = true,
    }: {
        /** Undefined when the build holds an item the game no longer has. */
        item: ChipItem | undefined;
        box: Box;
        /** CSS px per game unit. */
        scale: number;
        /** Shows the game-style item tooltip on hover when an ancestor provides the catalog. */
        tooltip?: boolean;
    } = $props();

    const source = itemTooltipSource();
    const id = $derived((item as TooltipChip | undefined)?.id);
    const tipSource = $derived(tooltip && id !== undefined ? source() : null);

    const images = $derived(cardArt());
    // The game cycles its paper textures by the card's position; a name hash keeps each card's look stable.
    const variant = $derived([...(item?.name ?? "")].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7));
    const backer = $derived(item ? images[`card_backer_${item.slot}_t${item.tier}`] : undefined);
    const paper = $derived(images[`paper_texture_${((variant % 3) + 1) as 1 | 2 | 3}`]);
    const wear = $derived(images[`paper_wear_${((variant % 4) + 1) as 1 | 2 | 3 | 4}`]);
    const numeral = $derived(item ? images[`tier_number_${item.tier}`] : undefined);
    const url = (src: string | undefined) => (src ? `url("${src}")` : undefined);

    let failedArt = $state<string>();
    const showArt = $derived(!!item?.art && failedArt !== item.art);
    const initials = $derived(
        (item?.name ?? "")
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((word) => word[0].toUpperCase())
            .join(""),
    );

    const NAME_SIZE = 15;
    const NAME_PADDING = 6;
    const AVG_GLYPH_EM = 0.56;
    const MIN_NAME_SIZE = 8;
    const MAX_NAME_LINES = 3;

    const label = $derived(item ? item.name : t("builds.shop.removed_item"));
    // Panorama shrinks the label to fit; CSS has no equivalent, so the size is estimated from glyph count.
    const nameSize = $derived.by(() => {
        const available = Math.max(1, box.width / scale - NAME_PADDING);
        const longestWord = Math.max(...label.split(/\s+/).map((word) => word.length), 1);
        const forWord = available / (longestWord * AVG_GLYPH_EM);
        const forLines = (available * MAX_NAME_LINES) / (label.length * AVG_GLYPH_EM * 1.15);
        return Math.max(MIN_NAME_SIZE, Math.min(NAME_SIZE, forWord, forLines));
    });
</script>

{#snippet card(props: Record<string, unknown>)}
    <div
        {...props}
        class="chip"
        class:active={item?.active}
        class:removed={!item}
        class:textured={!!backer}
        data-slot={item?.slot}
        data-tier={item?.tier}
        style:left="{box.x}px"
        style:top="{box.y}px"
        style:width="{box.width}px"
        style:height="{box.height}px"
        style:--u="{scale}px"
        style:--backer={url(backer)}
        style:--paper={url(paper)}
        style:--wear={url(wear)}
        style:--numeral={url(numeral)}
    >
        {#if item}
            <div class="art">
                {#if showArt}
                    <img
                        src={item.art}
                        alt=""
                        draggable="false"
                        loading="lazy"
                        decoding="async"
                        onerror={() => (failedArt = item.art)}
                    />
                {:else}
                    <span class="placeholder" aria-hidden="true">{initials}</span>
                {/if}
            </div>
            {#if item.imbue}
                <span class="imbue">{t("builds.shop.imbue")}</span>
            {/if}
            <span class="tier" aria-hidden="true"
                ><span class="cap"></span>{#if numeral}<span class="numeral-art"></span>{:else}<span class="numeral"
                        >{romanTier(item.tier)}</span
                    >{/if}</span
            >
            {#if backer}
                {#if paper}<span class="paper" aria-hidden="true"></span>{/if}
                {#if wear}<span class="wear" aria-hidden="true"></span>{/if}
            {/if}
            <span class="name" style:--name-size={nameSize} title={tooltip && !tipSource ? item.name : undefined}
                ><span>{item.name}</span></span
            >
        {:else}
            <div class="art">
                <TriangleAlert class="warn" aria-hidden="true" />
            </div>
            <span class="name" style:--name-size={nameSize}><span>{label}</span></span>
        {/if}
    </div>
{/snippet}

{#if tipSource && id !== undefined}
    {@const current = tipSource}
    {@const itemId = id}
    <Tooltip.Root delayDuration={250} disableHoverableContent disabled={drag.current !== null}>
        <Tooltip.Trigger tabindex={-1}>
            {#snippet child({ props })}
                {@render card(props)}
            {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content
            side="right"
            align="start"
            sideOffset={8}
            collisionPadding={8}
            class="max-w-none rounded-none border-0 bg-transparent p-0 shadow-none"
        >
            {@const model = itemTooltip(current.catalog.byId, current.catalog.statsById, itemId)}
            {#if model}
                <ItemTooltip
                    {model}
                    popularity={current.popularity?.lines(itemId)}
                    heroIcon={current.popularity?.isPopular(itemId) ? current.popularity.icon : null}
                />
            {/if}
        </Tooltip.Content>
    </Tooltip.Root>
{:else}
    {@render card({})}
{/if}

<style>
    /* Card tones are sampled from in-game 1440p shots: the name plate per slot and tier. Tier 4 cards are dark
       with light names, as the game's `ModTier4` rules set them. */
    .chip {
        --off-black: #10130d;
        --bright: var(--muted-foreground);
        --plate: var(--muted);
        --name-fg: var(--off-black);
        position: absolute;
        overflow: hidden;
        border-radius: calc(var(--u) * 3);
        background: var(--plate);
        box-shadow: 2px 2px 12px #0007;
        user-select: none;
    }
    .chip[data-slot="weapon"] {
        --bright: #ec9719;
    }
    .chip[data-slot="vitality"] {
        --bright: #7bba1d;
    }
    .chip[data-slot="spirit"] {
        --bright: #ce90ff;
    }
    .chip[data-slot="weapon"][data-tier="1"] {
        --plate: #e0c28a;
    }
    .chip[data-slot="weapon"][data-tier="2"] {
        --plate: #b2905b;
    }
    .chip[data-slot="weapon"][data-tier="3"] {
        --plate: #9f734b;
    }
    .chip[data-slot="weapon"][data-tier="4"] {
        --plate: #342d26;
        --name-fg: #e4c5a1;
    }
    .chip[data-slot="vitality"][data-tier="1"] {
        --plate: #cbd28e;
    }
    .chip[data-slot="vitality"][data-tier="2"] {
        --plate: #9ba676;
    }
    .chip[data-slot="vitality"][data-tier="3"] {
        --plate: #81905f;
    }
    .chip[data-slot="vitality"][data-tier="4"] {
        --plate: #3f3d30;
        --name-fg: #c2e7cd;
    }
    .chip[data-slot="spirit"][data-tier="1"] {
        --plate: #e7d4eb;
    }
    .chip[data-slot="spirit"][data-tier="2"] {
        --plate: #a49cb7;
    }
    .chip[data-slot="spirit"][data-tier="3"] {
        --plate: #827da8;
    }
    .chip[data-slot="spirit"][data-tier="4"] {
        --plate: #3a3434;
        --name-fg: #e3d4f2;
    }
    /* The game's own card backer, paper texture (multiplied) and paper wear (washed per tier, half opacity),
       stacked in the order `citadel_shop_mod_view` draws them. */
    .chip.textured {
        background:
            var(--backer) center / cover no-repeat,
            var(--plate);
    }
    .paper,
    .wear {
        position: absolute;
        inset: 0;
        pointer-events: none;
    }
    .paper {
        background: var(--paper) center / 100% 100% no-repeat;
        mix-blend-mode: multiply;
    }
    .wear {
        --wash: #fff;
        background: var(--wash);
        opacity: 0.5;
        mask: var(--wear) center / 100% 100% no-repeat;
    }
    .chip[data-tier="1"]:is([data-slot="vitality"], [data-slot="spirit"]) .wear {
        opacity: 1;
    }
    .chip[data-tier="1"][data-slot="vitality"] .wear {
        --wash: #f3e1cc;
    }
    .chip[data-tier="1"][data-slot="spirit"] .wear {
        --wash: rgb(247 232 213);
    }
    .chip[data-tier="2"] .wear {
        --wash: rgb(230 209 191);
    }
    .chip[data-tier="3"] .wear {
        --wash: rgb(206 173 155);
    }
    .chip[data-tier="4"] .wear {
        --wash: rgb(105 97 92);
    }
    .chip.removed {
        --plate: color-mix(in oklch, var(--warning) 8%, transparent);
        --name-fg: var(--warning);
        border: 1px dashed var(--warning);
        box-shadow: none;
    }

    /* The art is flush with the card: square art fills the top 70 units edge to edge; active items show it as
       a circle as wide as the card on the plate colour. */
    .art {
        position: absolute;
        top: 0;
        right: 0;
        left: 0;
        display: flex;
        height: calc(var(--u) * 71);
        align-items: center;
        justify-content: center;
        overflow: hidden;
        background: color-mix(in oklch, var(--plate) 55%, #fff);
        box-shadow: 2px 2px 5px #10130d99;
    }
    .chip[data-tier="4"] .art {
        background: color-mix(in oklch, var(--plate) 70%, #000);
    }
    .chip.active .art {
        right: auto;
        left: 50%;
        width: min(100%, calc(var(--u) * 74));
        height: auto;
        aspect-ratio: 1;
        translate: -50% 0;
        border-radius: 50%;
        box-shadow: 1px 2px 5px #10130d80;
    }
    .chip.removed .art {
        background: none;
        box-shadow: none;
    }
    .art img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
    .placeholder {
        font-family: var(--font-heading);
        font-size: calc(var(--u) * 22);
        font-weight: 600;
        color: color-mix(in oklch, var(--off-black) 45%, transparent);
    }
    .art :global(.warn) {
        width: calc(var(--u) * 28);
        height: calc(var(--u) * 28);
        color: var(--warning);
    }

    .imbue {
        position: absolute;
        top: calc(var(--u) * 53);
        right: 0;
        left: 0;
        color: #e7c8ff;
        font-size: calc(var(--u) * 12);
        font-style: italic;
        font-weight: 700;
        letter-spacing: calc(var(--u) * 1);
        line-height: calc(var(--u) * 16);
        text-align: center;
        text-shadow:
            0 0 calc(var(--u) * 1.5) var(--off-black),
            0 0 calc(var(--u) * 1.5) var(--off-black),
            0 0 calc(var(--u) * 3) var(--off-black);
        text-transform: uppercase;
        white-space: nowrap;
    }

    /* `tier_corner_cap` is a 22 px cap at 140% ui-scale: measured 29 units at 1440p. */
    .tier {
        position: absolute;
        top: 0;
        right: 0;
        width: calc(var(--u) * 29);
        height: calc(var(--u) * 29);
        filter: drop-shadow(-4px 0 10px #000e);
    }
    .cap {
        position: absolute;
        inset: 0;
        clip-path: polygon(0 0, 100% 0, 100% 100%);
        background: var(--bright);
    }
    /* `tier_numbers_small_0n` at 140% ui-scale: 8 units tall, 5/7/9/11 wide, 3 from the top. */
    .numeral-art {
        position: absolute;
        top: calc(var(--u) * 4.2);
        right: calc(var(--u) * (5 - var(--n)) * 1.4);
        width: calc(var(--u) * (3 + var(--n) * 2) * 1.4);
        height: calc(var(--u) * 11.2);
        background: var(--off-black);
        mask: var(--numeral) center / 100% 100% no-repeat;
    }
    .chip[data-tier="1"] {
        --n: 1;
    }
    .chip[data-tier="2"] {
        --n: 2;
    }
    .chip[data-tier="3"] {
        --n: 3;
    }
    .chip[data-tier="4"] {
        --n: 4;
    }
    .numeral {
        position: absolute;
        top: calc(var(--u) * 3.5);
        right: calc(var(--u) * 4);
        color: var(--off-black);
        font-family: var(--font-sans);
        font-size: calc(var(--u) * 11);
        font-weight: 700;
        letter-spacing: calc(var(--u) * -0.4);
        line-height: 1;
    }

    .name {
        position: absolute;
        top: calc(var(--u) * 71);
        right: 0;
        bottom: 0;
        left: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 calc(var(--u) * 3);
        color: var(--name-fg);
        font-family: var(--font-heading);
        font-size: calc(var(--u) * var(--name-size, 15));
        font-weight: 600;
        line-height: 0.92;
        text-align: center;
    }
    .chip[data-slot="weapon"][data-tier="3"] .name {
        color: #000;
        text-shadow: 0 0 calc(var(--u) * 12) #aa8470;
    }
    .chip.removed .name {
        top: auto;
        height: calc(var(--u) * 43);
    }
    .name > span {
        display: -webkit-box;
        overflow: hidden;
        overflow-wrap: normal;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
        line-clamp: 3;
    }
</style>
