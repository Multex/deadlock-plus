<script lang="ts">
    import { Coins } from "@lucide/svelte";

    import { formatNumber, t, tn } from "$lib/core/i18n.svelte";
    import type { Hero } from "$lib/features/heroes/heroes";
    import { pct, signed } from "$lib/features/stats/format";
    import HeroIcon from "$lib/features/stats/components/stats/hero-icon.svelte";
    import type { FormPip, RowSummary } from "@deadlock-plus/match/list-summary";

    let { summary, form, heroes }: { summary: RowSummary; form: FormPip[]; heroes: Record<number, Hero> } = $props();

    const PIP: Record<FormPip["outcome"], string> = {
        win: "bg-primary",
        loss: "bg-destructive",
        unscored: "bg-muted-foreground/40",
    };

    const record = $derived(
        summary.unscored > 0
            ? t("stats.record_unscored", { wins: summary.wins, losses: summary.losses, unscored: summary.unscored })
            : t("stats.record", { wins: summary.wins, losses: summary.losses }),
    );
    const top = $derived(summary.topHero);
    const topHero = $derived(top === null ? undefined : heroes[top.heroId]);
    const split = $derived(
        [summary.avgKills, summary.avgDeaths, summary.avgAssists].map((n) => n.toFixed(1)).join(" / "),
    );
    const deltaTone = $derived(
        summary.netDelta === null || summary.netDelta === 0
            ? "text-foreground"
            : summary.netDelta > 0
              ? "text-primary"
              : "text-destructive",
    );
</script>

<dl
    class="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3 lg:grid-cols-6"
    aria-label={t("match_history.list.summary.label")}
>
    <div class="bg-card px-4 py-3">
        <dt class="text-xs text-muted-foreground">{t("match_history.list.summary.matches")}</dt>
        <dd class="mt-0.5 font-heading text-2xl tabular-nums">{formatNumber(summary.matches)}</dd>
        <dd class="text-xs text-muted-foreground tabular-nums">{record}</dd>
    </div>

    <div class="bg-card px-4 py-3">
        <dt class="text-xs text-muted-foreground">{t("stats.summary.winrate")}</dt>
        <dd class="mt-0.5 font-heading text-2xl tabular-nums">{pct(summary.winrate)}</dd>
        <dd class="mt-1.5 flex gap-0.5" role="img" aria-label={t("stats.summary.form_aria", { count: form.length })}>
            {#each form as p (p.matchId)}
                <span class="h-1.5 flex-1 rounded-full {PIP[p.outcome]}"></span>
            {/each}
        </dd>
    </div>

    <div class="bg-card px-4 py-3">
        <dt class="text-xs text-muted-foreground">{t("stats.heroes.kda")}</dt>
        <dd class="mt-0.5 font-heading text-2xl tabular-nums">
            {summary.kda === null ? "-" : summary.kda.toFixed(2)}
        </dd>
        <dd class="text-xs text-muted-foreground tabular-nums">{split}</dd>
    </div>

    <div class="bg-card px-4 py-3">
        <dt class="text-xs text-muted-foreground">{t("stats.heroes.avg_souls")}</dt>
        <dd class="mt-0.5 flex items-center gap-1.5 font-heading text-2xl tabular-nums">
            <Coins class="size-5 text-brass" aria-hidden="true" />
            {formatNumber(summary.avgSouls)}
        </dd>
    </div>

    <div class="bg-card px-4 py-3">
        <dt class="text-xs text-muted-foreground">{t("sessions.row.rank_change")}</dt>
        <dd class="mt-0.5 font-heading text-2xl tabular-nums {deltaTone}">
            {summary.netDelta === null ? "-" : signed(summary.netDelta)}
        </dd>
    </div>

    <div class="flex items-center gap-3 bg-card px-4 py-3">
        {#if top}
            <HeroIcon hero={topHero} size="size-10" />
            <div class="min-w-0">
                <dt class="text-xs text-muted-foreground">{t("stats.highlights.most_played")}</dt>
                <dd class="truncate text-sm font-medium">
                    {topHero?.name ?? t("stats.hero_fallback", { id: top.heroId })}
                </dd>
                <dd class="text-xs text-muted-foreground tabular-nums">{tn("match_history.list.count", top.games)}</dd>
            </div>
        {:else}
            <div>
                <dt class="text-xs text-muted-foreground">{t("stats.highlights.most_played")}</dt>
                <dd class="text-sm">-</dd>
            </div>
        {/if}
    </div>
</dl>
