<script lang="ts">
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { ChartLine, Newspaper, Timer, Trophy } from "@lucide/svelte";

    import { formatDate, t } from "$lib/core/i18n.svelte";
    import { FEATURES } from "$lib/features/registry";
    import { steamAccount } from "$lib/features/steam-account/account.svelte";
    import { glanceValue, greeting, pct, relativeDay, sessionSeed, signed, statsNote } from "$lib/features/home/home";
    import GlanceTiles from "$lib/features/home/components/glance-tiles.svelte";
    import HomeHeader from "$lib/features/home/components/home-header.svelte";
    import MaintenanceBanner from "$lib/features/home/components/maintenance-banner.svelte";
    import OverviewCard from "$lib/features/home/components/overview-card.svelte";
    import ToolList from "$lib/features/home/components/tool-list.svelte";
    import { alerts } from "$lib/features/alerts/alerts.svelte";
    import { formatPublished } from "$lib/features/alerts/alerts";
    import { stats } from "$lib/features/stats/stats.svelte";
    import SyncingBadge from "$lib/features/stats/components/shared/syncing-badge.svelte";
    import { formatPlaytime } from "$lib/features/stats/stats";
    import { standing, subrankAt, windowStats } from "@deadlock-plus/stats/rank";
    import { projectRank } from "@deadlock-plus/stats/rank-live";
    import { groupSessions, sessionVerdict, summarizeSession, type Verdict } from "@deadlock-plus/stats/sessions";
    import { firewallCapability, getGameDefinitions, listBlockedGroupIds } from "$lib/features/server-picker/api";
    import { savedOrFetchedServerData } from "$lib/features/server-picker/cache";
    import { readVoiceBan } from "$lib/features/voice-bans/api";
    import { parseVoiceBan } from "$lib/features/voice-bans/voice-ban";
    import { listDemos } from "$lib/features/demos/api";
    import { settings } from "$lib/features/settings/settings.svelte";
    import { jobs } from "$lib/features/jobs/jobs.svelte";
    import { launchGame } from "$lib/core/deeplink";
    import { countdown, nextMaintenance, weekdays } from "$lib/features/settings/maintenance";

    interface Summary {
        blocked: number | null;
        mutes: number | null;
        replays: number | null;
    }

    let summary = $state<Summary>({ blocked: null, mutes: null, replays: null });
    let nextMaintenanceAt = $state<number | null>(null);

    const maintenanceLine = $derived.by(() => {
        if (nextMaintenanceAt === null) return "";
        const when = new Date(nextMaintenanceAt * 1000);
        const day = weekdays()[when.getDay() === 0 ? 6 : when.getDay() - 1];
        const time = formatDate(when, { hour: "2-digit", minute: "2-digit" });
        return t("home.maintenance.line", {
            day,
            time,
            countdown: countdown(nextMaintenanceAt - Date.now() / 1000),
        });
    });

    const account = $derived(steamAccount.account);
    const name = $derived(account?.personaName || null);

    async function loadBlocked(): Promise<number | null> {
        const capability = await firewallCapability();
        if (!capability.supported) return null;
        const game = (await getGameDefinitions())[0];
        if (!game) return null;
        const data = await savedOrFetchedServerData(game.id);
        const ids = [...new Set([...data.clustered, ...data.unclustered].map((g) => g.id))];
        return (await listBlockedGroupIds(ids)).length;
    }

    onMount(() => {
        void loadBlocked().then(
            (n) => (summary.blocked = n),
            () => {},
        );
        void readVoiceBan().then(
            (file) => {
                summary.mutes = parseVoiceBan(file.text).users.length;
            },
            () => {},
        );
        void settings.ready
            .then(() => nextMaintenance())
            .then(
                (at) => (nextMaintenanceAt = at),
                () => {},
            );
        void listDemos().then(
            (l) => (summary.replays = l.demos.length),
            () => {},
        );
    });

    const FORM_WINDOW = 20;
    function verdictLabel(verdict: Verdict): string {
        switch (verdict) {
            case "excellent":
                return t("home.verdict.excellent");
            case "good":
                return t("home.verdict.good");
            case "bad":
                return t("home.verdict.bad");
            case "neutral":
                return t("home.verdict.neutral");
        }
    }

    const accountId = $derived(account?.steamId32 ?? null);
    const statsReady = $derived(stats.status === "ready");
    const noAccount = $derived(steamAccount.loaded && accountId === null);
    const projection = $derived(
        projectRank(stats.matches, stats.rankInfo, Math.max(0, ...stats.ranks.map((r) => r.tier)) || undefined),
    );
    const track = $derived(projection?.track ?? []);
    const info = $derived(projection?.info ?? null);
    const modelled = $derived(projection?.modelled ?? 0);
    const now = $derived(info ? standing(info) : null);
    const tierName = (tier: number) => stats.ranks.find((r) => r.tier === tier)?.name ?? t("home.tier", { tier });
    const rankLabel = $derived(now ? `${tierName(now.tier)} ${now.sub}` : null);
    const nextRankLabel = $derived.by(() => {
        if (!info) return null;
        const cur = subrankAt(info.finalFlat);
        const next = subrankAt(cur.start + cur.span);
        return `${tierName(next.tier)} ${next.sub}`;
    });
    const rankPercent = $derived(now && now.within !== null ? Math.round((now.within / now.span) * 100) : null);
    const form = $derived(windowStats(track, FORM_WINDOW));
    const lastSession = $derived(groupSessions(stats.matches).at(-1));
    const lastSummary = $derived(lastSession ? summarizeSession(lastSession) : null);
    const lastSyncing = $derived(lastSession?.matches.filter((m) => m.provisional).length ?? 0);
    const latestAlert = $derived(alerts.items[0] ?? null);

    $effect(() => {
        if (accountId !== null) void stats.load(accountId);
    });

    const tiles = $derived([
        { href: "/server-picker", label: t("home.tiles.blocked"), value: glanceValue(summary.blocked) },
        { href: "/voice-bans", label: t("home.tiles.muted"), value: glanceValue(summary.mutes) },
        { href: "/demos", label: t("home.tiles.replays"), value: glanceValue(summary.replays) },
    ]);
</script>

<div class="flex min-h-full items-center justify-center px-8 py-10">
    <div class="flex w-full max-w-6xl flex-col gap-10">
        <HomeHeader
            avatar={account?.avatarDataUrl ?? null}
            greeting={greeting(new Date().getHours(), name, sessionSeed)}
        />

        <GlanceTiles {tiles} gameRunning={jobs.gameRunning} onLaunch={() => void launchGame().catch(() => {})} />

        {#if maintenanceLine}
            <MaintenanceBanner
                line={maintenanceLine}
                reminderOn={settings.maintenance.enabled}
                onopen={() => goto("/settings/notifications")}
            />
        {/if}

        <section class="flex flex-col gap-3" aria-label={t("home.your_deadlock")}>
            <h2 class="font-heading text-sm font-semibold tracking-wide text-muted-foreground">
                {t("home.your_deadlock")}
            </h2>
            <ul class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <OverviewCard href="/rank" icon={Trophy} title={t("home.rank.title")}>
                    {#if rankLabel}
                        <p class="flex items-center gap-2 font-heading text-2xl font-semibold text-brass">
                            {rankLabel}
                            {#if modelled > 0}<SyncingBadge count={modelled} />{/if}
                        </p>
                        {#if rankPercent !== null}
                            <div class="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
                                <div class="h-full rounded-full bg-primary" style="width: {rankPercent}%"></div>
                            </div>
                            <p class="text-xs text-muted-foreground">
                                {t("home.rank.progress", { percent: rankPercent, rank: nextRankLabel ?? "" })}
                            </p>
                        {/if}
                    {:else}
                        <p class="text-sm text-muted-foreground">
                            {statsNote(stats.status, t("home.rank.empty"), noAccount)}
                        </p>
                    {/if}
                </OverviewCard>

                <OverviewCard href="/rank" icon={ChartLine} title={t("home.form.title")}>
                    {#if form.games > 0}
                        <p class="flex items-center gap-2 font-heading text-2xl font-semibold tabular-nums">
                            {pct(form.winrate)}
                            {#if modelled > 0}<SyncingBadge count={modelled} />{/if}
                        </p>
                        <p class="text-xs text-muted-foreground">
                            {t("home.form.summary", {
                                wins: form.wins,
                                losses: form.losses,
                                net: signed(form.net),
                                games: form.games,
                            })}
                        </p>
                    {:else}
                        <p class="text-sm text-muted-foreground">
                            {statsNote(stats.status, t("home.form.empty"), noAccount)}
                        </p>
                    {/if}
                </OverviewCard>

                <OverviewCard
                    href="/alerts"
                    icon={Newspaper}
                    title={t("home.update.title")}
                    badge={alerts.unread > 0 ? t("home.update.unread", { count: alerts.unread }) : undefined}
                >
                    {#if latestAlert}
                        <p class="line-clamp-2 text-sm font-medium">{latestAlert.title}</p>
                        <p class="text-xs text-muted-foreground">{formatPublished(latestAlert.published)}</p>
                    {:else}
                        <p class="text-sm text-muted-foreground">{t("home.update.empty")}</p>
                    {/if}
                </OverviewCard>

                <OverviewCard href="/sessions" icon={Timer} title={t("home.session.title")}>
                    {#if lastSummary}
                        <p class="flex items-center gap-2 font-heading text-2xl font-semibold">
                            {relativeDay(lastSummary.startTime, Date.now() / 1000)}
                            {#if lastSyncing > 0}<SyncingBadge count={lastSyncing} />{/if}
                        </p>
                        <p class="text-xs text-muted-foreground">
                            {lastSummary.netDelta === null
                                ? t("home.session.summary", {
                                      verdict: verdictLabel(sessionVerdict(lastSummary)),
                                      wins: lastSummary.wins,
                                      losses: lastSummary.losses,
                                      duration: formatPlaytime(lastSummary.durationS),
                                  })
                                : t("home.session.summary_delta", {
                                      verdict: verdictLabel(sessionVerdict(lastSummary)),
                                      wins: lastSummary.wins,
                                      losses: lastSummary.losses,
                                      duration: formatPlaytime(lastSummary.durationS),
                                      net: signed(lastSummary.netDelta),
                                  })}
                        </p>
                    {:else}
                        <p class="text-sm text-muted-foreground">
                            {statsNote(stats.status, t("home.session.empty"), noAccount)}
                        </p>
                    {/if}
                </OverviewCard>
            </ul>
        </section>

        <ToolList tools={FEATURES} />
    </div>
</div>
