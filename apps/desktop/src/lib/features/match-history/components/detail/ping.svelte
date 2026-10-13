<script lang="ts">
    import { Activity } from "@lucide/svelte";
    import { formatNumber, t } from "$lib/core/i18n.svelte";
    import { formatClock } from "$lib/features/live/live";
    import Section from "@deadlock-plus/ui/section.svelte";
    import {
        chartDomain,
        linePath,
        valueAt,
        xOf,
        yOf,
        type ChartBox,
        type LinePoint,
    } from "@deadlock-plus/match/deep-dive/chart";
    import type { MatchDetail } from "@deadlock-plus/match/detail";
    import { loadMatchPing, type MatchPing } from "@deadlock-plus/match/ping";
    import { livePingSource, sourceLabelKey } from "../../ping";

    let { detail }: { detail: MatchDetail } = $props();

    let ping = $state.raw<MatchPing | null>(null);
    let loaded = $state(false);
    let hoverT = $state<number | null>(null);

    const box: ChartBox = { width: 600, height: 120, padLeft: 4, padRight: 4, padTop: 6, padBottom: 6 };

    $effect(() => {
        const { matchId, startTime, durationS } = detail;
        let live = true;
        loaded = false;
        ping = null;
        void loadMatchPing({ matchId, startTime, durationS }, livePingSource)
            .catch(() => null)
            .then((result) => {
                if (!live) return;
                ping = result;
                loaded = true;
            });
        return () => (live = false);
    });

    const dom = $derived.by(() => {
        const segments = ping?.segments ?? [];
        const base = chartDomain([...segments, [{ t: ping?.durationS ?? 0, v: 0 }]]);
        return { ...base, tMax: ping?.durationS || base.tMax };
    });
    const paths = $derived(
        (ping?.segments ?? []).map((s) => (s.length === 1 ? singleDot(s[0]) : linePath(s, dom, box))),
    );
    const flat = $derived<LinePoint[]>((ping?.segments ?? []).flat());

    function singleDot(p: LinePoint): string {
        return `M${xOf(p.t, dom, box).toFixed(1)} ${yOf(p.v, dom, box).toFixed(1)} h0.01`;
    }

    function track(e: PointerEvent) {
        const r = (e.currentTarget as SVGElement).getBoundingClientRect();
        if (r.width <= 0) return;
        hoverT = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1) * dom.tMax;
    }

    const ms = (v: number) => t("connection.ms", { value: formatNumber(Math.round(v)) });
    const readout = $derived(hoverT === null || flat.length === 0 ? null : valueAt(flat, hoverT));
</script>

<Section>
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="flex items-center gap-2 text-sm font-medium">
            <Activity size={16} class="shrink-0 text-muted-foreground" aria-hidden="true" />
            {t("match_history.ping.heading")}
        </h2>
        <span class="text-xs text-muted-foreground">
            {t(sourceLabelKey(ping?.source ?? null))}
            {#if ping?.partial}
                · {t("match_history.ping.partial")}
            {/if}
        </span>
    </div>

    {#if !loaded}
        <p class="text-sm text-muted-foreground" role="status">{t("match_history.ping.loading")}</p>
    {:else if !ping}
        <p class="text-sm text-muted-foreground" role="status">{t("match_history.ping.empty")}</p>
    {:else}
        <dl class="mb-3 flex flex-wrap gap-x-8 gap-y-2">
            <div>
                <dt class="text-xs text-muted-foreground">{t("match_history.ping.avg")}</dt>
                <dd class="text-lg tabular-nums">{ms(ping.summary.avg)}</dd>
            </div>
            <div>
                <dt class="text-xs text-muted-foreground">{t("match_history.ping.worst")}</dt>
                <dd class="text-lg tabular-nums">{ms(ping.summary.worst)}</dd>
            </div>
            <div>
                <dt class="text-xs text-muted-foreground">{t("match_history.ping.samples")}</dt>
                <dd class="text-lg tabular-nums">{formatNumber(ping.summary.samples)}</dd>
            </div>
        </dl>
        <div class="relative">
            <svg
                viewBox="0 0 {box.width} {box.height}"
                class="h-32 w-full touch-none"
                preserveAspectRatio="none"
                role="img"
                aria-label={t("match_history.ping.chart_aria")}
                onpointermove={track}
                onpointerleave={() => (hoverT = null)}
            >
                {#each paths as d, i (i)}
                    <path
                        {d}
                        fill="none"
                        stroke="var(--color-foreground)"
                        stroke-width="2"
                        stroke-linecap="round"
                        vector-effect="non-scaling-stroke"
                    />
                {/each}
                {#if hoverT !== null}
                    <line
                        x1={xOf(hoverT, dom, box)}
                        x2={xOf(hoverT, dom, box)}
                        y1="0"
                        y2={box.height}
                        stroke="var(--color-muted-foreground)"
                        stroke-width="1"
                        vector-effect="non-scaling-stroke"
                    />
                {/if}
            </svg>
            <span class="absolute left-1 top-0 text-[10px] text-muted-foreground">{ms(dom.vMax)}</span>
            <span class="absolute bottom-0 left-1 text-[10px] text-muted-foreground">{ms(dom.vMin)}</span>
        </div>
        <p class="mt-1 flex flex-wrap items-center gap-x-4 text-xs text-muted-foreground">
            <span>{t("match_history.ping.hint")}</span>
            {#if readout !== null && hoverT !== null}
                <span class="text-foreground tabular-nums">
                    {formatClock(Math.round(hoverT)) ?? ""} · {ms(readout)}
                </span>
            {/if}
        </p>
    {/if}
</Section>
