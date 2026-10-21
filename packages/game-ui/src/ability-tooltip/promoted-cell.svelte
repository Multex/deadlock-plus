<script lang="ts">
    import { gameArt } from "../art";
    import GameIcon from "../item-tooltip/game-icon.svelte";
    import ScalingMarker from "../item-tooltip/scaling-marker.svelte";
    import { iconPaint } from "../item-tooltip/view";
    import { gameText } from "../text";
    import AbilityValue from "./ability-value.svelte";
    import type { AbilityTooltipModel, PromotedCellView, StatusCellView } from "./model";

    type Props = {
        cell: PromotedCellView | StatusCellView;
        /** The cell group's `SectionText`, drawn on its first cell. */
        title?: string | null;
        text: AbilityTooltipModel["text"];
    };

    let { cell, title = null, text }: Props = $props();

    const art = gameArt();
    const t = gameText();
    const paint = $derived(cell.icon ? iconPaint(art().propertyIcons[cell.icon]) : null);
    const style = $derived(cell.kind === "value" ? cell.style : null);
</script>

<!-- `#PromotedPropertiesContainer AbilityPropertyPanel`: 85 tall, its box 73 under a 12 margin. -->
<div class="panel">
    {#if title}<span class="title">{title}</span>{/if}
    <div class="box" class:spirit={style === "spirit"} class:weapon={style === "weapon"} class:boon={style === "boon"}>
        {#if cell.kind === "status"}
            <span class="line">
                <span class="icon"><GameIcon {paint} size={20} /></span>
                <span class="status-type">{cell.label}</span>
            </span>
            {#if cell.value}
                <span class="line status-value"><AbilityValue value={cell.value} /></span>
            {:else}
                <span class="status-note">{t(text.statusEffect)}</span>
            {/if}
        {:else}
            <span class="line">
                <span class="icon"><GameIcon {paint} size={20} /></span>
                <AbilityValue value={cell.value} />
            </span>
            <span class="name">{cell.label}</span>
        {/if}
    </div>
    {#if cell.kind === "value" && cell.scaling}
        <span class="scaling"><ScalingMarker marker={cell.scaling} /></span>
    {/if}
</div>

<style>
    .panel {
        position: relative;
        display: flex;
        min-width: 0;
        height: calc(var(--u) * 85);
        flex: 1 1 0;
        flex-direction: column;
        justify-content: flex-end;
        margin: 0 calc(var(--u) * 2);
    }
    /* `.SectionText`: uppercase #909090 bold 14, margin-top -5. */
    .title {
        position: absolute;
        top: calc(var(--u) * -5);
        left: 0;
        color: var(--at-group-title);
        font-size: calc(var(--u) * 14);
        font-weight: 700;
        line-height: 1;
        text-transform: uppercase;
        white-space: nowrap;
    }
    /* `.AbilityPropertyContainer`: offWhite&08, content centred both ways. */
    .box {
        display: flex;
        box-sizing: border-box;
        height: calc(var(--u) * 73);
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: var(--at-cell);
    }
    .box.spirit {
        border: calc(var(--u) * 2) solid var(--at-spirit-border);
        background: var(--at-spirit-fill);
    }
    .box.weapon {
        border: calc(var(--u) * 2) solid var(--at-weapon-border);
        background: var(--at-weapon-fill);
    }
    .box.boon {
        border: calc(var(--u) * 2) solid var(--at-boon-border);
        background: var(--at-boon-fill);
    }
    .line {
        display: flex;
        align-items: center;
        max-width: 100%;
    }
    .icon {
        display: inline-flex;
        margin-right: calc(var(--u) * 4);
        opacity: var(--at-icon-opacity);
    }
    .icon:empty {
        display: none;
    }
    /* `.AbilityPropertyName`: semi-bold 17 at .8, one line. */
    .name {
        max-width: 100%;
        overflow: hidden;
        font-size: calc(var(--u) * 17);
        font-weight: 600;
        line-height: calc(var(--u) * 20);
        opacity: var(--at-name-opacity);
        text-align: center;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    /* `.StatusEffectType`: bold 20. */
    .status-type {
        font-size: calc(var(--u) * 20);
        font-weight: 700;
        white-space: nowrap;
    }
    /* `.IsStatusEffect .CurrentValue`: 17, margins 0 5. */
    .status-value {
        --value-size: 17;
        margin: 0 calc(var(--u) * 5);
    }
    /* `.StatusEffectLabel`: semi-bold italic 17 at .5. */
    .status-note {
        font-size: calc(var(--u) * 17);
        font-style: italic;
        font-weight: 600;
        opacity: var(--at-status-opacity);
    }
    .scaling {
        position: absolute;
        top: 0;
        right: 0;
    }
</style>
