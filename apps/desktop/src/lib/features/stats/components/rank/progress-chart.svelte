<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import { CHART_H, CHART_PAD, CHART_W, type RankChart } from "../../rank-view";

    let { chart, shown = $bindable() }: { chart: RankChart | null; shown: number } = $props();

    const WINDOWS = [20, 50, 100];
    const W = CHART_W;
    const H = CHART_H;
    const PAD = CHART_PAD;
</script>

<Card as="section">
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-lg">{t("rank.chart.heading")}</h3>
        <div class="flex gap-2">
            {#each WINDOWS as n (n)}
                <Button
                    size="sm"
                    variant={shown === n ? "default" : "outline"}
                    aria-pressed={shown === n}
                    onclick={() => (shown = n)}>{t("rank.chart.last_n", { count: n })}</Button
                >
            {/each}
        </div>
    </div>
    {#if chart}
        <svg
            viewBox="0 0 {W} {H}"
            class="h-auto w-full overflow-visible"
            role="group"
            aria-label={t("rank.chart.aria")}
        >
            {#each chart.lines as l (l.y)}
                <line x1={PAD.l} x2={W - PAD.r} y1={l.y} y2={l.y} stroke="var(--color-border)" stroke-width="1" />
                <text x={PAD.l - 8} y={l.y + 4} text-anchor="end" font-size="12" fill="var(--color-muted-foreground)"
                    >{l.label}</text
                >
            {/each}
            <path d={chart.d} fill="none" stroke="var(--color-primary)" stroke-width="1.5" stroke-opacity="0.6" />
            {#each chart.dots as d (d.p.matchId)}
                {#if d.p.demotionProtected}
                    <circle cx={d.cx} cy={d.cy} r="7" fill="none" stroke="var(--color-primary)" stroke-width="1.5" />
                {/if}
                <circle
                    cx={d.cx}
                    cy={d.cy}
                    r="3"
                    fill={d.p.outcome === "win"
                        ? "var(--color-primary)"
                        : d.p.outcome === "loss"
                          ? "var(--color-destructive)"
                          : "var(--color-muted-foreground)"}
                />
            {/each}
            {#each chart.marks as m (m.matchId)}
                <path
                    d={m.promoted ? `M${m.cx} ${m.cy - 17} l6 10 h-12 z` : `M${m.cx} ${m.cy + 17} l6 -10 h-12 z`}
                    fill={m.promoted ? "var(--color-primary)" : "var(--color-destructive)"}
                    role="img"
                    aria-label={m.label}
                >
                    <title>{m.label}</title>
                </path>
            {/each}
        </svg>
        <p class="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
            <span>{t("rank.chart.range", { from: chart.from, to: chart.to })}</span>
            <span>{t("rank.chart.legend")}</span>
            <span>{t("rank.chart.legend_changes")}</span>
        </p>
    {:else}
        <p class="text-sm text-muted-foreground">{t("rank.chart.empty")}</p>
    {/if}
</Card>
