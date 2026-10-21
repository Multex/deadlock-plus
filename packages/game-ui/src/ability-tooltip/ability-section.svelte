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
    .block {
        margin-bottom: calc(var(--u) * 5);
    }
    /* `.PropertiesBlockHeaderLabel`: medium 18 silvered, line-height 130%. */
    .description {
        margin: 0 0 calc(var(--u) * 8);
        color: var(--at-description);
        font-size: calc(var(--u) * 18);
        font-weight: 500;
        line-height: 1.3;
    }
    /* `.ImbueBlock` and `.ImbuedLabel`. The mod icon's size is not in the ability files. */
    .imbued {
        display: flex;
        align-items: center;
        padding: calc(var(--u) * 3);
    }
    .imbued-icon {
        width: calc(var(--u) * 32);
        height: calc(var(--u) * 32);
        flex: none;
        background: var(--icon) center / contain no-repeat;
    }
    .imbued-label {
        margin-left: calc(var(--u) * 10);
        color: var(--at-imbued);
        font-size: calc(var(--u) * 16);
        font-style: italic;
        font-weight: 700;
    }
    .promoted {
        display: flex;
        margin-top: calc(var(--u) * 5);
    }
    /* `#BasicPropertiesContainer`: offWhite&08, cells 49% x 35 wrapping two to a row. */
    .basic {
        display: flex;
        flex-wrap: wrap;
        margin: calc(var(--u) * 3) calc(var(--u) * 1) calc(var(--u) * 1) calc(var(--u) * 2);
        padding: calc(var(--u) * 8) calc(var(--u) * 5);
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
        height: calc(var(--u) * 35);
        align-items: center;
        gap: calc(var(--u) * 5);
        padding: 0 calc(var(--u) * 10);
    }
    .row-name {
        overflow: hidden;
        font-size: calc(var(--u) * 17);
        font-weight: 400;
        opacity: var(--at-name-opacity);
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .row-scaling {
        position: absolute;
        top: calc(var(--u) * -8);
        right: calc(var(--u) * -4);
    }
</style>
