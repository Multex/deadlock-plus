<script lang="ts">
    import ImportantCell from "./important-cell.svelte";
    import Markup from "./markup.svelte";
    import type { BlockView } from "./model";
    import StatRow from "./stat-row.svelte";

    type Props = {
        block: BlockView;
        /** The innate section draws its rows bare, with no boxes. */
        innate: boolean;
        bindings?: Partial<Record<string, string>>;
    };

    let { block, innate, bindings }: Props = $props();
</script>

<!-- `AttributesBox`: the description, then `.StatsAppliedBackground` with the cells and the rows box. -->
<div class="block" class:innate>
    {#if block.description.length > 0}
        <p class="description"><Markup nodes={block.description} {bindings} /></p>
    {/if}
    {#if block.showStats}
        <div class="stats {block.layout}" class:no-rows={!block.hasRows}>
            {#if block.cells.length > 0}
                <div class="cells">
                    {#each block.cells as cell (cell.key)}
                        <div class="cell"><ImportantCell {cell} /></div>
                    {/each}
                </div>
            {/if}
            {#if block.hasRows}
                <div class="rows">
                    {#each block.rows as row (row.key)}
                        <div class="row"><StatRow {row} /></div>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
    /*
     * `.ModInfoLabel`: 18 medium #CDCDCD at 135%. The game draws it 1.5 lower and wraps it about 10 short of the
     * boxes below, though its stylesheet sets neither (measured on four captures at 1440p).
     */
    .description {
        margin: 0;
        padding: calc(var(--u) * 1.5) calc(var(--u) * 10) 0 0;
        color: var(--tt-description);
        font-size: round(down, calc(var(--u) * 18 * var(--game-font-scale)), 1px);
        font-weight: 500;
        line-height: calc(var(--u) * 18 * 1.35);
        overflow-wrap: break-word;
    }
    .innate .description {
        margin-bottom: calc(var(--u) * 10);
    }

    /* One cell: the 130 wide cell beside the rows box. */
    .stats {
        display: flex;
        min-height: calc(var(--u) * 80);
        margin-top: calc(var(--u) * 10);
    }
    .cells {
        display: flex;
        width: calc(var(--u) * 130);
        min-height: calc(var(--u) * 80);
        flex: none;
    }
    .cell {
        display: flex;
        min-width: 0;
        flex: 1;
    }
    .one .cell {
        margin-right: calc(var(--u) * 2);
    }
    .rows {
        display: flex;
        box-sizing: border-box;
        min-width: 0;
        min-height: calc(var(--u) * 80);
        flex: 1;
        flex-direction: column;
        padding: calc(var(--u) * 10) calc(var(--u) * 15);
        margin-left: calc(var(--u) * 2);
        background: var(--tt-stats);
    }

    /* `HideImportantAttribute`: rows only, their box centred in at least 40. */
    .none {
        min-height: calc(var(--u) * 40);
        align-items: center;
    }
    .none .rows {
        min-height: 0;
        margin-left: 0;
        background: var(--tt-cell);
    }

    /* `NoAppliedStats`: cells only, across the full width. */
    .no-rows .cells {
        width: 100%;
        justify-content: center;
    }
    .no-rows .cell {
        margin: 0;
    }

    /* `HasMultipleImportantProperties`: cells share a row, the rows wrap two per line below. */
    .several,
    .four {
        flex-direction: column;
    }
    .several .cells,
    .four .cells {
        width: 100%;
    }
    .several .cell + .cell {
        margin-left: calc(var(--u) * 2);
    }
    .several .cell:not(:last-child) {
        margin-right: calc(var(--u) * 2);
    }
    .several .rows,
    .four .rows {
        min-height: 0;
        flex-direction: row;
        flex-wrap: wrap;
        justify-content: space-between;
        margin-top: calc(var(--u) * 3);
        margin-left: 0;
    }
    .several .row,
    .four .row {
        width: 49%;
        padding: calc(var(--u) * 2) 0;
    }

    /* `HasFourImportantProperties`: cells two by two, 70 tall. */
    .four .cells {
        min-height: calc(var(--u) * 140);
        flex-wrap: wrap;
        align-content: flex-start;
    }
    .four .cell {
        width: 49%;
        height: calc(var(--u) * 70);
        flex: none;
    }
    .four .cell:nth-child(odd) {
        margin-right: calc(var(--u) * 2);
    }
    .four .cell:nth-child(even) {
        margin-left: calc(var(--u) * 2);
    }
    .four .cell:nth-child(n + 3) {
        margin-top: calc(var(--u) * 2);
    }

    /* `#AttributesSection_Innate`: no boxes, no padding. */
    .innate .stats {
        margin-top: 0;
    }
    .innate .rows {
        padding: 0;
        background: none;
    }
</style>
