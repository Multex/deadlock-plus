<script lang="ts">
    import type { Component } from "svelte";
    import { Castle, Ghost, PackageMinus, PackagePlus, Skull, TrendingUp } from "@lucide/svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { formatClock } from "$lib/features/live/live";
    import { TIMELINE_LANES, eventTeam, markerPercent, toggleKind, type LaneId } from "../../replay";
    import type { TimelineEvent, TimelineKind } from "../../timeline";
    import Button from "$lib/ui/button.svelte";
    import Slider from "$lib/ui/slider.svelte";

    interface Props {
        events: TimelineEvent[];
        kinds: TimelineKind[];
        duration: number;
        time: number;
        labelOf: (event: TimelineEvent) => string;
        selected: TimelineEvent | null;
        onkinds: (kinds: TimelineKind[]) => void;
        onseek: (timeS: number, event: TimelineEvent) => void;
        onscrub: (timeS: number) => void;
    }

    let { events, kinds, duration, time, labelOf, selected, onkinds, onseek, onscrub }: Props = $props();

    type Icon = Component<{ size?: number; class?: string; "aria-hidden"?: boolean | "true" | "false" }>;

    const ICONS: Record<TimelineKind, Icon> = {
        death: Ghost,
        objective: Castle,
        "mid-boss": Skull,
        "item-buy": PackagePlus,
        "item-sell": PackageMinus,
        swing: TrendingUp,
    };

    const KIND_KEYS: Record<TimelineKind, string> = {
        death: "match_history.detail.replay.kind_death",
        objective: "match_history.detail.replay.kind_objective",
        "mid-boss": "match_history.detail.replay.kind_mid_boss",
        "item-buy": "match_history.detail.replay.kind_item_buy",
        "item-sell": "match_history.detail.replay.kind_item_sell",
        swing: "match_history.detail.replay.kind_swing",
    };

    const LANE_KEYS: Record<LaneId, string> = {
        death: "match_history.detail.replay.lane_death",
        objective: "match_history.detail.replay.lane_objective",
        "mid-boss": "match_history.detail.replay.lane_mid_boss",
        swing: "match_history.detail.replay.lane_swing",
        item: "match_history.detail.replay.lane_item",
    };

    const ALL_KINDS: TimelineKind[] = TIMELINE_LANES.flatMap((l) => [...l.kinds]);
    const counts = $derived.by(() => {
        const out = new Map<TimelineKind, number>();
        for (const e of events) out.set(e.kind, (out.get(e.kind) ?? 0) + 1);
        return out;
    });

    const lanes = $derived(
        TIMELINE_LANES.filter((l) => l.kinds.some((k) => kinds.includes(k))).map((lane) => ({
            id: lane.id,
            items: events.filter((e) => lane.kinds.includes(e.kind) && kinds.includes(e.kind)),
        })),
    );

    const clock = (s: number) => formatClock(Math.round(s)) ?? "0:00";
    const colour = (e: TimelineEvent) => {
        const team = eventTeam(e);
        return team === "hidden-king"
            ? "var(--dd-hk)"
            : team === "archmother"
              ? "var(--dd-am)"
              : "var(--color-muted-foreground)";
    };
</script>

<div class="flex flex-col gap-2">
    <div
        class="flex flex-wrap items-center gap-2"
        role="group"
        aria-label={t("match_history.detail.replay.kinds_aria")}
    >
        {#each ALL_KINDS as kind (kind)}
            {@const Glyph = ICONS[kind]}
            {@const on = kinds.includes(kind)}
            <Button size="sm" variant="toggle" aria-pressed={on} onclick={() => onkinds(toggleKind(kinds, kind))}>
                <Glyph size={14} aria-hidden="true" />
                {t(KIND_KEYS[kind])}
                <span
                    class="-mr-1 rounded-sm px-1 text-[11px] leading-4 tabular-nums {on
                        ? 'bg-brass/20 text-foreground'
                        : 'bg-muted text-muted-foreground'}"
                >
                    {counts.get(kind) ?? 0}
                </span>
            </Button>
        {/each}
    </div>

    <div class="tl">
        {#if lanes.length === 0}
            <p class="py-2 text-xs text-muted-foreground">{t("match_history.detail.replay.no_kinds")}</p>
        {:else}
            <div class="relative">
                {#each lanes as lane (lane.id)}
                    <div
                        class="grid grid-cols-[5.5rem_1fr] items-center gap-2 border-b border-border/60 last:border-b-0"
                    >
                        <span class="truncate text-xs text-muted-foreground">{t(LANE_KEYS[lane.id])}</span>
                        <div class="relative mx-(--thumb-half) h-7">
                            {#each lane.items as e, i (i)}
                                {@const Glyph = ICONS[e.kind]}
                                <button
                                    type="button"
                                    class="mk absolute top-1/2 grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    class:picked={e === selected}
                                    style:left="{markerPercent(e.timeS, duration)}%"
                                    style:color={colour(e)}
                                    style:border-color={colour(e)}
                                    title={labelOf(e)}
                                    aria-label={labelOf(e)}
                                    onclick={() => onseek(e.timeS, e)}
                                >
                                    <Glyph size={11} aria-hidden="true" />
                                </button>
                            {/each}
                        </div>
                    </div>
                {/each}
                <div class="pointer-events-none absolute inset-y-0 left-[5.5rem] right-0 ml-2" aria-hidden="true">
                    <div class="relative mx-(--thumb-half) h-full">
                        <div
                            class="absolute inset-y-0 w-px bg-foreground/70"
                            style:left="{markerPercent(time, duration)}%"
                        ></div>
                    </div>
                </div>
            </div>
        {/if}

        <div class="grid grid-cols-[5.5rem_1fr] items-center gap-2">
            <span class="text-xs text-muted-foreground tabular-nums">{clock(time)}</span>
            <Slider
                bind:value={() => Math.round(time), onscrub}
                min={0}
                max={Math.max(duration, 1)}
                step={1}
                disabled={duration <= 0}
                formatValue={clock}
                bubble={false}
                aria-label={t("match_history.detail.replay.scrubber_aria")}
            />
        </div>
    </div>
</div>

<style>
    .tl {
        --thumb-half: 8px;
    }
    .mk {
        transition: scale 0.12s;
    }
    .mk:hover,
    .mk.picked {
        scale: 1.25;
        z-index: 2;
    }
    @media (prefers-reduced-motion: reduce) {
        .mk {
            transition: none;
        }
    }
</style>
