<script lang="ts">
    import { gameText } from "../text";
    import type { ItemTooltipModel, StatRow } from "./model";
    import ModifiedArrow from "./modified-arrow.svelte";
    import ScalingMarker from "./scaling-marker.svelte";
    import ValueText from "./value-text.svelte";

    type Props = { row: StatRow; text: ItemTooltipModel["text"] };

    let { row, text }: Props = $props();

    const t = gameText();
</script>

<!-- `CitadelModifiedAttributeLabel` in `#StatsAppliedContainer`: a bold oracle value, then the name. -->
<div class="row" class:elevated={row.elevated} class:negative={row.negative}>
    {#if row.value}<span class="value"><ValueText value={row.value} /></span>{/if}
    <span class="name">{row.label}</span>
    {#if row.scaled}<ModifiedArrow />{/if}
    {#if row.scaling}<ScalingMarker marker={row.scaling} inline />{/if}
    {#if row.conditional}<span class="note">{t(text.conditional)}</span>{/if}
    {#if row.variesByHero}<span class="note">{t(text.variesByHero)}</span>{/if}
</div>

<style>
    .row {
        display: flex;
        min-height: calc(var(--u) * 23);
        flex-wrap: wrap;
        align-items: center;
        font-size: calc(var(--u) * 18);
    }
    .value {
        margin-right: calc(var(--u) * 5);
        font-family: var(--game-font-oracle);
        font-weight: 700;
        text-shadow: calc(var(--u) * 1) calc(var(--u) * 1) 0 var(--tt-text-shadow);
        white-space: nowrap;
    }
    .negative .value {
        color: var(--tt-negative-value);
        --tt-affix: var(--tt-negative-value);
    }
    /* `#StatsAppliedContainer #AdditionalText`: white 18 medium at 0.5. */
    .name {
        color: #ffffff;
        font-weight: 500;
        opacity: var(--tt-row-name-opacity);
        text-shadow: calc(var(--u) * 1) calc(var(--u) * 1) 0 var(--tt-text-shadow);
    }
    /* `.Elevated`: 105% ui-scale, bold, the name at full opacity. */
    .elevated {
        margin-bottom: calc(var(--u) * 2);
        zoom: 1.05;
    }
    .elevated .name {
        font-weight: 700;
        opacity: 1;
    }
    .note {
        margin-left: calc(var(--u) * 6);
        font-size: calc(var(--u) * 16);
        font-style: italic;
        font-weight: 600;
        opacity: var(--tt-conditional);
    }
</style>
