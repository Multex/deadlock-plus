<script lang="ts">
    import { formatNumber } from "$lib/core/i18n.svelte";

    let {
        ticks,
        apTicks,
        x,
        width,
        axisY,
        gridBottom,
        labelsY,
        timeAt,
    }: {
        ticks: readonly number[];
        apTicks: readonly number[];
        /** Px position of a net worth inside the strip. */
        x: (netWorth: number) => number;
        width: number;
        axisY: number;
        gridBottom: number;
        labelsY: number;
        /** "5:00" for a net worth, or null without the hero's curve. */
        timeAt: (netWorth: number) => string | null;
    } = $props();

    // Labels are at most about 36 px wide ("17:30" at 11 px): clamping their centre this far in keeps both edges inside.
    const LABEL_HALF = 20;
    const labelLeft = (netWorth: number) => Math.min(width - LABEL_HALF, Math.max(LABEL_HALF, x(netWorth)));
</script>

{#each ticks as tick (tick)}
    <span
        class="absolute top-0 w-px bg-border/60"
        style:left="{x(tick)}px"
        style:height="{gridBottom}px"
        aria-hidden="true"
    ></span>
{/each}

<span class="absolute h-px bg-border" style:left="{x(0)}px" style:right="{width - x(Infinity)}px" style:top="{axisY}px"
></span>

{#each apTicks as tick (tick)}
    <span
        class="absolute h-[7px] w-px -translate-y-1/2 bg-muted-foreground/35"
        style:left="{x(tick)}px"
        style:top="{axisY}px"
        aria-hidden="true"
    ></span>
{/each}

{#each ticks as tick (tick)}
    {@const time = timeAt(tick)}
    <span
        class="absolute flex -translate-x-1/2 flex-col items-center tabular-nums"
        style:left="{labelLeft(tick)}px"
        style:top="{labelsY}px"
        data-testid="timeline-tick"
    >
        <span class="text-xs leading-[14px] font-semibold text-muted-foreground">
            {formatNumber(tick, { notation: "compact" })}
        </span>
        {#if time !== null}
            <span class="text-[11px] leading-[13px] text-muted-foreground">{time}</span>
        {/if}
    </span>
{/each}
