<script lang="ts">
    import { Info } from "@lucide/svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { cn } from "@deadlock-plus/ui/utils";
    import { deadlockApi } from "$lib/core/deadlock-api";
    import { t } from "$lib/core/i18n.svelte";
    import { stats } from "$lib/features/stats/stats.svelte";
    import type { HeroKit } from "../../build-detail.svelte";
    import type { ShopCatalog } from "../../catalog";
    import { addItems, moveItems } from "../../editor/document";
    import { drag, type DragState } from "../../editor/drag.svelte";
    import type { BuildEditor } from "../../editor/editor.svelte";
    import {
        apTicks,
        breakpoints,
        dropRef,
        formatClock,
        levelAt,
        loadNetWorthCurve,
        packLane,
        placeItems,
        soulScale,
        soulTicks,
        statsAt,
        timeFor,
        timelineEnd,
        timelineLayout,
        timelineSize,
        type NetWorthCurve,
    } from "../../editor/timeline";
    import type { Level } from "../../levels";
    import type { StatsById } from "../../stats";
    import AbilityArt from "./ability-bar/ability-art.svelte";
    import TierPips from "./ability-bar/tier-pips.svelte";
    import TimelineAxis from "./timeline/timeline-axis.svelte";
    import TimelineReadout from "./timeline/timeline-readout.svelte";

    let {
        editor,
        catalog,
        statsById,
        kit,
        levels,
        badge,
    }: {
        editor: BuildEditor;
        catalog: ShopCatalog;
        statsById: StatsById;
        kit: HeroKit;
        levels: readonly Level[];
        /** The user's rank badge; defaults to the one Stats loaded. Unknown compares against every rank. */
        badge?: number | null;
    } = $props();

    // The left gutter holds the lane labels; the scale starts after it.
    const GUTTER = 80;
    const PAD = 20;
    const TICK_GAP = 64;

    let windowHeight = $state(1080);
    const size = $derived(timelineSize(windowHeight));
    const layout = $derived(timelineLayout(size));

    const entries = $derived(placeItems(editor.build, catalog.byId));
    const marks = $derived(breakpoints(editor.build.abilityOrder, levels));
    const end = $derived(timelineEnd(entries, marks, levels));
    const scale = $derived(soulScale(end));

    let width = $state(0);
    const inner = $derived(Math.max(0, width - GUTTER - PAD));
    const x = (netWorth: number) => GUTTER + scale.at(netWorth) * inner;

    const items = $derived.by(() => {
        if (width <= 0) return [];
        const packed = packLane(
            entries.map((e) => x(e.netWorth)),
            { size: size.item, gap: size.gap, width, rows: size.rows },
        );
        return entries.map((entry, i) => ({
            entry,
            at: x(entry.netWorth),
            ...packed[i]!,
            item: catalog.byId.get(entry.abilityId),
        }));
    });
    const steps = $derived.by(() => {
        if (width <= 0) return [];
        const packed = packLane(
            marks.map((m) => x(m.netWorth)),
            { size: size.mark, gap: size.gap, width, rows: 1 },
        );
        return marks.map((mark, i) => ({ mark, at: x(mark.netWorth), x: packed[i]!.x }));
    });

    const itemTop = (row: number) => layout.itemsBottom - size.item - row * (size.item + size.gap);

    const ticks = $derived(inner > 0 ? soulTicks(end, inner, TICK_GAP) : []);
    const apMarks = $derived(apTicks(levels, end));

    const stepLabel = (abilityId: number, tier: number) => {
        const name = kit.abilities.get(abilityId)?.name ?? "";
        return tier === 0
            ? t("builds.editor.timeline.step_unlock", { name })
            : t("builds.editor.timeline.step_tier", { name, tier });
    };

    let curve = $state.raw<NetWorthCurve | null>(null);
    $effect(() => {
        const heroId = editor.build.heroId;
        const rank = badge ?? stats.rankInfo?.badge ?? null;
        let live = true;
        curve = null;
        loadNetWorthCurve(deadlockApi, heroId, rank).then(
            (loaded) => live && (curve = loaded),
            () => {},
        );
        return () => {
            live = false;
        };
    });

    const timeAt = (netWorth: number) => {
        const time = curve ? timeFor(curve.points, netWorth) : null;
        return time === null ? null : formatClock(time);
    };

    let track = $state<HTMLElement | null>(null);
    let hover = $state<number | null>(null);
    let focus = $state<{ kind: "item" | "mark"; index: number } | null>(null);

    function netWorthAt(clientX: number): number | null {
        if (!track || inner <= 0) return null;
        const rect = track.getBoundingClientRect();
        return Math.round(scale.netWorthAt((clientX - rect.left - GUTTER) / inner));
    }

    function over(state: { x: number; y: number }): boolean {
        if (!track) return false;
        const r = track.getBoundingClientRect();
        return state.x >= r.left && state.x <= r.right && state.y >= r.top && state.y <= r.bottom;
    }

    const dragging = $derived(
        drag.current && drag.current.payload.kind !== "category" && over(drag.current) ? drag.current : null,
    );
    const focused = $derived(
        focus?.kind === "item" ? items[focus.index] : focus?.kind === "mark" ? steps[focus.index] : undefined,
    );
    const focusedItem = $derived(focus?.kind === "item" ? items[focus.index] : undefined);
    const focusedStep = $derived(focus?.kind === "mark" ? steps[focus.index] : undefined);
    const point = $derived(
        dragging
            ? netWorthAt(dragging.x)
            : focusedItem
              ? focusedItem.entry.netWorth
              : focusedStep
                ? focusedStep.mark.netWorth
                : hover,
    );

    const readout = $derived.by(() => {
        if (point === null) return null;
        return {
            souls: point,
            level: levelAt(levels, point),
            time: timeAt(point),
            stats: statsAt(entries, point, statsById, catalog.byId),
        };
    });

    let tipWidth = $state(0);
    const tipLeft = $derived(
        point === null ? 0 : Math.max(0, Math.min(width - tipWidth, (focused?.at ?? x(point)) - tipWidth / 2)),
    );

    function drop(state: DragState): boolean {
        const { payload } = state;
        if (payload.kind === "category" || !over(state)) return false;
        const at = netWorthAt(state.x);
        if (at === null) return false;
        const moving = payload.kind === "items" && !state.copy ? payload.refs : [];
        const to = dropRef(editor.build, catalog.byId, at, moving);
        if (!to) return false;
        if (payload.kind === "new") {
            editor.apply(addItems(editor.build, to.category, to.index, payload.abilityIds));
            editor.select(
                payload.abilityIds.map((_, k) => ({ category: to.category, index: to.index + k })),
                "replace",
            );
        } else {
            editor.apply(moveItems(editor.build, payload.refs, to, state.copy));
        }
        return true;
    }

    $effect(() => drag.onDrop(drop));

    const label = "text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase";
    const laneLabel =
        "pointer-events-none absolute left-2.5 max-w-[66px] -translate-y-1/2 truncate text-[10px] font-semibold tracking-[0.08em] text-muted-foreground/70 uppercase";
</script>

<svelte:window bind:innerHeight={windowHeight} />

<section
    class={cn(
        "border-t bg-card px-2 pb-1 transition-colors",
        dragging ? "border-primary/60 bg-primary/5 shadow-[inset_0_0_0_1px_var(--primary)]" : "border-border",
    )}
    aria-label={t("builds.editor.timeline.label")}
    data-testid="souls-timeline"
>
    <header class="flex h-7 items-center gap-1.5 px-2 pt-1">
        <h3 class={label}>{t("builds.editor.timeline.label")}</h3>
        <Tooltip.Provider>
            <Tooltip.Root delayDuration={150}>
                <Tooltip.Trigger>
                    {#snippet child({ props })}
                        <Button
                            {...props}
                            variant="unstyled"
                            aria-label={t("builds.editor.timeline.about")}
                            class="grid size-4 place-items-center rounded-full text-muted-foreground/60 hover:text-foreground focus-visible:text-foreground"
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
    </header>

    <div
        bind:this={track}
        bind:clientWidth={width}
        class="relative"
        style:height="{layout.height}px"
        role="presentation"
        onpointermove={(e) => (hover = netWorthAt(e.clientX))}
        onpointerleave={() => {
            hover = null;
            focus = null;
        }}
    >
        {#if width > 0}
            <div
                class="absolute inset-x-0 top-0 rounded-t-md bg-muted/30"
                style:height="{layout.axisY}px"
                aria-hidden="true"
            ></div>
            <div
                class="absolute inset-x-0 rounded-b-md bg-brass/[0.05]"
                style:top="{layout.axisY}px"
                style:height="{layout.labelsY - layout.axisY - 2}px"
                aria-hidden="true"
            ></div>
            <span class={laneLabel} style:top="{(layout.itemsTop + layout.itemsBottom) / 2}px">
                {t("builds.editor.timeline.items")}
            </span>
            <span class={laneLabel} style:top="{layout.marksTop + size.mark / 2}px">
                {t("builds.editor.timeline.abilities")}
            </span>

            <TimelineAxis
                {ticks}
                apTicks={apMarks}
                {x}
                {width}
                axisY={layout.axisY}
                gridBottom={layout.labelsY - 2}
                labelsY={layout.labelsY}
                {timeAt}
            />

            <svg class="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden="true">
                {#each items as it, i (i)}
                    {#if Math.abs(it.x - it.at) > 0.5 || it.row > 0}
                        <line
                            x1={it.x}
                            y1={itemTop(it.row) + size.item}
                            x2={it.at}
                            y2={layout.axisY}
                            class="stroke-muted-foreground/40"
                            stroke-width="1"
                        />
                    {/if}
                {/each}
                {#each steps as step, i (i)}
                    {#if Math.abs(step.x - step.at) > 0.5}
                        <line
                            x1={step.x}
                            y1={layout.marksTop}
                            x2={step.at}
                            y2={layout.axisY}
                            class="stroke-brass/45"
                            stroke-width="1"
                        />
                    {/if}
                {/each}
            </svg>

            {#each items as it (`${it.entry.ref.category}:${it.entry.ref.index}`)}
                <span
                    class="absolute h-1.5 w-0.5 -translate-x-1/2 rounded-full bg-muted-foreground/70"
                    style:left="{it.at}px"
                    style:top="{layout.axisY - 6}px"
                    aria-hidden="true"
                ></span>
            {/each}
            {#each steps as step, i (i)}
                <span
                    class="absolute h-1.5 w-0.5 -translate-x-1/2 rounded-full bg-brass/80"
                    style:left="{step.at}px"
                    style:top="{layout.axisY + 1}px"
                    aria-hidden="true"
                ></span>
            {/each}

            {#each items as it, i (`${it.entry.ref.category}:${it.entry.ref.index}`)}
                <span
                    class={cn(
                        "timeline-item absolute overflow-hidden rounded-[4px] shadow-md ring-1 ring-black/50 transition-transform duration-100",
                        focus?.kind === "item" && focus.index === i && "z-10 scale-110",
                    )}
                    style:left="{it.x - size.item / 2}px"
                    style:top="{itemTop(it.row)}px"
                    style:width="{size.item}px"
                    style:height="{size.item}px"
                    style:--s="{size.item}px"
                    data-slot={it.item?.slot}
                    data-tier={it.item?.tier}
                    data-testid="timeline-item"
                    role="presentation"
                    onpointerenter={() => (focus = { kind: "item", index: i })}
                    onpointerleave={() => (focus = null)}
                >
                    {#if it.item?.art}
                        <img src={it.item.art} alt={it.item.name} class="size-full object-cover" draggable="false" />
                    {/if}
                    {#if it.item}
                        <span class="tier" aria-hidden="true">{it.item.tier}</span>
                    {/if}
                </span>
            {/each}

            {#each steps as step, i (i)}
                <span
                    class={cn(
                        "absolute flex flex-col items-center gap-1 transition-transform duration-100",
                        focus?.kind === "mark" && focus.index === i && "z-10 scale-110",
                    )}
                    style:left="{step.x - size.mark / 2}px"
                    style:top="{layout.marksTop}px"
                    style:width="{size.mark}px"
                    data-testid="timeline-breakpoint"
                    role="presentation"
                    onpointerenter={() => (focus = { kind: "mark", index: i })}
                    onpointerleave={() => (focus = null)}
                >
                    <span
                        class={cn(
                            "grid shrink-0 place-items-center rounded-full border bg-muted shadow-sm",
                            step.mark.tier === 0 ? "border-border" : "border-brass/70",
                        )}
                        style:width="{size.mark}px"
                        style:height="{size.mark}px"
                        style:--art="{Math.round(size.mark * 0.68)}px"
                    >
                        <AbilityArt ability={kit.abilities.get(step.mark.abilityId)} class="size-(--art)" />
                    </span>
                    <TierPips taken={step.mark.tier} />
                </span>
            {/each}

            {#if point !== null}
                <span
                    class={cn("pointer-events-none absolute top-0 w-px", dragging ? "bg-primary" : "bg-foreground/45")}
                    style:left="{focused?.at ?? x(point)}px"
                    style:height="{layout.labelsY - 2}px"
                    aria-hidden="true"
                ></span>
            {/if}

            {#if readout && !dragging}
                <TimelineReadout
                    left={tipLeft}
                    souls={readout.souls}
                    level={readout.level}
                    time={readout.time}
                    stats={readout.stats}
                    bind:width={tipWidth}
                    header={focusedItem?.item ? itemHeader : focusedStep ? stepHeader : undefined}
                />
            {/if}
        {/if}
    </div>
</section>

{#snippet itemHeader()}
    {#if focusedItem?.item}
        {#if focusedItem.item.art}
            <img src={focusedItem.item.art} alt="" class="size-5 rounded-[3px]" draggable="false" />
        {/if}
        <span class="font-semibold">{focusedItem.item.name}</span>
    {/if}
{/snippet}

{#snippet stepHeader()}
    {#if focusedStep}
        <AbilityArt ability={kit.abilities.get(focusedStep.mark.abilityId)} class="size-5" />
        <span class="font-semibold">{stepLabel(focusedStep.mark.abilityId, focusedStep.mark.tier)}</span>
    {/if}
{/snippet}

<style>
    .timeline-item {
        --bright: var(--muted-foreground);
        background: var(--muted);
        border-bottom: 3px solid var(--bright);
    }
    .timeline-item[data-slot="weapon"] {
        --bright: #ec9719;
        background: #302306;
    }
    .timeline-item[data-slot="vitality"] {
        --bright: #7bba1d;
        background: #1f3400;
    }
    .timeline-item[data-slot="spirit"] {
        --bright: #ce90ff;
        background: #362147;
    }
    .timeline-item[data-tier="4"] {
        outline: 1px solid var(--bright);
        outline-offset: -1px;
    }
    .tier {
        position: absolute;
        top: 0;
        right: 0;
        width: calc(var(--s) * 0.4);
        height: calc(var(--s) * 0.4);
        padding: 1px 2px 0 0;
        clip-path: polygon(0 0, 100% 0, 100% 100%);
        background: var(--bright);
        color: #10130d;
        font-family: var(--font-heading);
        font-size: calc(var(--s) * 0.24);
        font-weight: 700;
        line-height: 1;
        text-align: right;
    }
</style>
