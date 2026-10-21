<script lang="ts">
    import { gameArt } from "../art";
    import { gameText } from "../text";
    import GameIcon from "./game-icon.svelte";
    import type { ImportantCell, ItemTooltipModel, StatusCell } from "./model";
    import ModifiedArrow from "./modified-arrow.svelte";
    import ScalingMarker from "./scaling-marker.svelte";
    import ValueText from "./value-text.svelte";
    import { cellValueSize, iconPaint, roleColor } from "./view";

    type Props = { cell: ImportantCell | StatusCell; text: ItemTooltipModel["text"] };

    let { cell, text }: Props = $props();

    const art = gameArt();
    const t = gameText();
    const paint = $derived(cell.icon ? iconPaint(art().propertyIcons[cell.icon]) : null);
    const color = $derived(roleColor(cell.role));
</script>

{#if cell.kind === "status"}
    <div class="cell status" style:--role={color} class:tinted={cell.role !== "default"}>
        <span class="status-type">
            <span class="icon"><GameIcon {paint} size={20} fallback={color} /></span>
            {#if cell.duration}<span class="duration"><ValueText value={cell.duration} /></span>{/if}
            <span class="type">{cell.label}</span>
        </span>
    </div>
{:else}
    <div class="cell" style:--role={color} class:tinted={cell.role !== "default"} class:negative={cell.negative}>
        {#if cell.scaling}<span class="scaling"><ScalingMarker marker={cell.scaling} /></span>{/if}
        <span class="value-row">
            <span class="icon"><GameIcon {paint} size={20} fallback={color} /></span>
            <span class="value" style:font-size="calc(var(--u) * {cellValueSize(cell.value)})"
                ><ValueText value={cell.value} /></span
            >
            {#if cell.scaled}<ModifiedArrow />{/if}
        </span>
        <span class="type">{cell.label}</span>
        {#if cell.conditional}<span class="note">{t(text.conditional)}</span>{/if}
        {#if cell.variesByHero}<span class="note">{t(text.variesByHero)}</span>{/if}
    </div>
{/if}

<style>
    /* `.ImportantStatBox`: #00000060, its content centred both ways. */
    .cell {
        position: relative;
        display: flex;
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: var(--tt-cell);
    }
    .scaling {
        position: absolute;
        top: calc(var(--u) * -2);
        right: 0;
    }
    .value-row {
        display: flex;
        align-items: center;
        margin-bottom: calc(var(--u) * -5);
    }
    .icon {
        display: inline-flex;
        margin-right: calc(var(--u) * 3);
    }
    /* `#ImportantStatValue`: white oracle bold 22. */
    .value {
        max-width: calc(var(--u) * 90);
        color: #ffffff;
        font-family: var(--game-font-oracle);
        font-weight: 700;
        text-shadow: calc(var(--u) * 1) calc(var(--u) * 1) 0 var(--tt-text-shadow);
        white-space: nowrap;
    }
    .negative .value {
        color: var(--tt-negative-value);
        --tt-affix: var(--tt-negative-value);
    }
    /* `.ImportantStatType`: 16 medium, line-height 16, at most 40 tall. */
    .type {
        display: -webkit-box;
        max-height: calc(var(--u) * 40);
        overflow: hidden;
        padding: 0 calc(var(--u) * 2);
        color: var(--role);
        font-size: calc(var(--u) * 16);
        font-weight: 500;
        line-height: calc(var(--u) * 16);
        text-align: center;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        line-clamp: 2;
    }
    .tinted .type {
        font-weight: 600;
    }
    /* `.ImportantStatLabel`: italic semi-bold 16 at 0.3. */
    .note {
        width: 100%;
        font-size: calc(var(--u) * 16);
        font-style: italic;
        font-weight: 600;
        line-height: calc(var(--u) * 18);
        opacity: var(--tt-conditional);
        text-align: center;
    }

    /* `.StatusEffectBox`: icon and a bold 20 type, left aligned. */
    .status-type {
        display: flex;
        align-items: center;
        gap: 0 calc(var(--u) * 5);
    }
    .status .icon {
        margin-right: 0;
    }
    .status .type,
    .duration {
        margin: 0;
        font-size: calc(var(--u) * 20);
        font-weight: 700;
        line-height: 1.2;
        text-align: left;
    }
    .duration {
        color: var(--role);
        font-family: var(--game-font-oracle);
    }
    .status.tinted .type {
        font-weight: 600;
    }
</style>
