<script lang="ts">
    import { formatNumber, t } from "$lib/core/i18n.svelte";
    import {
        Activity,
        CircleAlert,
        CloudUpload,
        CloudOff,
        Gamepad2,
        MessageCircle,
        Radio,
        Gauge,
        Search,
        Server,
        ServerOff,
        TriangleAlert,
    } from "@lucide/svelte";
    import {
        apiHealth,
        discordBarState,
        ingestStatus,
        jobPercent,
        jobStatusText,
        jobs,
        liveBarItem,
        live,
        performanceScan,
        presenceStatus,
        settings,
        getAppInfo,
    } from "$lib/features/registry";

    import { onMount } from "svelte";
    import { sidebarState } from "./sidebar-state.svelte";

    let { withSidebar = true }: { withSidebar?: boolean } = $props();

    const JOB_ICONS: Record<string, typeof Search> = { "patch-notes-index": Search, "addon-scan": Gauge };

    let version = $state<string | null>(null);

    onMount(() => {
        getAppInfo()
            .then((info) => (version = info.appVersion))
            .catch(() => {});
    });

    const gameRunning = $derived(jobs.gameRunning);

    const s = $derived(ingestStatus.status);

    const ingest = $derived.by(() => {
        if (!settings.matchIngest)
            return {
                icon: CloudOff,
                ok: true,
                tone: "text-muted-foreground/70",
                text: t("shell.statusbar.ingest.off"),
            };
        if (!s)
            return {
                icon: CloudUpload,
                ok: false,
                tone: "text-muted-foreground/70",
                text: t("shell.statusbar.ingest.starting"),
            };
        if (!s.steamFound)
            return {
                icon: CircleAlert,
                ok: false,
                tone: "text-warning",
                text: t("shell.statusbar.ingest.no_steam_cache"),
            };
        if (s.lastError)
            return {
                icon: CircleAlert,
                ok: false,
                tone: "text-destructive",
                text: t("shell.statusbar.ingest.error"),
            };
        return {
            icon: CloudUpload,
            ok: true,
            tone: "text-success",
            text: t("shell.statusbar.ingest.active", { count: formatNumber(s.submitted) }),
        };
    });

    const api = $derived.by(() => {
        const r = apiHealth.result;
        if (!r)
            return {
                icon: Server,
                ok: false,
                tone: "text-muted-foreground/70",
                text: t("shell.statusbar.api.checking"),
                title: t("shell.statusbar.api.checking_title"),
            };
        if (r.level === "ok")
            return {
                icon: Server,
                ok: true,
                tone: "text-success",
                text: t("shell.statusbar.api.online"),
                title: t("shell.statusbar.api.online_title"),
            };
        if (r.level === "degraded")
            return {
                icon: CircleAlert,
                ok: false,
                tone: "text-warning",
                text: t("shell.statusbar.api.degraded"),
                title: t("shell.statusbar.api.degraded_title", { services: r.down.join(", ") }),
            };
        return {
            icon: ServerOff,
            ok: false,
            tone: "text-destructive",
            text: t("shell.statusbar.api.offline"),
            title: t("shell.statusbar.api.offline_title"),
        };
    });

    const service = $derived.by(() => {
        const title = `${api.title} · ${ingest.text}`;
        const problem = !api.ok ? api : !ingest.ok ? ingest : null;
        if (problem) return { icon: problem.icon, tone: problem.tone, text: problem.text, title };
        return { icon: api.icon, tone: api.tone, text: null, title };
    });
    const ServiceIcon = $derived(service.icon);

    const discord = $derived(discordBarState(settings.presence.level !== "off", presenceStatus.status));

    const liveItem = $derived(
        live.state ? liveBarItem(live.state.phase, live.match?.clockSecs ?? null, live.match?.paused ?? false) : null,
    );

    const pausedJobs = $derived(jobs.active.filter((j) => j.state === "paused"));
    const averagePercent = $derived(
        jobs.active.length > 0 ? jobs.active.reduce((sum, j) => sum + jobPercent(j), 0) / jobs.active.length : 0,
    );

    const performanceIssues = $derived(!performanceScan.scanning && performanceScan.summary.flagged > 0);
</script>

<footer
    class="pointer-events-auto flex h-7 shrink-0 flex-row-reverse items-center gap-4 bg-chrome px-3 text-xs text-muted-foreground select-none"
>
    {#if liveItem}
        <a
            href="/live"
            class="flex min-w-0 items-center gap-1.5 text-success hover:underline"
            title={t("shell.statusbar.live.open")}
        >
            <Radio class="size-3.5 shrink-0" />
            <span class="truncate">
                {t(liveItem.key)}{#if liveItem.clock}&nbsp;&middot;&nbsp;<span class="tabular-nums"
                        >{liveItem.clock}</span
                    >{/if}
            </span>
        </a>
        <span class="text-muted-foreground/30" aria-hidden="true">&middot;</span>
    {:else if gameRunning !== null}
        <span
            class="flex items-center gap-1.5 {gameRunning ? 'text-success' : 'text-muted-foreground/70'}"
            title={gameRunning ? t("shell.statusbar.game.running_title") : t("shell.statusbar.game.stopped_title")}
        >
            <Gamepad2 class="size-3.5 shrink-0" />
            <span>{gameRunning ? t("shell.statusbar.game.running") : t("shell.statusbar.game.stopped")}</span>
        </span>
        <span class="text-muted-foreground/30" aria-hidden="true">&middot;</span>
    {/if}
    {#if discord !== "off"}
        <a
            href="/settings/discord"
            class="flex min-w-0 items-center gap-1.5 hover:underline {discord === 'connected'
                ? 'text-success'
                : 'text-muted-foreground/70'}"
            title={discord === "connected"
                ? t("shell.statusbar.discord.connected_title")
                : t("shell.statusbar.discord.searching_title")}
        >
            <MessageCircle class="size-3.5 shrink-0" />
            {#if discord !== "connected"}<span class="truncate">{t("shell.statusbar.discord.searching")}</span>{/if}
        </a>
        <span class="text-muted-foreground/30" aria-hidden="true">&middot;</span>
    {/if}
    <span class="flex min-w-0 items-center gap-1.5 {service.tone}" title={service.title}>
        <ServiceIcon class="size-3.5 shrink-0" />
        {#if service.text}<span class="truncate">{service.text}</span>{/if}
    </span>
    {#if jobs.active.length > 1}
        <span class="text-muted-foreground/30" aria-hidden="true">&middot;</span>
        <span
            class="flex min-w-0 items-center gap-2 text-muted-foreground/70"
            title={jobs.active.map(jobStatusText).join("\n")}
        >
            <Activity class="size-3.5 shrink-0" />
            <span class="truncate">{t("shell.statusbar.tasks", { count: jobs.active.length })}</span>
            {#if pausedJobs.length > 0}
                <button
                    type="button"
                    class="shrink-0 underline hover:text-foreground"
                    onclick={() => pausedJobs.forEach((j) => void jobs.forceRun(j.id))}
                >
                    {t("shell.statusbar.run_now")}
                </button>
            {:else}
                <span class="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-muted-foreground/20">
                    <span
                        class="block h-full rounded-full bg-brass transition-[width] duration-300"
                        style="width: {averagePercent}%"
                    ></span>
                </span>
            {/if}
        </span>
    {:else}
        {#each jobs.active as job (job.id)}
            {@const JobIcon = JOB_ICONS[job.id] ?? Activity}
            {@const text = jobStatusText(job)}
            <span class="text-muted-foreground/30" aria-hidden="true">&middot;</span>
            <span class="flex min-w-0 items-center gap-2 text-muted-foreground/70" title={text}>
                <JobIcon class="size-3.5 shrink-0" />
                <span class="truncate">{text}</span>
                {#if job.state === "paused"}
                    <button
                        type="button"
                        class="shrink-0 underline hover:text-foreground"
                        onclick={() => void jobs.forceRun(job.id)}
                    >
                        {t("shell.statusbar.run_now")}
                    </button>
                {:else}
                    <span class="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-muted-foreground/20">
                        <span
                            class="block h-full rounded-full bg-brass transition-[width] duration-300"
                            style="width: {jobPercent(job)}%"
                        ></span>
                    </span>
                {/if}
            </span>
        {/each}
    {/if}
    {#if performanceIssues}
        <span class="text-muted-foreground/30" aria-hidden="true">&middot;</span>
        <a
            href="/performance"
            class="flex min-w-0 items-center gap-1.5 text-warning hover:underline"
            title={t("shell.statusbar.open_performance")}
        >
            <TriangleAlert class="size-3.5 shrink-0" />
            <span class="truncate">{t("shell.statusbar.performance_issues")}</span>
        </a>
    {/if}
    {#if version}
        <span
            class="mr-auto shrink-0 truncate text-center text-muted-foreground/60 tabular-nums transition-[width] duration-200 {withSidebar
                ? `-ml-3 ${sidebarState.collapsed ? 'w-16' : 'w-56'}`
                : ''}">v{version}</span
        >
    {/if}
</footer>
