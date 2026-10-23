<script lang="ts">
    import { gameArt } from "../art";
    import GameIcon from "../item-tooltip/game-icon.svelte";
    import ScalingMarker from "../item-tooltip/scaling-marker.svelte";
    import { iconPaint } from "../item-tooltip/view";
    import AbilityValue from "./ability-value.svelte";
    import type { ChipView } from "./model";

    type Props = {
        chip: ChipView;
        /** `#AbilityProperty_AbilityCooldownBetweenCharge`: a second backer layer, 16 icon, 15 value. */
        between?: boolean;
        /** `#HeaderAttributesContainer AbilityPropertyPanel`: the chips under the name carry a 2 px border. */
        framed?: boolean;
    };

    let { chip, between = false, framed = false }: Props = $props();

    const art = gameArt();
    const paint = $derived(chip.icon ? iconPaint(art().propertyIcons[chip.icon]) : null);
</script>

<!-- A `.HeaderContainer AbilityPropertyPanel`: icon and value only; the name is collapsed. -->
<span
    class="chip"
    class:between
    class:framed
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
        height: round(calc(var(--u) * 34), 1px);
        flex: none;
        align-items: center;
        /* The `.CommonAttribute` wrapper's margin-right 2 plus the panel's own 2 either side. */
        margin: 0 round(calc(var(--u) * 4), 1px) 0 round(calc(var(--u) * 2), 1px);
        /* Measured (Lightning Ball): the game draws the right column's digits 2 px higher than centred at 1440p. */
        padding: 0 calc(var(--u) * 7) round(calc(var(--u) * 3), 1px);
        border-radius: round(calc(var(--u) * 8), 1px);
        background: var(--at-chip);
    }
    /* Measured (Feed The Birds captures): the digits under the name sit 1 px lower than centred at 1440p. */
    .chip.framed {
        padding-top: round(calc(var(--u) * 1.5), 1px);
        padding-bottom: 0;
        border: round(calc(var(--u) * 2), 1px) solid transparent;
    }
    .chip.between {
        background: linear-gradient(var(--at-chip-between), var(--at-chip-between)), var(--at-chip);
    }
    .chip.spirit {
        border-color: var(--at-spirit-border);
        background: var(--at-spirit-fill);
    }
    /* `#AbilityPropertyIcon`: opacity .3, margin-right 4. */
    .icon {
        display: inline-flex;
        margin-right: round(calc(var(--u) * 4), 1px);
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
