<script lang="ts">
    import { Info } from "@lucide/svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { formatNumber, t } from "$lib/core/i18n.svelte";

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

    // Labels are at most about 28 px wide: clamping their centre this far in keeps both edges inside.
    const LABEL_HALF = 16;
    const labelLeft = (netWorth: number) => Math.min(width - LABEL_HALF, Math.max(LABEL_HALF, x(netWorth)));
</script>

{#each ticks as tick (tick)}
    <span
        class="absolute top-0 w-px bg-border/45"
        style:left="{x(tick)}px"
        style:height="{gridBottom}px"
        aria-hidden="true"
    ></span>
{/each}

<span class="absolute h-px bg-border" style:left="{x(0)}px" style:right="{width - x(Infinity)}px" style:top="{axisY}px"
></span>

{#each apTicks as tick (tick)}
    <span
        class="absolute h-[5px] w-px -translate-y-1/2 bg-muted-foreground/30"
        style:left="{x(tick)}px"
        style:top="{axisY}px"
        aria-hidden="true"
    ></span>
{/each}

{#each ticks as tick (tick)}
    {@const time = timeAt(tick)}
    <span
        class="absolute flex -translate-x-1/2 flex-col items-center text-[10px] leading-[11px] tabular-nums"
        style:left="{labelLeft(tick)}px"
        style:top="{labelsY}px"
        data-testid="timeline-tick"
    >
        <span class="font-medium text-muted-foreground">{formatNumber(tick, { notation: "compact" })}</span>
        {#if time !== null}
            <span class="text-muted-foreground/60">{time}</span>
        {/if}
    </span>
{/each}

<Tooltip.Provider>
    <Tooltip.Root delayDuration={150}>
        <Tooltip.Trigger>
            {#snippet child({ props })}
                <Button
                    {...props}
                    variant="unstyled"
                    aria-label={t("builds.editor.timeline.about")}
                    data-timeline-info
                    class="absolute left-1 grid size-4 place-items-center rounded-full text-muted-foreground/60 hover:text-foreground focus-visible:text-foreground"
                    style="top: {labelsY}px"
                >
                    <Info class="size-3.5" />
                </Button>
            {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="top" align="start" class="max-w-64">
            {t("builds.editor.timeline.assumption")}
        </Tooltip.Content>
    </Tooltip.Root>
</Tooltip.Provider>
