<script lang="ts">
    import { onMount } from "svelte";

    import { t } from "$lib/core/i18n.svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import SupportButton from "$lib/components/support-button.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import PageHeader from "@deadlock-plus/ui/page-header.svelte";
    import { loadHeroes, onHeroesRefreshed, type Hero } from "$lib/features/heroes/heroes";
    import { steamAccount } from "$lib/features/steam-account/account.svelte";
    import { bestHero, heroRows } from "@deadlock-plus/stats/hero-rows";
    import { leaderboardProgress } from "@deadlock-plus/stats/leaderboard";
    import { stats } from "$lib/features/stats/stats.svelte";
    import { filterScope, heroBreakdown, inWindow, record, streaks, type Scope } from "@deadlock-plus/stats/stats";
    import CachedNote from "$lib/features/stats/components/shared/cached-note.svelte";
    import HistoryGate from "$lib/features/stats/components/shared/history-gate.svelte";
    import RefreshButton from "$lib/features/stats/components/shared/refresh-button.svelte";
    import FilterBar from "$lib/features/stats/components/stats/filter-bar.svelte";
    import HeroHighlights from "$lib/features/stats/components/stats/hero-highlights.svelte";
    import HeroList from "$lib/features/stats/components/stats/hero-list.svelte";
    import RegionCard from "$lib/features/stats/components/stats/region-card.svelte";
    import SummaryTiles from "$lib/features/stats/components/stats/summary-tiles.svelte";

    let scope = $state<Scope>("ranked");
    let days = $state<number | null>(30);
    let heroes = $state<Record<number, Hero>>({});

    const accountId = $derived(steamAccount.account?.steamId32 ?? null);
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

    <HistoryGate>
        <CachedNote />
        <FilterBar bind:scope bind:days />

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
            <SummaryTiles {windowed} {summary} {run} {form} />
            {#if perHero[0]}
                <HeroHighlights mostPlayed={perHero[0]} best={bestHero(perHero)} {heroes} />
            {/if}
        {/if}

        <RegionCard {board} />
        <HeroList {rows} {heroes} />
    </HistoryGate>
</Page>
