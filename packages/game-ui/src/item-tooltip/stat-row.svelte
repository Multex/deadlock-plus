<script lang="ts">
    import type { StatRow } from "./model";
    import ModifiedArrow from "./modified-arrow.svelte";
    import ScalingMarker from "./scaling-marker.svelte";
    import ValueText from "./value-text.svelte";

    let { row }: { row: StatRow } = $props();
</script>

<!-- `CitadelModifiedAttributeLabel` in `#StatsAppliedContainer`: a bold oracle value, then the name, on one line. -->
<div class="row" class:elevated={row.elevated} class:negative={row.negative}>
    {#if row.value}<span class="value"
            ><ValueText value={row.value} />{#if row.variesByHero}<span class="mark" aria-hidden="true">*</span
                >{/if}</span
        >{/if}
    <span class="name">{row.label}</span>
    {#if row.scaled}<ModifiedArrow />{/if}
    {#if row.scaling}<ScalingMarker marker={row.scaling} inline />{/if}
</div>

<style>
    /* `#AdditionalText` is 23 tall and shrinks rather than wraps: the row never takes a second line. */
    .row {
        display: flex;
        min-height: calc(var(--u) * 23);
        align-items: center;
        font-size: calc(var(--u) * 18);
        white-space: nowrap;
    }
    .value {
        margin-right: calc(var(--u) * 5);
        font-family: var(--game-font-oracle);
        font-weight: 700;
        line-height: var(--tt-oracle-line);
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
    /* Points at the tooltip's "varies by hero" footnote; not a game mark. */
    .mark {
        color: var(--tt-affix);
        font-size: 0.75em;
        vertical-align: super;
        line-height: 0;
    }
</style>
