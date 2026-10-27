<script lang="ts">
    import { onMount } from "svelte";

    import { t } from "$lib/core/i18n.svelte";
    import { platform } from "$lib/core/platform";
    import { createPoller } from "$lib/core/poller";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import PageHeader from "@deadlock-plus/ui/page-header.svelte";

    import { adminAccess } from "$lib/features/admin-access/admin-access.svelte";
    import CurrentServer from "$lib/features/connection/components/current-server.svelte";
    import NetworkHistory from "$lib/features/connection/components/network-history.svelte";
    import MonitorNotices from "$lib/features/connection/components/monitor-notices.svelte";
    import PingCard from "$lib/features/connection/components/ping-card.svelte";
    import GameAdminCard from "$lib/features/live/components/game-admin-card.svelte";
    import MatchBoard from "$lib/features/live/components/match-board.svelte";
    import MatchHeader from "$lib/features/live/components/match-header.svelte";
    import PtraceCard from "$lib/features/live/components/ptrace-card.svelte";
    import StateCard from "$lib/features/live/components/state-card.svelte";
    import { live } from "$lib/features/live/live.svelte";
    import { stateLine } from "$lib/features/live/live";
    import { ptraceNotice, ptraceStatus, type PtraceStatus } from "$lib/features/live/ptrace";
    import { networkMonitor } from "$lib/features/connection/monitor.svelte";
    import AppRegion from "$lib/shell/app-region.svelte";

    const REFRESH_MS = 1000;

    let ptrace = $state.raw<PtraceStatus | null>(null);
    let ptraceApplied = $state(false);
    const ptraceShown = $derived(ptraceNotice(ptrace, platform, ptraceApplied));

    const snap = $derived(networkMonitor.snap);
    const relay = $derived(snap?.relay ?? null);
    const board = $derived(
        live.boardShown && live.state && live.match && live.match.teams.length > 0
            ? { match: live.match, phase: live.state.phase }
            : null,
    );
    const line = $derived(live.state ? stateLine(live.state.phase, live.state.matchPresent) : null);

    async function refresh() {
        if (platform === "linux") {
            ptraceStatus()
                .then((next) => (ptrace = next))
                .catch(() => {});
        }
        await networkMonitor.refresh();
    }

    onMount(() => {
        networkMonitor.reset();
        void networkMonitor.start();
        const stopPolling = createPoller(refresh, { intervalMs: REFRESH_MS, pauseWhenHidden: true }).start();
        return () => {
            stopPolling();
        };
    });
</script>

<Page>
    <PageHeader title={t("connection.page.title")} subtitle={t("connection.subtitle")}>
        {#snippet actions()}
            {#if board}
                <AppRegion name="live-match-header" quiet>
                    <MatchHeader match={board.match} phase={board.phase} />
                </AppRegion>
            {/if}
            <Badge variant={snap?.gameRunning ? "success" : "outline"}>
                {snap?.gameRunning ? t("connection.page.deadlock_running") : t("connection.page.deadlock_not_running")}
            </Badge>
        {/snippet}
    </PageHeader>

    <AppRegion name="live-match">
        {#if board}
            <MatchBoard match={board.match} phase={board.phase} heroes={live.heroes} tiers={live.tiers} />
        {:else if adminAccess.status?.gameRunsAsAdmin}
            <GameAdminCard />
        {:else if ptraceShown}
            <PtraceCard notice={ptraceShown} onapplied={() => (ptraceApplied = true)} />
        {:else if line}
            <StateCard {line} queue={live.state?.phase === "queuing" ? (live.match?.queue ?? null) : null} />
        {/if}
    </AppRegion>

    <AppRegion name="live-monitor-notices" size="sm">
        <MonitorNotices {snap} onretry={() => networkMonitor.retry()} />
    </AppRegion>

    <AppRegion name="live-current-server" size="sm">
        <CurrentServer gameRunning={snap?.gameRunning ?? false} {relay} />
    </AppRegion>

    <AppRegion name="live-ping" size="sm">
        <PingCard
            title={t("connection.series.ping")}
            note={live.state?.phase === "inMatch" ? t("connection.page.direct_note") : undefined}
            stats={relay?.ping ?? null}
            engine={networkMonitor.engine}
            engineNote={t("connection.page.engine_note")}
            unavailable={relay ? undefined : t("connection.page.waiting_server")}
        />
    </AppRegion>

    <AppRegion name="live-history" size="sm">
        <NetworkHistory />
    </AppRegion>
</Page>
