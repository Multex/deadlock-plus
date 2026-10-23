<script lang="ts">
    import ScalingMarker from "../item-tooltip/scaling-marker.svelte";
    import { cssUrl } from "../item-tooltip/view";
    import { gameText } from "../text";
    import AbilityMarkup from "./ability-markup.svelte";
    import AbilityValue from "./ability-value.svelte";
    import type { AbilitySectionView, AbilityTooltipModel } from "./model";
    import PromotedCell from "./promoted-cell.svelte";

    type Props = {
        section: AbilitySectionView;
        text: AbilityTooltipModel["text"];
        bindings?: Partial<Record<string, string>>;
    };

    let { section, text, bindings = {} }: Props = $props();

    const t = gameText();
    const hasCells = $derived(section.groups.some((g) => g.cells.length > 0));
</script>

<!-- `.AbilityPropertiesBlock`: description, imbue list, promoted cells, basic list. -->
<div class="block">
    {#if section.description.length > 0}
        <p class="description"><AbilityMarkup nodes={section.description} {bindings} /></p>
    {/if}
    {#if section.imbued}
        <div class="imbued">
            <span class="imbued-icon" style:--icon={cssUrl(section.imbued.icon)} aria-hidden="true"></span>
            <span class="imbued-label">{t(section.imbued.text)}</span>
        </div>
    {/if}
    {#if hasCells}
        <div class="promoted">
            {#each section.groups as group, g (g)}
                {#each group.cells as cell, c (c)}
                    <PromotedCell {cell} title={c === 0 ? group.title : null} {text} />
                {/each}
            {/each}
        </div>
    {/if}
    {#if section.rows.length > 0}
        <div class="basic">
            {#each section.rows as row (row.key)}
                <div class="row">
                    <AbilityValue value={row.value} />
                    <span class="row-name">{row.label}</span>
                    {#if row.scaling}<span class="row-scaling"><ScalingMarker marker={row.scaling} /></span>{/if}
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    /* A column so the description's margin-bottom and the cells' margin-top add up as Panorama's do. */
    .block {
        display: flex;
        flex-direction: column;
        margin-bottom: round(calc(var(--u) * 5), 1px);
    }
    /* `.PropertiesBlockHeaderLabel`: medium 18 silvered, line-height 130%. */
    .description {
        margin: 0 0 round(calc(var(--u) * 8), 1px);
        color: var(--at-description);
        /* The game draws 23 px with whole-pixel advances (Lightning Ball line 1: 570 px); the browser's
           fractional advances need 1.7% more for the same line widths and breaks. */
        font-size: calc(round(down, calc(var(--u) * 18 * var(--game-font-scale)), 1px) * 1.017);
        font-weight: 500;
        /* 130% of the unrounded size: the capture's lines are 31.5 apart. */
        line-height: calc(var(--u) * 18 * 1.3);
    }
    /* `.ImbueBlock` and `.ImbuedLabel`. The mod icon's size is not in the ability files. */
    .imbued {
        display: flex;
        align-items: center;
        padding: round(calc(var(--u) * 3), 1px);
    }
    .imbued-icon {
        width: round(calc(var(--u) * 32), 1px);
        height: round(calc(var(--u) * 32), 1px);
        flex: none;
        background: var(--icon) center / contain no-repeat;
    }
    .imbued-label {
        margin-left: round(calc(var(--u) * 10), 1px);
        color: var(--at-imbued);
        font-size: round(down, calc(var(--u) * 16 * var(--game-font-scale)), 1px);
        font-style: italic;
        font-weight: 700;
    }
    .promoted {
        display: flex;
        margin-top: round(calc(var(--u) * 5), 1px);
    }
    /* `#BasicPropertiesContainer`: offWhite&08, cells 49% x 35 wrapping two to a row. */
    .basic {
        display: flex;
        flex-wrap: wrap;
        margin: round(calc(var(--u) * 3), 1px) round(calc(var(--u) * 1), 1px) round(calc(var(--u) * 1), 1px)
            round(calc(var(--u) * 2), 1px);
        padding: round(calc(var(--u) * 8), 1px) round(calc(var(--u) * 5), 1px);
        background: var(--at-cell);
    }
    .row {
        --value-size: 17;
        --prefix-size: 15;
        --postfix-size: 15;
        --affix-font: var(--game-font-sans);
        position: relative;
        display: flex;
        box-sizing: border-box;
        width: 49%;
        height: round(calc(var(--u) * 35), 1px);
        align-items: center;
        gap: round(calc(var(--u) * 5), 1px);
        padding: 0 round(calc(var(--u) * 10), 1px);
    }
    .row-name {
        overflow: hidden;
        font-size: var(--at-name-size);
        font-weight: 400;
        opacity: var(--at-name-opacity);
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .row-scaling {
        position: absolute;
        top: round(calc(var(--u) * -8), 1px);
        right: round(calc(var(--u) * -4), 1px);
    }
</style>
