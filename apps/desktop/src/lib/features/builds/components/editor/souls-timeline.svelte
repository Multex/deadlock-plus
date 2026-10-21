<script lang="ts">
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

    const PAD = 14;
    const ITEM = 24;
    const ITEM_GAP = 2;
    const ITEM_ROWS = 3;
    const MARK = 20;
    const MARK_SLOT = 24;
    const TOP = 6;
    const LEADER = 7;
    const MARK_H = MARK + 8;
    const LABELS_H = 24;
    const TICK_GAP = 56;

    const entries = $derived(placeItems(editor.build, catalog.byId));
    const marks = $derived(breakpoints(editor.build.abilityOrder, levels));
    const end = $derived(timelineEnd(entries, marks, levels));
    const scale = $derived(soulScale(end));

    let width = $state(0);
    const inner = $derived(Math.max(0, width - 2 * PAD));
    const x = (netWorth: number) => PAD + scale.at(netWorth) * inner;

    const items = $derived.by(() => {
        if (width <= 0) return [];
        const packed = packLane(
            entries.map((e) => x(e.netWorth)),
            { size: ITEM, gap: ITEM_GAP, width, rows: ITEM_ROWS },
        );
        return entries.map((entry, i) => ({
            entry,
            at: x(entry.netWorth),
            ...packed[i]!,
            item: catalog.byId.get(entry.abilityId),
        }));
    });
    const rows = $derived(Math.max(1, ...items.map((i) => i.row + 1)));

    const steps = $derived.by(() => {
        if (width <= 0) return [];
        const packed = packLane(
            marks.map((m) => x(m.netWorth)),
            { size: MARK_SLOT, gap: 2, width, rows: 1 },
        );
        return marks.map((mark, i) => ({ mark, at: x(mark.netWorth), x: packed[i]!.x }));
    });

    const itemsBottom = $derived(TOP + rows * (ITEM + ITEM_GAP) - ITEM_GAP);
    const axisY = $derived(itemsBottom + LEADER);
    const marksTop = $derived(axisY + LEADER);
    const labelsY = $derived(marksTop + MARK_H + 2);
    const height = $derived(labelsY + LABELS_H);
    const itemTop = (row: number) => itemsBottom - ITEM - row * (ITEM + ITEM_GAP);

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
        return Math.round(scale.netWorthAt((clientX - rect.left - PAD) / inner));
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
</script>

<section class="my-1.5" aria-label={t("builds.editor.timeline.label")} data-testid="souls-timeline">
    <div
        bind:this={track}
        bind:clientWidth={width}
        class={cn(
            "relative rounded-md border bg-muted/25 transition-colors",
            dragging ? "border-primary/60 bg-primary/5" : "border-border",
        )}
        style:height="{height}px"
        role="presentation"
        onpointermove={(e) =>
            (hover = (e.target as Element).closest("[data-timeline-info]") ? null : netWorthAt(e.clientX))}
        onpointerleave={() => {
            hover = null;
            focus = null;
        }}
    >
        {#if width > 0}
            <TimelineAxis {ticks} apTicks={apMarks} {x} {width} {axisY} gridBottom={labelsY - 2} {labelsY} {timeAt} />

            <svg class="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden="true">
                {#each items as it, i (i)}
                    {#if Math.abs(it.x - it.at) > 0.5 || it.row > 0}
                        <line
                            x1={it.x}
                            y1={itemTop(it.row) + ITEM}
                            x2={it.at}
                            y2={axisY}
                            class="stroke-muted-foreground/40"
                            stroke-width="1"
                        />
                    {/if}
                {/each}
                {#each steps as step, i (i)}
                    {#if Math.abs(step.x - step.at) > 0.5}
                        <line
                            x1={step.x}
                            y1={marksTop}
                            x2={step.at}
                            y2={axisY}
                            class="stroke-brass/45"
                            stroke-width="1"
                        />
                    {/if}
                {/each}
            </svg>

            {#each items as it (`${it.entry.ref.category}:${it.entry.ref.index}`)}
                <span
                    class="absolute h-1 w-0.5 -translate-x-1/2 rounded-full bg-muted-foreground/70"
                    style:left="{it.at}px"
                    style:top="{axisY - 4}px"
                    aria-hidden="true"
                ></span>
            {/each}
            {#each steps as step, i (i)}
                <span
                    class="absolute h-1 w-0.5 -translate-x-1/2 rounded-full bg-brass/80"
                    style:left="{step.at}px"
                    style:top="{axisY + 1}px"
                    aria-hidden="true"
                ></span>
            {/each}

            {#each items as it, i (`${it.entry.ref.category}:${it.entry.ref.index}`)}
                <span
                    class={cn(
                        "timeline-item absolute overflow-hidden rounded-[3px] bg-card shadow-sm ring-1 ring-black/40 transition-transform duration-100",
                        focus?.kind === "item" && focus.index === i && "z-10 scale-125",
                    )}
                    style:left="{it.x - ITEM / 2}px"
                    style:top="{itemTop(it.row)}px"
                    style:width="{ITEM}px"
                    style:height="{ITEM}px"
                    data-slot={it.item?.slot}
                    data-testid="timeline-item"
                    role="presentation"
                    onpointerenter={() => (focus = { kind: "item", index: i })}
                    onpointerleave={() => (focus = null)}
                >
                    {#if it.item?.art}
                        <img src={it.item.art} alt={it.item.name} class="size-full object-cover" draggable="false" />
                    {/if}
                </span>
            {/each}

            {#each steps as step, i (i)}
                <span
                    class={cn(
                        "absolute flex flex-col items-center gap-0.5 transition-transform duration-100",
                        focus?.kind === "mark" && focus.index === i && "z-10 scale-125",
                    )}
                    style:left="{step.x - MARK_SLOT / 2}px"
                    style:top="{marksTop}px"
                    style:width="{MARK_SLOT}px"
                    data-testid="timeline-breakpoint"
                    role="presentation"
                    onpointerenter={() => (focus = { kind: "mark", index: i })}
                    onpointerleave={() => (focus = null)}
                >
                    <span
                        class={cn(
                            "grid place-items-center rounded-full border bg-muted/80",
                            step.mark.tier === 0 ? "border-border" : "border-brass/60",
                        )}
                        style:width="{MARK}px"
                        style:height="{MARK}px"
                    >
                        <AbilityArt ability={kit.abilities.get(step.mark.abilityId)} class="size-4" />
                    </span>
                    <TierPips taken={step.mark.tier} class="gap-[2px] [&>span]:size-1" />
                </span>
            {/each}

            {#if point !== null}
                <span
                    class={cn("pointer-events-none absolute top-0 w-px", dragging ? "bg-primary" : "bg-foreground/45")}
                    style:left="{focused?.at ?? x(point)}px"
                    style:height="{labelsY - 2}px"
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
        border-bottom: 2px solid var(--muted-foreground);
    }
    .timeline-item[data-slot="weapon"] {
        border-bottom-color: #ec9719;
    }
    .timeline-item[data-slot="vitality"] {
        border-bottom-color: #7bba1d;
    }
    .timeline-item[data-slot="spirit"] {
        border-bottom-color: #ce90ff;
    }
</style>
