<script lang="ts">
    import { onMount } from "svelte";
    import { Inbox, SearchX, Trophy } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import PageHeader from "@deadlock-plus/ui/page-header.svelte";
    import SupportButton from "$lib/components/support-button.svelte";
    import { loadHeroes, onHeroesRefreshed, type Hero } from "$lib/features/heroes/heroes";
    import CoverageStrip from "$lib/features/match-history/components/list/coverage-strip.svelte";
    import { matchCoverage } from "$lib/features/match-history/coverage.svelte";
    import FilterBar from "$lib/features/match-history/components/list/filter-bar.svelte";
    import RecoveryPanel from "$lib/features/match-history/components/recovery/recovery-panel.svelte";
    import ListSkeleton from "$lib/features/match-history/components/list/list-skeleton.svelte";
    import MatchRow from "$lib/features/match-history/components/list/match-row.svelte";
    import Pager from "$lib/features/match-history/components/list/pager.svelte";
    import SessionHeader from "$lib/features/match-history/components/list/session-header.svelte";
    import SummaryStrip from "$lib/features/match-history/components/list/summary-strip.svelte";
    import { heroOptions } from "$lib/features/match-history/components/list/view-model";
    import { LOSS_STREAK, matchHistory } from "$lib/features/match-history/history.svelte";
    import { steamAccount } from "$lib/features/steam-account/account.svelte";
    import Results from "$lib/features/stats/components/sessions/results.svelte";
    import SessionsBar from "$lib/features/stats/components/sessions/sessions-bar.svelte";
    import { highlightTitle } from "$lib/features/stats/sessions";
    import CachedNote from "$lib/features/stats/components/shared/cached-note.svelte";
    import HistoryState from "$lib/features/stats/components/shared/history-state.svelte";
    import RefreshButton from "$lib/features/stats/components/shared/refresh-button.svelte";
    import { stats } from "$lib/features/stats/stats.svelte";
    import { formStrip, summarizeRows } from "@deadlock-plus/match/list-summary";

    let heroes = $state<Record<number, Hero>>({});

    const accountId = $derived(steamAccount.account?.steamId32 ?? null);
    // Captured matches can stand in for the history while the API is down.
    const hasRows = $derived(stats.status === "ready" || matchHistory.rows.length > 0);
    const view = $derived(matchHistory.sessionView);
    const filtered = $derived(matchHistory.filtered);
    const summary = $derived(summarizeRows(filtered));
    const form = $derived(formStrip(filtered));
    const insights = $derived(matchHistory.insights);
    const suggestBreak = $derived(matchHistory.suggestBreak);
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
    {:else if !hasRows}
        <HistoryState name="match-list" title={t("match_history.list.error")}>
            {#snippet loading()}
                <ListSkeleton />
            {/snippet}
        </HistoryState>
    {:else}
        <CachedNote />
        <CoverageStrip />
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

            <SessionsBar lossStreak={LOSS_STREAK} suggest={suggestBreak} />

            <div class="flex flex-col gap-5">
                {#each view.items as group (group.key)}
                    <section class="flex flex-col gap-2">
                        {#if group.highlight}
                            <h3 class="flex items-center gap-2 text-base font-medium">
                                <Trophy class="size-5 text-brass" aria-hidden="true" />
                                {highlightTitle({ kind: group.highlight, verdict: group.verdict })}
                            </h3>
                        {/if}
                        <SessionHeader {group} {nowS} />
                        <ul class="ml-3 flex flex-col gap-2 border-l-2 border-border/60 pl-3">
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

            <Results findings={insights.findings} baseline={insights.baseline} />
        {/if}
    {/if}

    <!-- Outside the status branches: a stats reload shows the skeleton, and unmounting the panel closes it. -->
    <RecoveryPanel missingIds={matchCoverage.summary?.missingIds ?? []} />
</Page>
