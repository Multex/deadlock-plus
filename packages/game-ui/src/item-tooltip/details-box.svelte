<script lang="ts">
    import { gameArt } from "../art";
    import type { ItemSlot } from "../item";
    import { gameText } from "../text";
    import type { ItemTooltipModel } from "./model";
    import { cssUrl } from "./view";

    type Props = {
        details: NonNullable<ItemTooltipModel["details"]>;
        slot: ItemSlot;
        /** The ALT key's label; the box shows no key without one. */
        keyLabel?: string;
    };

    let { details, slot, keyLabel }: Props = $props();

    const art = gameArt();
    const t = gameText();
    const band = $derived(cssUrl(art().ui[`tooltip_header_${slot}`]));
</script>

<!-- `.AffectedAbilitiesContainer`: the 350 wide ALT column, here only its `#ViewImpactBox` prompt. -->
<div class="column" class:left={details.side === "left"}>
    <div class="box" class:spirit={slot === "spirit"} style:--band={band}>
        <span class="label">{t(details.label)}</span>
        {#if keyLabel}<kbd class="key">{keyLabel}</kbd>{/if}
    </div>
</div>

<style>
    .column {
        position: relative;
        z-index: -1;
        display: flex;
        width: calc(var(--u) * 350);
        flex: none;
        align-items: center;
        margin-top: calc(var(--u) * 26);
        margin-left: calc(var(--u) * -15);
    }
    /* Opening left of its anchor, the column sits left of the main one and tucks 2 under it. */
    .column.left {
        justify-content: flex-end;
        margin-right: calc(var(--u) * -2);
        margin-left: 0;
    }
    /* `#ViewImpactBox`: 80 tall, 2 px #00000070 border, the slot's dark colour under its header band. */
    .box {
        position: relative;
        display: flex;
        box-sizing: border-box;
        height: calc(var(--u) * 80);
        flex-direction: column;
        justify-content: center;
        padding: calc(var(--u) * 10) calc(var(--u) * 10) calc(var(--u) * 10) calc(var(--u) * 20);
        border: calc(var(--u) * 2) solid var(--tt-details-border);
        background: var(--tt-slot-dark);
        animation: flash 2s infinite;
    }
    .box::before {
        position: absolute;
        z-index: 0;
        background: var(--band, none) center / cover no-repeat;
        content: "";
        inset: 0;
        opacity: 0.6;
        animation: band 2s infinite;
    }
    .spirit::before {
        filter: brightness(1.5);
    }
    .label,
    .key {
        position: relative;
        z-index: 1;
    }
    .label {
        margin-bottom: calc(var(--u) * 2);
        font-family: var(--game-font-oracle);
        font-size: calc(var(--u) * 16);
        font-weight: 700;
        text-shadow: 0 0 calc(var(--u) * 3) #000000;
        white-space: nowrap;
    }
    .key {
        align-self: center;
        padding: 0 calc(var(--u) * 6);
        border: calc(var(--u) * 1) solid currentColor;
        border-radius: calc(var(--u) * 3);
        font-family: var(--game-font-sans);
        font-size: calc(var(--u) * 14);
        font-weight: 700;
        text-transform: uppercase;
    }
    .left .box {
        padding: calc(var(--u) * 10) calc(var(--u) * 20) calc(var(--u) * 10) calc(var(--u) * 10);
    }

    /* `viewDetailsFlash`. */
    @keyframes flash {
        50% {
            filter: brightness(1.2);
        }
    }
    @keyframes band {
        50% {
            opacity: 1;
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .box,
        .box::before {
            animation: none;
        }
    }
</style>
