<script lang="ts">
    import { page } from "$app/state";
    import { ArrowLeft, LoaderCircle } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import RegionError from "@deadlock-plus/ui/region-error.svelte";
    import ApiBusyNotice from "$lib/features/api-health/components/api-busy-notice.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import ExportControl from "$lib/features/match-history/components/detail/export-control.svelte";
    import FrontPageButton from "$lib/features/front-page/front-page-button.svelte";
    import DeepDive from "$lib/features/match-history/components/detail/deep-dive.svelte";
    import AfterPaint from "$lib/shell/after-paint.svelte";
    import Ping from "$lib/features/match-history/components/detail/ping.svelte";
    import Replay from "$lib/features/match-history/components/detail/replay.svelte";
    import Scoreboard from "$lib/features/match-history/components/detail/scoreboard.svelte";
    import { headerSummary } from "@deadlock-plus/match/scoreboard";
    import Summary from "$lib/features/match-history/components/detail/summary.svelte";
    import MissingMatch from "$lib/features/match-history/components/detail/missing-match.svelte";
    import ReplayStatus from "$lib/features/match-history/components/detail/replay-status.svelte";
    import { findPlayer } from "@deadlock-plus/match/detail";
    import { versusFor } from "@deadlock-plus/match/versus";
    import { matchHistory } from "$lib/features/match-history/history.svelte";
    import { steamAccount } from "$lib/features/steam-account/account.svelte";

    const matchId = $derived(Number(page.params.id));
    const valid = $derived(Number.isSafeInteger(matchId) && matchId > 0);
    const ownAccountId = $derived(steamAccount.account?.steamId32 ?? null);
    const ownAccountIds = $derived(ownAccountId === null ? [] : [ownAccountId]);
    let boardNode = $state<HTMLElement | null>(null);
    const detail = $derived(matchHistory.detailStatus === "ready" ? matchHistory.detail : null);

    const own = $derived(!!detail && ownAccountId !== null && !!findPlayer(detail, [ownAccountId]));

    const versus = $derived.by(() => {
        const own = detail && ownAccountId !== null ? findPlayer(detail, [ownAccountId]) : undefined;
        if (!detail || !own) return null;
        return versusFor(matchHistory.rows, { ...own, durationS: detail.durationS }, detail.matchId);
    });

    $effect(() => {
        if (!valid) return;
        void matchHistory.openDetail(matchId);
        return () => matchHistory.closeDetail();
    });
</script>

<Page class="max-w-[1232px] px-4">
    <div>
        <a
            href="/match-history"
            class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
            <ArrowLeft class="size-4" aria-hidden="true" />
            {t("match_history.detail.back")}
        </a>
        <div class="mt-2 flex flex-wrap items-center gap-3">
            <h1 class="text-3xl">{t("match_history.detail.title", { id: valid ? matchId : "?" })}</h1>
            {#if detail?.source === "provisional"}
                <Badge variant="warning" title={t("match_history.list.provisional_hint")}>
                    {t("match_history.list.provisional")}
                </Badge>
            {/if}
        </div>
    </div>

    {#if !valid}
        <EmptyState size="base" spacing="xl" role="alert">{t("match_history.detail.invalid")}</EmptyState>
    {:else if !detail && matchHistory.detailBusy.active}
        <div data-region="match-detail" data-region-state="busy">
            <ApiBusyNotice busy={matchHistory.detailBusy} />
        </div>
    {:else if matchHistory.detailStatus === "error"}
        <RegionError
            name="match-detail"
            title={t("match_history.detail.load_error")}
            body={t("region.error_body")}
            retryLabel={t("region.retry")}
            onretry={() => void matchHistory.openDetail(matchId)}
        />
    {:else if matchHistory.detailStatus === "unavailable"}
        <MissingMatch {matchId} />
    {:else if detail}
        <Summary summary={headerSummary(detail, ownAccountId)} {versus}>
            {#snippet actions()}
                <div class="flex flex-wrap items-start justify-end gap-3">
                    <ReplayStatus matchId={detail.matchId} startTime={detail.startTime} {own} />
                    <FrontPageButton {detail} {ownAccountId} />
                    <ExportControl node={boardNode} {detail} {ownAccountId} />
                </div>
            {/snippet}
        </Summary>
        <div bind:this={boardNode}>
            <Scoreboard {detail} {ownAccountId} {versus} />
        </div>
        <Replay {detail} {ownAccountIds} />
        <Ping {detail} />
        <AfterPaint><DeepDive {detail} {ownAccountIds} /></AfterPaint>
    {:else}
        <EmptyState size="base" spacing="xl" role="status" class="flex items-center justify-center gap-2">
            <LoaderCircle class="size-4 animate-spin" aria-hidden="true" />
            {t("match_history.detail.loading")}
        </EmptyState>
    {/if}
</Page>
