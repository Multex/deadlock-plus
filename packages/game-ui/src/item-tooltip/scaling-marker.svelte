<script lang="ts">
    import { gameArt } from "../art";
    import type { ScalingMarker } from "./model";
    import { cssUrl, scalingArt, scalingColor } from "./view";

    type Props = {
        marker: ScalingMarker;
        /** On one line after a stat row's name, instead of the cell corner's arrow-over-factor stack. */
        inline?: boolean;
    };

    let { marker, inline = false }: Props = $props();

    const art = gameArt();
    const arrow = $derived(marker.arrow ? cssUrl(art().ui[scalingArt(marker.arrow)]) : undefined);
</script>

<!-- `CitadelStatScalingLabel` at the 80% ui-scale `#ScalingStatValue` draws it with. -->
<span class="marker" class:inline style:--stat={scalingColor(marker.arrow)}>
    <span class="arrow" class:fallback={!arrow} style:--arrow={arrow} aria-hidden="true"></span>
    <span class="amount"><span class="x">x</span><span class="factor">{marker.factor}</span></span>
</span>

<style>
    .marker {
        display: inline-flex;
        flex-direction: column;
        align-items: flex-end;
        zoom: 0.8;
        line-height: 1;
    }
    .marker.inline {
        flex-direction: row-reverse;
        align-items: center;
        vertical-align: middle;
    }
    /* `.AbilityPanelStat .ScalingStatImage`: 36 x 27, right aligned. */
    .arrow {
        width: calc(var(--u, 1px) * 36);
        height: calc(var(--u, 1px) * 27);
        margin-top: calc(var(--u, 1px) * 2);
        margin-right: calc(var(--u, 1px) * 1);
        background: var(--arrow) right center / contain no-repeat;
    }
    .inline .arrow {
        width: calc(var(--u, 1px) * 24);
        height: calc(var(--u, 1px) * 18);
        margin: 0 0 0 calc(var(--u, 1px) * 2);
    }
    .arrow.fallback {
        width: calc(var(--u, 1px) * 14);
        background: var(--stat);
        clip-path: polygon(50% 10%, 100% 55%, 70% 55%, 70% 90%, 30% 90%, 30% 55%, 0 55%);
    }
    .amount {
        display: flex;
        align-items: baseline;
        margin: calc(var(--u, 1px) * -5) calc(var(--u, 1px) * 1) 0 calc(var(--u, 1px) * 4);
        text-shadow: 0 0 calc(var(--u, 1px) * 3) var(--game-off-black, #10130d);
        white-space: nowrap;
    }
    .inline .amount {
        margin: 0 0 0 calc(var(--u, 1px) * 4);
    }
    /* `.ScalingStatAltMultiply`: the Label default 18, oracle bold italic at 0.8 opacity. */
    .x {
        margin-bottom: calc(var(--u, 1px) * 2);
        color: var(--tt-scaling-x);
        font-family: var(--game-font-oracle);
        font-size: calc(var(--u, 1px) * 18);
        font-style: italic;
        font-weight: 700;
        opacity: var(--tt-scaling-x-opacity);
    }
    .factor {
        color: var(--stat);
        font-family: var(--game-font-sans);
        font-size: calc(var(--u, 1px) * 14);
        font-weight: 600;
    }
</style>
