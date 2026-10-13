<script lang="ts">
    import { Trophy } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import PageHeader from "@deadlock-plus/ui/page-header.svelte";
    import { settings } from "$lib/features/settings/settings.svelte";
    import { steamAccount } from "$lib/features/steam-account/account.svelte";
    import { pct } from "$lib/features/stats/format";
    import { buildFindings } from "$lib/features/stats/insights";
    import { groupSessions, sessionHighlight, shouldSuggestBreak } from "@deadlock-plus/stats/sessions";
    import { highlightTitle } from "$lib/features/stats/sessions";
    import { stats } from "$lib/features/stats/stats.svelte";
    import { filterScope, type Scope } from "@deadlock-plus/stats/stats";
    import CachedNote from "$lib/features/stats/components/shared/cached-note.svelte";
    import HistoryGate from "$lib/features/stats/components/shared/history-gate.svelte";
    import RefreshButton from "$lib/features/stats/components/shared/refresh-button.svelte";
    import ScopeButtons from "$lib/features/stats/components/shared/scope-buttons.svelte";
    import BreakReminder from "$lib/features/stats/components/sessions/break-reminder.svelte";
    import Findings from "$lib/features/stats/components/sessions/findings.svelte";
    import SessionRow from "$lib/features/stats/components/sessions/session-row.svelte";

    const LOSS_STREAK = 3;
    const SHOWN = 15;

    let scope = $state<Scope>("ranked");

    const accountId = $derived(steamAccount.account?.steamId32 ?? null);
    const scoped = $derived(filterScope(stats.matches, scope));
    const sessions = $derived(groupSessions(scoped));
    const recent = $derived(sessions.slice(-SHOWN).reverse());
    const insights = $derived(buildFindings(sessions, -new Date().getTimezoneOffset()));
    const suggestBreak = $derived(settings.breakHint && shouldSuggestBreak(sessions, LOSS_STREAK, Date.now() / 1000));
    const highlight = $derived(sessionHighlight(sessions, Date.now() / 1000));

    $effect(() => {
        if (accountId !== null) void stats.load(accountId);
    });
</script>

<Page>
    <PageHeader title={t("sessions.title")} subtitle={t("sessions.subtitle")}>
        {#snippet actions()}
            <RefreshButton />
        {/snippet}
    </PageHeader>

    <HistoryGate>
        <CachedNote />
        <div class="flex flex-wrap items-center gap-2">
            <ScopeButtons bind:scope />
        </div>

        <BreakReminder lossStreak={LOSS_STREAK} suggest={suggestBreak} />

        {#if sessions.length === 0}
            <EmptyState size="base" spacing="lg">{t("sessions.empty")}</EmptyState>
        {:else}
            {#if highlight}
                <section>
                    <h2 class="mb-2 flex items-center gap-2 text-xl">
                        <Trophy class="size-5 text-brass" aria-hidden="true" />
                        {highlightTitle(highlight)}
                    </h2>
                    <ul><SessionRow session={highlight.session} /></ul>
                </section>
            {/if}

            <section>
                <h2 class="mb-2 text-xl">{t("sessions.latest")}</h2>
                <ul class="flex flex-col gap-2">
                    {#each recent as s (s.matches[0].matchId)}
                        <SessionRow session={s} />
                    {/each}
                </ul>
            </section>

            <section>
                <h2 class="text-xl">{t("sessions.results.heading")}</h2>
                <p class="mb-3 mt-1 text-sm text-muted-foreground">
                    {insights.baseline.winrate === null
                        ? t("sessions.results.intro")
                        : t("sessions.results.intro_detail", {
                              winrate: pct(insights.baseline.winrate),
                              games: insights.baseline.games,
                          })}
                </p>
                <Findings findings={insights.findings} baseline={insights.baseline.winrate} />
            </section>
        {/if}
    </HistoryGate>
</Page>
