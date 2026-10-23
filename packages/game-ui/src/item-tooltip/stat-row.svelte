<script lang="ts">
    import type { StatRow } from "./model";
    import ModifiedArrow from "./modified-arrow.svelte";
    import ScalingMarker from "./scaling-marker.svelte";
    import { shrinkToFit } from "./shrink";
    import ValueText from "./value-text.svelte";

    let { row }: { row: StatRow } = $props();
</script>

<!-- `CitadelModifiedAttributeLabel` in `#StatsAppliedContainer`: a bold oracle value, then the name, on one line. -->
<div class="row" class:elevated={row.elevated} class:negative={row.negative}>
    {#if row.value}<span class="value"
            ><ValueText value={row.value} />{#if row.variesByHero}<span class="mark" aria-hidden="true">*</span
                >{/if}</span
        >{/if}
    <span class="name" use:shrinkToFit={row.label}>{row.label}</span>
    {#if row.scaled}<ModifiedArrow />{/if}
    {#if row.scaling}<ScalingMarker marker={row.scaling} inline />{/if}
</div>

<style>
    /* `#AdditionalText` is 23 tall and shrinks rather than wraps: the row never takes a second line. */
    .row {
        display: flex;
        min-height: calc(var(--u) * 23);
        align-items: center;
        font-size: round(down, calc(var(--u) * 18 * var(--game-font-scale)), 1px);
        white-space: nowrap;
    }
    .value {
        margin-right: calc(var(--u) * 5);
        font-family: var(--game-font-oracle);
        font-weight: 700;
        line-height: calc(var(--u) * 18 * var(--tt-oracle-line));
        text-shadow: calc(var(--u) * 1) calc(var(--u) * 1) 0 var(--tt-text-shadow);
        white-space: nowrap;
    }
    .negative .value {
        color: var(--tt-negative-value);
        --tt-affix: var(--tt-negative-value);
    }
    /* `#StatsAppliedContainer #AdditionalText`: white 18 medium at 0.5. Its `text-overflow: shrink` also fits the
       face's line box into the 23 tall label, so 18 draws 22 px at 1440p, not 23 (Ability Range, Incoming Healing,
       Out of Combat Regen). */
    .name {
        min-width: 0;
        overflow: hidden;
        color: #ffffff;
        font-size: round(
            down,
            min(
                calc(var(--u) * 18 * var(--game-font-scale)),
                calc(var(--u) * 23 / var(--game-font-sans-leading, 1.343))
            ),
            1px
        );
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
