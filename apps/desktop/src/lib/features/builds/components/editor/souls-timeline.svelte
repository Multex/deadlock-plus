<script lang="ts">
    import { deadlockApi } from "$lib/core/deadlock-api";
    import { formatNumber, t } from "$lib/core/i18n.svelte";
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
        placeItems,
        statsAt,
        timeFor,
        timelineEnd,
        type NetWorthCurve,
    } from "../../editor/timeline";
    import type { Level } from "../../levels";
    import type { StatsById } from "../../stats";

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

    const entries = $derived(placeItems(editor.build, catalog.byId));
    const marks = $derived(breakpoints(editor.build.abilityOrder, levels));
    const end = $derived(timelineEnd(entries, marks, levels));
    const ticks = $derived(apTicks(levels, end));
    const percent = (netWorth: number) => `${Math.min(100, (netWorth / end) * 100)}%`;

    /** Items bought at the same net worth stack upwards. */
    const stacked = $derived.by(() => {
        const seen = new Map<number, number>();
        return entries.map((entry) => {
            const row = seen.get(entry.netWorth) ?? 0;
            seen.set(entry.netWorth, row + 1);
            return { entry, row, item: catalog.byId.get(entry.abilityId) };
        });
    });

    const markLabel = (abilityId: number, tier: number) => {
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

    let track = $state<HTMLElement | null>(null);
    let hover = $state<number | null>(null);

    function netWorthAt(clientX: number): number | null {
        if (!track) return null;
        const rect = track.getBoundingClientRect();
        if (rect.width <= 0) return null;
        return Math.round(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * end);
    }

    function over(state: { x: number; y: number }): boolean {
        if (!track) return false;
        const r = track.getBoundingClientRect();
        return state.x >= r.left && state.x <= r.right && state.y >= r.top && state.y <= r.bottom;
    }

    const dragging = $derived(
        drag.current && drag.current.payload.kind !== "category" && over(drag.current) ? drag.current : null,
    );
    const point = $derived(dragging ? netWorthAt(dragging.x) : hover);

    const readout = $derived.by(() => {
        if (point === null) return null;
        const time = curve ? timeFor(curve.points, point) : null;
        return {
            souls: point,
            level: levelAt(levels, point),
            time: time === null ? null : formatClock(time),
            stats: statsAt(entries, point, statsById, catalog.byId),
        };
    });

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

<section class="flex flex-col gap-1.5" aria-label={t("builds.editor.timeline.label")} data-testid="souls-timeline">
    <div
        bind:this={track}
        class="relative h-24 rounded-md border border-border bg-muted/30"
        role="presentation"
        onpointermove={(e) => (hover = netWorthAt(e.clientX))}
        onpointerleave={() => (hover = null)}
    >
        {#each ticks as tick (tick)}
            <span class="absolute inset-y-0 w-px bg-border/60" style:left={percent(tick)} aria-hidden="true"></span>
        {/each}

        {#each marks as mark, i (i)}
            <span
                class="absolute bottom-0 top-0 w-px bg-primary/70"
                style:left={percent(mark.netWorth)}
                data-testid="timeline-breakpoint"
            >
                <span class="absolute bottom-0 left-1 whitespace-nowrap text-[10px] text-muted-foreground">
                    {markLabel(mark.abilityId, mark.tier)}
                </span>
            </span>
        {/each}

        {#each stacked as { entry, row, item } (`${entry.ref.category}:${entry.ref.index}`)}
            <span
                class="absolute size-6 -translate-x-full overflow-hidden rounded-sm border border-border bg-card"
                style:left={percent(entry.netWorth)}
                style:top="{4 + row * 26}px"
                data-testid="timeline-item"
            >
                {#if item?.art}
                    <img src={item.art} alt={item.name} class="size-full object-cover" draggable="false" />
                {/if}
            </span>
        {/each}

        {#if point !== null}
            <span
                class={["absolute inset-y-0 w-px", dragging ? "bg-primary" : "bg-foreground/40"]}
                style:left={percent(point)}
                aria-hidden="true"
            ></span>
        {/if}

        {#if readout && !dragging}
            <div
                class="pointer-events-none absolute bottom-full z-10 mb-1 min-w-40 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
                style:left={percent(readout.souls)}
                role="tooltip"
                data-testid="timeline-readout"
            >
                <p class="font-medium">{t("builds.editor.timeline.souls", { souls: formatNumber(readout.souls) })}</p>
                {#if readout.level !== null}
                    <p>{t("builds.editor.timeline.level", { level: readout.level })}</p>
                {/if}
                {#if readout.time !== null}
                    <p>{t("builds.editor.timeline.time", { time: readout.time })}</p>
                {/if}
                {#each readout.stats as stat (`${stat.provides}:${stat.unit}`)}
                    <p class="text-muted-foreground">{stat.label} +{formatNumber(stat.total)}{stat.unit ?? ""}</p>
                {/each}
            </div>
        {/if}
    </div>
    <p class="text-xs text-muted-foreground">{t("builds.editor.timeline.assumption")}</p>
</section>
