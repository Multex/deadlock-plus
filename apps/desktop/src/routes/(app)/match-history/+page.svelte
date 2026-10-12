<script lang="ts">
    import { onMount } from "svelte";
    import { Inbox, SearchX } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import Button from "$lib/ui/button.svelte";
    import EmptyState from "$lib/ui/empty-state.svelte";
    import SupportButton from "$lib/components/support-button.svelte";
    import Page from "$lib/ui/page.svelte";
    import PageHeader from "$lib/ui/page-header.svelte";
    import { loadHeroes, onHeroesRefreshed, type Hero } from "$lib/features/heroes/heroes";
    import FilterBar from "$lib/features/match-history/components/list/filter-bar.svelte";
    import MatchRow from "$lib/features/match-history/components/list/match-row.svelte";
    import DayHeader from "$lib/features/match-history/components/list/day-header.svelte";
    import ListSkeleton from "$lib/features/match-history/components/list/list-skeleton.svelte";
    import Pager from "$lib/features/match-history/components/list/pager.svelte";
    import SummaryStrip from "$lib/features/match-history/components/list/summary-strip.svelte";
    import { heroOptions } from "$lib/features/match-history/components/list/view-model";
    import { formStrip, groupByDay, summarizeRows } from "$lib/features/match-history/list-summary";
    import { matchHistory } from "$lib/features/match-history/history.svelte";
    import { steamAccount } from "$lib/features/steam-account/account.svelte";
    import CachedNote from "$lib/features/stats/components/shared/cached-note.svelte";
    import RefreshButton from "$lib/features/stats/components/shared/refresh-button.svelte";
    import { stats } from "$lib/features/stats/stats.svelte";

    let heroes = $state<Record<number, Hero>>({});

    const accountId = $derived(steamAccount.account?.steamId32 ?? null);
    const view = $derived(matchHistory.view);
    const filtered = $derived(matchHistory.filtered);
    const summary = $derived(summarizeRows(filtered));
    const form = $derived(formStrip(filtered));
    const groups = $derived(groupByDay(view.items));
    const nowS = $derived(Math.floor(Date.now() / 1000));
    const options = $derived(
        heroOptions(matchHistory.rows, (id) => heroes[id]?.name ?? t("stats.hero_fallback", { id })),
    );

    $effect(() => {
        if (accountId !== null) void matchHistory.load(accountId);
    });

    onMount(() => {
        void loadHeroes().then((h) => (heroes = h));
        return onHeroesRefreshed((h) => (heroes = h));
    });
</script>

<Page>
    <PageHeader title={t("match_history.list.title")} subtitle={t("match_history.list.subtitle")}>
        {#snippet actions()}
            <RefreshButton />
        {/snippet}
    </PageHeader>

    {#if steamAccount.loaded && accountId === null}
        <EmptyState size="base" spacing="xl">{t("stats.gate.no_account")}</EmptyState>
    {:else if stats.status === "error"}
        <EmptyState size="base" spacing="xl" tone="destructive" role="alert">
            {t("stats.gate.error", { error: stats.error ?? "" })}
        </EmptyState>
    {:else if stats.status !== "ready"}
        <ListSkeleton />
    {:else}
        <CachedNote />
        <FilterBar
            filters={matchHistory.filters}
            heroes={options}
            heroArt={heroes}
            onchange={(patch) => matchHistory.setFilters(patch)}
            onreset={() => matchHistory.resetFilters()}
        />

        {#if matchHistory.rows.length === 0}
            <EmptyState as="div" size="base" spacing="xl" class="flex flex-col items-center gap-3">
                <span class="flex size-14 items-center justify-center rounded-full bg-muted">
                    <Inbox class="size-7" aria-hidden="true" />
                </span>
                <p>{t("match_history.list.empty")}</p>
                {#snippet action()}
                    <SupportButton />
                {/snippet}
            </EmptyState>
        {:else if view.total === 0}
            <EmptyState as="div" size="base" spacing="lg" class="flex flex-col items-center gap-3">
                <span class="flex size-14 items-center justify-center rounded-full bg-muted">
                    <SearchX class="size-7" aria-hidden="true" />
                </span>
                <p>{t("match_history.list.no_results")}</p>
                <Button variant="outline" size="sm" onclick={() => matchHistory.resetFilters()}>
                    {t("match_history.list.filter.reset")}
                </Button>
            </EmptyState>
        {:else}
            <SummaryStrip {summary} {form} {heroes} />
            <div class="flex flex-col gap-1">
                {#each groups as group (group.key)}
                    <section class="flex flex-col gap-2">
                        <DayHeader {group} {nowS} />
                        <ul class="flex flex-col gap-2">
                            {#each group.rows as row (row.matchId)}
                                <MatchRow {row} hero={heroes[row.heroId]} tiers={stats.ranks} />
                            {/each}
                        </ul>
                    </section>
                {/each}
            </div>
            {#if view.pageCount > 1}
                <Pager page={view.page} pageCount={view.pageCount} onpage={(p) => matchHistory.setPage(p)} />
            {/if}
        {/if}
    {/if}
</Page>
