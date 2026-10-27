<script lang="ts">
    import { onMount } from "svelte";

    import { t } from "$lib/core/i18n.svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import PageHeader from "@deadlock-plus/ui/page-header.svelte";
    import SupportButton from "$lib/components/support-button.svelte";
    import { loadHeroes, onHeroesRefreshed, type Hero } from "$lib/features/heroes/heroes";
    import { steamAccount } from "$lib/features/steam-account/account.svelte";
    import { bestHero, heroRows } from "@deadlock-plus/stats/hero-rows";
    import { leaderboardProgress } from "@deadlock-plus/stats/leaderboard";
    import { progressSeries } from "@deadlock-plus/stats/rank";
    import { projectRank } from "@deadlock-plus/stats/rank-live";
    import { filterScope, heroBreakdown, inWindow, record, streaks, type Scope } from "@deadlock-plus/stats/stats";
    import { stats } from "$lib/features/stats/stats.svelte";
    import { buildRankChart } from "$lib/features/stats/rank-view";
    import CachedNote from "$lib/features/stats/components/shared/cached-note.svelte";
    import HistoryState from "$lib/features/stats/components/shared/history-state.svelte";
    import RefreshButton from "$lib/features/stats/components/shared/refresh-button.svelte";
    import RankSection from "$lib/features/stats/components/rank/rank-section.svelte";
    import FilterBar from "$lib/features/stats/components/stats/filter-bar.svelte";
    import FormRow from "$lib/features/stats/components/stats/form-row.svelte";
    import HeroHighlights from "$lib/features/stats/components/stats/hero-highlights.svelte";
    import HeroList from "$lib/features/stats/components/stats/hero-list.svelte";
    import RegionCard from "$lib/features/stats/components/stats/region-card.svelte";

    let scope = $state<Scope>("ranked");
    let days = $state<number | null>(30);
    let shown = $state(50);
    let heroes = $state<Record<number, Hero>>({});

    const accountId = $derived(steamAccount.account?.steamId32 ?? null);
    // Captured matches can stand in for the history while the API is down; the rank cannot.
    const hasGames = $derived(stats.status === "ready" || stats.matches.length > 0);

    const topTier = $derived(Math.max(0, ...stats.ranks.map((r) => r.tier)));
    const projection = $derived(projectRank(stats.matches, stats.rankInfo, topTier || undefined));
    const track = $derived(projection?.track ?? []);
    const info = $derived(projection?.info ?? null);
    const chart = $derived(info ? buildRankChart(progressSeries(track, info), shown, stats.ranks) : null);

    const scoped = $derived(filterScope(stats.matches, scope));
    const now = $derived(Date.now() / 1000);
    const windowed = $derived(inWindow(scoped, days, now));
    const summary = $derived(record(windowed));
    const run = $derived(streaks(scoped));
    const perHero = $derived(heroBreakdown(windowed));
    const board = $derived(leaderboardProgress(stats.matches, now));
    const rows = $derived(heroRows(board.heroes, perHero, heroBreakdown(scoped)));
    const form = $derived(windowed.filter((m) => m.outcome !== "unscored").slice(-12));

    $effect(() => {
        if (accountId !== null) void stats.load(accountId);
    });

    onMount(() => {
        void loadHeroes().then((h) => (heroes = h));
        return onHeroesRefreshed((h) => (heroes = h));
    });
</script>

<Page>
    <PageHeader title={t("stats.title")} subtitle={t("stats.subtitle")}>
        {#snippet actions()}
            <RefreshButton />
        {/snippet}
    </PageHeader>

    {#if steamAccount.loaded && accountId === null}
        <EmptyState size="base" spacing="xl">{t("stats.gate.no_account")}</EmptyState>
    {:else}
        <CachedNote />
        {#if stats.status === "ready"}
            <RankSection {info} {track} ranks={stats.ranks} modelled={projection?.modelled ?? 0} {chart} bind:shown />
        {:else}
            <section class="flex flex-col gap-5" aria-labelledby="rank-heading">
                <h2 id="rank-heading" class="text-xl">{t("rank.title")}</h2>
                <HistoryState name="stats-rank" title={t("stats.region.rank_error")} />
            </section>
        {/if}

        <section class="mt-6 flex flex-col gap-5 border-t border-border pt-10" aria-labelledby="games-heading">
            <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                <h2 id="games-heading" class="text-xl">{t("stats.section.games")}</h2>
                {#if hasGames}<FilterBar bind:scope bind:days />{/if}
            </div>
            {#if !hasGames}
                <HistoryState name="stats-games" title={t("stats.region.games_error")} />
            {:else}
                <p class="text-sm text-muted-foreground">
                    {t("stats.page.matches_known", { count: stats.matches.length })}
                </p>

                {#if windowed.length === 0}
                    <EmptyState size="base" spacing="md">
                        {t("stats.page.empty")}
                        {#snippet action()}
                            <SupportButton />
                        {/snippet}
                    </EmptyState>
                {:else}
                    <FormRow {windowed} {summary} {run} {form} />
                {/if}

                {#if perHero[0]}
                    <HeroHighlights mostPlayed={perHero[0]} best={bestHero(perHero)} {heroes} />
                {/if}
                <RegionCard {board} />
                <HeroList {rows} {heroes} />
            {/if}
        </section>
    {/if}
</Page>
