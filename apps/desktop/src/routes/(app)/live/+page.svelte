<script lang="ts">
    import { onMount } from "svelte";

    import { t } from "$lib/core/i18n.svelte";
    import { createPoller } from "$lib/core/poller";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import Page from "@deadlock-plus/ui/page.svelte";
    import PageHeader from "@deadlock-plus/ui/page-header.svelte";

    import CurrentServer from "$lib/features/connection/components/current-server.svelte";
    import HistoryCard from "$lib/features/connection/components/history-card.svelte";
    import MonitorNotices from "$lib/features/connection/components/monitor-notices.svelte";
    import PingCard from "$lib/features/connection/components/ping-card.svelte";
    import MatchBoard from "$lib/features/live/components/match-board.svelte";
    import MatchHeader from "$lib/features/live/components/match-header.svelte";
    import StateCard from "$lib/features/live/components/state-card.svelte";
    import { live } from "$lib/features/live/live.svelte";
    import { stateLine } from "$lib/features/live/live";
    import { enginePingLatest, networkPoll, startNetworkMonitor } from "$lib/features/connection/api";
    import { appendPoint, historySeries, mergeTail } from "$lib/features/connection/connection";
    import type { EnginePingView, HistoryPoint, NetworkSnapshot } from "$lib/features/connection/types";

    const REFRESH_MS = 1000;

    let snap = $state.raw<NetworkSnapshot | null>(null);
    let history = $state.raw<HistoryPoint[]>([]);
    let engine = $state.raw<EnginePingView | null>(null);

    const relay = $derived(snap?.relay ?? null);
    let engineHistory = $state.raw<HistoryPoint[]>([]);
    const chart = $derived(historySeries(engine ? engineHistory : history));
    const board = $derived(
        live.boardShown && live.state && live.match && live.match.teams.length > 0
            ? { match: live.match, phase: live.state.phase }
            : null,
    );
    const line = $derived(live.state ? stateLine(live.state.phase, live.state.matchPresent) : null);

    async function refresh() {
        try {
            const poll = await networkPoll(history.at(-1)?.t ?? null);
            snap = poll.snapshot;
            history = mergeTail(history, poll.tail);
            engine = await enginePingLatest();
            engineHistory = engine ? appendPoint(engineHistory, { t: Date.now(), raw: engine.pingMs }) : [];
        } catch {
            // Transient invoke failures just skip a tick.
        }
    }

    async function retry() {
        await startNetworkMonitor(true);
        await refresh();
    }

    onMount(() => {
        void startNetworkMonitor().then(refresh);
        const stopPolling = createPoller(refresh, { intervalMs: REFRESH_MS, pauseWhenHidden: true }).start();
        return () => {
            stopPolling();
        };
    });
</script>

<Page>
    <PageHeader title={t("connection.page.title")} subtitle={t("connection.subtitle")}>
        {#snippet actions()}
            {#if board}<MatchHeader match={board.match} phase={board.phase} />{/if}
            <Badge variant={snap?.gameRunning ? "success" : "outline"}>
                {snap?.gameRunning ? t("connection.page.deadlock_running") : t("connection.page.deadlock_not_running")}
            </Badge>
        {/snippet}
    </PageHeader>

    {#if board}
        <MatchBoard match={board.match} phase={board.phase} heroes={live.heroes} tiers={live.tiers} />
    {:else if line}
        <StateCard {line} queue={live.state?.phase === "queuing" ? (live.match?.queue ?? null) : null} />
    {/if}

    <MonitorNotices {snap} onretry={retry} />

    <CurrentServer gameRunning={snap?.gameRunning ?? false} {relay} />

    <PingCard
        title={t("connection.series.ping")}
        note={live.state?.phase === "inMatch" ? t("connection.page.direct_note") : undefined}
        stats={relay?.ping ?? null}
        {engine}
        engineNote={t("connection.page.engine_note")}
        unavailable={relay ? undefined : t("connection.page.waiting_server")}
    />

    <HistoryCard shown={chart.shown} series={chart.series} />
</Page>
