<script lang="ts">
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import { formatNumber, t, tn } from "$lib/core/i18n.svelte";
    import { lossVariant } from "../connection";
    import type { EnginePingView, PingStats } from "../types";

    type Props = {
        title: string;
        note?: string;
        stats: PingStats | null;
        unavailable?: string;
        engine?: EnginePingView | null;
        engineNote?: string;
    };

    let { title, note, stats, unavailable, engine = null, engineNote }: Props = $props();

    const fmt = (v: number | null | undefined) => (v == null ? "—" : formatNumber(Math.round(v)));
    const decimal = (v: number) => formatNumber(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const percent = (v: number) =>
        formatNumber(v, { minimumFractionDigits: 0, maximumFractionDigits: v === 0 ? 0 : 1 });
    const headline = $derived(stats ? (stats.current ?? stats.avg) : null);
</script>

{#snippet lossBadge(pct: number)}
    <Badge variant={lossVariant(pct)}>{percent(pct)}%</Badge>
{/snippet}

{#snippet relay(s: PingStats)}
    <div class="flex items-baseline gap-1">
        <span class="text-4xl font-semibold tabular-nums">{fmt(headline)}</span>
        <span class="text-sm text-muted-foreground">{t("connection.unit_ms")}</span>
    </div>
    <dl class="grid grid-cols-4 gap-2 text-xs">
        <div>
            <dt class="text-muted-foreground">{t("connection.ping.avg")}</dt>
            <dd class="tabular-nums">{fmt(s.avg)}</dd>
        </div>
        <div>
            <dt class="text-muted-foreground">{t("connection.ping.min")}</dt>
            <dd class="tabular-nums">{fmt(s.min)}</dd>
        </div>
        <div>
            <dt class="text-muted-foreground">{t("connection.ping.max")}</dt>
            <dd class="tabular-nums">{fmt(s.max)}</dd>
        </div>
        <div>
            <dt class="text-muted-foreground">{t("connection.ping.jitter")}</dt>
            <dd class="tabular-nums">{s.jitter == null ? "—" : decimal(s.jitter)}</dd>
        </div>
    </dl>
    <div class="flex items-center gap-2 text-xs">
        <span class="text-muted-foreground">{t("connection.ping.loss")}</span>
        {@render lossBadge(s.lossPct)}
        <span class="text-muted-foreground">{tn("connection.ping.samples", s.samples)}</span>
    </div>
{/snippet}

<Card class="flex flex-col gap-3">
    <span class="text-sm font-medium">{title}</span>

    {#if engine}
        <div class="flex items-baseline gap-1">
            <span class="text-4xl font-semibold tabular-nums">{fmt(engine.pingMs)}</span>
            <span class="text-sm text-muted-foreground">{t("connection.unit_ms")}</span>
        </div>
        <dl class="grid grid-cols-3 gap-2 text-xs">
            <div>
                <dt class="text-muted-foreground">{t("connection.ping.jitter")}</dt>
                <dd class="tabular-nums">{decimal(engine.jitterMs)}</dd>
            </div>
            <div>
                <dt class="text-muted-foreground">{t("connection.ping.loss_down")}</dt>
                <dd>{@render lossBadge(engine.lossDownPct)}</dd>
            </div>
            <div>
                <dt class="text-muted-foreground">{t("connection.ping.loss_up")}</dt>
                <dd>{@render lossBadge(engine.lossUpPct)}</dd>
            </div>
        </dl>
        {#if engineNote}
            <p class="text-xs text-muted-foreground">{engineNote}</p>
        {/if}
    {:else}
        {#if unavailable || !stats}
            <p class="py-6 text-sm text-muted-foreground">{unavailable ?? t("connection.ping.no_data")}</p>
        {:else}
            {@render relay(stats)}
        {/if}

        {#if note}
            <p class="text-xs text-muted-foreground">{note}</p>
        {/if}
    {/if}
</Card>
