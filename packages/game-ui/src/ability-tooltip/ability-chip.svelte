<script lang="ts">
    import { gameArt } from "../art";
    import GameIcon from "../item-tooltip/game-icon.svelte";
    import ScalingMarker from "../item-tooltip/scaling-marker.svelte";
    import { iconPaint } from "../item-tooltip/view";
    import AbilityValue from "./ability-value.svelte";
    import type { ChipView } from "./model";

    type Props = {
        chip: ChipView;
        /** `#AbilityProperty_AbilityCooldownBetweenCharge`: a dimmer backer, 16 icon, 15 value. */
        between?: boolean;
    };

    let { chip, between = false }: Props = $props();

    const art = gameArt();
    const paint = $derived(chip.icon ? iconPaint(art().propertyIcons[chip.icon]) : null);
</script>

<!-- A `.HeaderContainer AbilityPropertyPanel`: icon and value only; the name is collapsed. -->
<span
    class="chip"
    class:between
    class:spirit={chip.style === "spirit"}
    style:--value-size={between ? 15 : 17}
    title={chip.label}
>
    <span class="icon"><GameIcon {paint} size={between ? 16 : 20} /></span>
    <AbilityValue value={chip.value} />
    {#if chip.scaling}<span class="scaling"><ScalingMarker marker={chip.scaling} /></span>{/if}
</span>

<style>
    .chip {
        --prefix-size: 14;
        --postfix-size: 15;
        --affix-font: var(--game-font-sans);
        position: relative;
        display: inline-flex;
        box-sizing: border-box;
        height: calc(var(--u) * 34);
        flex: none;
        align-items: center;
        margin-right: calc(var(--u) * 2);
        padding: 0 calc(var(--u) * 7);
        border: calc(var(--u) * 2) solid transparent;
        border-radius: calc(var(--u) * 8);
        background: var(--at-chip);
    }
    .chip.between {
        background: var(--at-chip-dim);
    }
    .chip.spirit {
        border-color: var(--at-spirit-border);
        background: var(--at-spirit-fill);
    }
    /* `#AbilityPropertyIcon`: opacity .3, margin-right 4. */
    .icon {
        display: inline-flex;
        margin-right: calc(var(--u) * 4);
        opacity: var(--at-icon-opacity);
    }
    .icon:empty {
        display: none;
    }
    .scaling {
        position: absolute;
        top: 0;
        right: 0;
    }
</style>
