<script lang="ts">
    import { onMount } from "svelte";

    import { t } from "$lib/core/i18n.svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import PageHeader from "@deadlock-plus/ui/page-header.svelte";
    import { loadHeroes, onHeroesRefreshed, type Hero } from "$lib/features/heroes/heroes";
    import { steamAccount } from "$lib/features/steam-account/account.svelte";
    import { breakEvenWinrate, climbForecast } from "@deadlock-plus/stats/climb";
    import { stats } from "$lib/features/stats/stats.svelte";
    import {
        progressSeries,
        rankChanges,
        standing,
        subrankAt,
        lossOutcome,
        windowStats,
        winsToNext,
        winStreak,
    } from "@deadlock-plus/stats/rank";
    import { projectRank } from "@deadlock-plus/stats/rank-live";
    import { buildRankChart, partsName } from "$lib/features/stats/rank-view";
    import CachedNote from "$lib/features/stats/components/shared/cached-note.svelte";
    import HistoryGate from "$lib/features/stats/components/shared/history-gate.svelte";
    import RefreshButton from "$lib/features/stats/components/shared/refresh-button.svelte";
    import FormTiles from "$lib/features/stats/components/rank/form-tiles.svelte";
    import OutlookTiles from "$lib/features/stats/components/rank/outlook-tiles.svelte";
    import ProgressChart from "$lib/features/stats/components/rank/progress-chart.svelte";
    import RankChanges from "$lib/features/stats/components/rank/rank-changes.svelte";
    import RankSummary from "$lib/features/stats/components/rank/rank-summary.svelte";
    import RecentMatches from "$lib/features/stats/components/rank/recent-matches.svelte";

    const FORM_WINDOW = 20;
    const LIST_ROWS = 8;

    let heroes = $state<Record<number, Hero>>({});
    let shown = $state(50);

    const accountId = $derived(steamAccount.account?.steamId32 ?? null);
    const topTier = $derived(Math.max(0, ...stats.ranks.map((t) => t.tier)));
    const projection = $derived(projectRank(stats.matches, stats.rankInfo, topTier || undefined));
    const track = $derived(projection?.track ?? []);
    const info = $derived(projection?.info ?? null);
    const modelled = $derived(projection?.modelled ?? 0);
    const now = $derived(info ? standing(info) : null);
    const series = $derived(info ? progressSeries(track, info) : []);
    const form = $derived(windowStats(track, FORM_WINDOW));
    const changes = $derived(rankChanges(track).slice(0, LIST_ROWS));
    const recent = $derived(track.slice(-LIST_ROWS).reverse());
    const atTop = $derived(now !== null && now.tier >= topTier);
    const streak = $derived(winStreak(track));
    const toNext = $derived(now && !atTop && now.within !== null ? winsToNext(now.within, now.span, streak) : null);
    const nextLoss = $derived(
        now && now.within !== null && info ? lossOutcome(now.within, info.shieldsLeft ?? 0) : null,
    );
    const breakEven = breakEvenWinrate();
    const forecast = $derived(info && !atTop ? climbForecast(track, info.finalFlat, Date.now() / 1000) : null);
    const nextName = $derived.by(() => {
        const cur = subrankAt(info?.finalFlat ?? 0);
        return partsName(stats.ranks, subrankAt(cur.start + cur.span));
    });
    const chart = $derived(info ? buildRankChart(series, shown, stats.ranks) : null);

    $effect(() => {
        if (accountId !== null) void stats.load(accountId);
    });

    onMount(() => {
        void loadHeroes().then((h) => (heroes = h));
        return onHeroesRefreshed((h) => (heroes = h));
    });
</script>

<Page>
    <PageHeader title={t("rank.title")} subtitle={t("rank.subtitle")}>
        {#snippet actions()}
            <RefreshButton />
        {/snippet}
    </PageHeader>

    <HistoryGate>
        {#if !info || !now || track.length === 0}
            <EmptyState size="base" spacing="xl">{t("rank.empty")}</EmptyState>
        {:else}
            <CachedNote />
            <RankSummary
                {info}
                {now}
                tier={stats.ranks.find((t) => t.tier === now.tier)}
                name={partsName(stats.ranks, now)}
                {nextName}
                {atTop}
                {toNext}
                {modelled}
            />
            <FormTiles
                {form}
                formWindow={FORM_WINDOW}
                sampled={Math.min(FORM_WINDOW, track.length)}
                {streak}
                {nextLoss}
            />
            <OutlookTiles {form} formWindow={FORM_WINDOW} {breakEven} {forecast} {nextName} />
            <ProgressChart {chart} bind:shown />
            <div class="grid gap-5 md:grid-cols-2">
                <RecentMatches {recent} {heroes} />
                <RankChanges {changes} ranks={stats.ranks} />
            </div>
        {/if}
    </HistoryGate>
</Page>
