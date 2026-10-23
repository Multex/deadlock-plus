<script lang="ts">
    import type { Snippet } from "svelte";
    import { ItemTooltip } from "@deadlock-plus/game-ui";
    import type { ItemTooltipModel } from "@deadlock-plus/game-ui/item-tooltip/model";
    import { formatNumber, t } from "$lib/core/i18n.svelte";
    import { statText, type StatTotal } from "../../../stats";
    import { TIP_BINDINGS } from "../../shop/item-tips";

    let {
        left,
        top,
        souls,
        level,
        time,
        stats,
        width = $bindable(0),
        height = $bindable(0),
        body = $bindable(0),
        item,
        header,
    }: {
        left: number;
        top: number;
        souls: number;
        level: number | null;
        time: string | null;
        stats: readonly StatTotal[];
        /** The whole readout, the item tooltip's ALT column included. */
        width?: number;
        height?: number;
        /** The readout without the item tooltip's ALT column. */
        body?: number;
        /** The hovered item: its game tooltip sits on top and the timeline's facts take its colours. */
        item?: ItemTooltipModel;
        header?: Snippet;
    } = $props();

    const context = $derived(
        [
            level === null ? null : t("builds.editor.timeline.level", { level }),
            time === null ? null : t("builds.editor.timeline.time", { time }),
        ]
            .filter((part) => part !== null)
            .join(" · "),
    );
</script>

<div
    bind:offsetWidth={width}
    bind:offsetHeight={height}
    class="readout pointer-events-none absolute z-20"
    class:with-item={!!item}
    class:left={item?.details?.side === "left"}
    style:left="{left}px"
    style:top="{top}px"
    style:visibility={height === 0 ? "hidden" : undefined}
    data-slot={item?.header.slot}
    role="tooltip"
    data-testid="timeline-readout"
>
    {#if item}
        <ItemTooltip model={item} bindings={TIP_BINDINGS} />
    {/if}
    <div
        bind:offsetWidth={body}
        class="panel"
        style:min-width={item ? `max(200px, calc(var(--game-ui-scale, 1) * ${item.width}px))` : undefined}
    >
        {#if header && !item}
            <header>{@render header()}</header>
        {/if}
        <div class="facts" class:torn-top={!item && !header}>
            <div class="bar">
                <span class="souls">
                    <svg viewBox="0 0 12 16" aria-hidden="true">
                        <path
                            d="M9.6 3.6C8.9 2.6 7.6 2 6.2 2 4.2 2 2.7 3.2 2.7 4.8c0 3.5 6.7 2.2 6.7 6 0 1.8-1.6 3.2-3.8 3.2-1.6 0-3-.7-3.8-1.9"
                        />
                        <path d="M6 .5v15" />
                    </svg>
                    {t("builds.editor.timeline.souls", { souls: formatNumber(souls) })}
                </span>
                {#if context}<span class="context">{context}</span>{/if}
            </div>
            {#if stats.length > 0}
                <ul class="stats" class:two={stats.length > 8}>
                    {#each stats as stat (`${stat.provides}:${stat.unit}`)}
                        <li>
                            <span class="value"
                                >{statText(stat.total, null, true, formatNumber)}{#if stat.unit}<span class="unit"
                                        >{stat.unit}</span
                                    >{/if}</span
                            >
                            <span class="label">{stat.label}</span>
                        </li>
                    {/each}
                </ul>
            {/if}
        </div>
    </div>
</div>

<style>
    /* The item tooltip's panel, edges and type. Abilities and bare points have no slot, so they take a neutral
       tone at the same lightness as the slot colours. */
    .readout {
        --head-a: #1e1c19;
        --head-b: #35312a;
        --body: #48433a;
        --bar: #1d1b17;
        --off-white: #ffefd7;
        display: flex;
        width: max-content;
        flex-direction: column;
        align-items: flex-start;
        color: var(--off-white);
        font-size: 13px;
        line-height: 1.3;
    }
    .readout[data-slot="weapon"] {
        --body: #785017;
        --bar: #2a210f;
    }
    .readout[data-slot="spirit"] {
        --body: #59407a;
        --bar: #1f1530;
    }
    .readout[data-slot="vitality"] {
        --body: #4c6425;
        --bar: #18220c;
    }

    /* With the ALT column on the left, the main column sits on the right and the facts stay under it. */
    .readout.left {
        align-items: flex-end;
    }

    .panel {
        position: relative;
        min-width: 200px;
        max-width: 30rem;
        filter: drop-shadow(0 6px 14px #000a);
    }
    /* Tucks under the item tooltip's torn bottom edge so the two read as one panel. */
    .with-item .panel {
        margin-top: -6px;
    }

    header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px 8px;
        clip-path: polygon(
            0 4px,
            8% 1px,
            17% 5px,
            29% 0,
            41% 4px,
            55% 1px,
            68% 5px,
            80% 0,
            91% 3px,
            100% 0,
            100% 100%,
            0 100%
        );
        background:
            repeating-linear-gradient(
                -32deg,
                transparent 0 22px,
                color-mix(in oklch, var(--head-b) 70%, #000) 22px 30px,
                transparent 30px 58px
            ),
            linear-gradient(100deg, var(--head-a), var(--head-b));
        font-family: var(--font-heading);
        font-size: 18px;
        font-weight: 700;
        line-height: 1.05;
        text-shadow: 0 2px 0 #0006;
    }

    .facts {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 10px 14px 14px;
        clip-path: polygon(
            0 0,
            100% 0,
            100% calc(100% - 3px),
            88% 100%,
            74% calc(100% - 4px),
            60% calc(100% - 1px),
            47% calc(100% - 5px),
            33% 100%,
            19% calc(100% - 3px),
            7% calc(100% - 1px),
            0 calc(100% - 4px)
        );
        background: var(--body);
    }
    .with-item .facts {
        padding-top: 6px;
    }
    .facts.torn-top {
        padding-top: 14px;
        clip-path: polygon(
            0 4px,
            8% 1px,
            17% 5px,
            29% 0,
            41% 4px,
            55% 1px,
            68% 5px,
            80% 0,
            91% 3px,
            100% 0,
            100% calc(100% - 3px),
            88% 100%,
            74% calc(100% - 4px),
            60% calc(100% - 1px),
            47% calc(100% - 5px),
            33% 100%,
            19% calc(100% - 3px),
            7% calc(100% - 1px),
            0 calc(100% - 4px)
        );
    }

    .bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 3px 8px;
        background: var(--bar);
        color: color-mix(in oklch, var(--off-white) 85%, transparent);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        white-space: nowrap;
    }
    .souls {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: #9affd6;
        font-variant-numeric: tabular-nums;
    }
    .souls svg {
        width: 8px;
        height: 11px;
        fill: none;
        stroke: currentColor;
        stroke-linecap: round;
        stroke-width: 2.2;
    }
    .context {
        font-variant-numeric: tabular-nums;
    }

    .stats {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 2px 14px;
        padding: 0 4px;
    }
    .stats.two {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .stats li {
        display: flex;
        align-items: baseline;
        gap: 6px;
        min-width: 0;
    }
    .value {
        flex: none;
        font-family: var(--font-heading);
        font-size: 15px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
    }
    .unit {
        margin-left: 1px;
        color: color-mix(in oklch, var(--off-white) 62%, transparent);
        font-size: 12px;
    }
    .label {
        overflow: hidden;
        font-weight: 600;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>
