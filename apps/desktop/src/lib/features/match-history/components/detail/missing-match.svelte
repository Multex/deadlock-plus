<script lang="ts">
    import { CircleCheck, FileText, Film, Gamepad2, LoaderCircle, RotateCw, TriangleAlert } from "@lucide/svelte";
    import { toast } from "svelte-sonner";

    import { errorText } from "$lib/core/errors";
    import { formatDate, t, tn } from "$lib/core/i18n.svelte";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import Section from "@deadlock-plus/ui/section.svelte";
    import { recoverMatches } from "$lib/features/gc/api";
    import { gcStatus } from "$lib/features/gc/status.svelte";
    import { continuesText } from "$lib/features/gc/status-line";
    import { loadHeroes, onHeroesRefreshed, type Hero } from "$lib/features/heroes/heroes";
    import { jobs } from "$lib/features/jobs/jobs.svelte";
    import { formatClock } from "$lib/features/live/live";
    import { settings } from "$lib/features/settings/settings.svelte";
    import { matchCoverage } from "../../coverage.svelte";
    import { detailState, etaParts, replayState, type DetailState } from "../../detail-state";
    import { matchHistory } from "../../history.svelte";
    import { kdaText, modeLabelKey, outcomeLabelKey } from "../list/view-model";

    let { matchId }: { matchId: number } = $props();

    const OUTCOME_TONE = { win: "text-primary", loss: "text-destructive", unscored: "text-muted-foreground" } as const;

    const row = $derived(matchHistory.rows.find((r) => r.matchId === matchId) ?? null);
    let heroes = $state<Record<number, Hero>>({});
    const coverage = $derived(matchCoverage.forMatch(matchId));
    const applies = $derived(matchCoverage.applies(matchId));
    let busy = $state(false);
    let nowMs = $state(Date.now());
    let headSinceMs = $state<number | null>(null);

    const meta = $derived.by(() => {
        if (!row) return [];
        return [
            t(modeLabelKey(row.mode)),
            formatClock(row.durationS),
            formatDate(row.startTime * 1000, { dateStyle: "medium", timeStyle: "short" }),
            heroes[row.heroId]?.name ?? t("stats.hero_fallback", { id: row.heroId }),
            kdaText(row),
        ].filter((part): part is string => !!part);
    });

    const details: DetailState = $derived(
        detailState({
            matchId,
            run: gcStatus.status?.ownRecovery ?? null,
            gameRunning: jobs.gameRunning,
            gcRecovery: settings.gcRecovery,
            matchIngest: settings.matchIngest,
            headSinceMs,
            nowMs,
        }),
    );
    const run = $derived(gcStatus.status?.ownRecovery ?? null);
    const atHead = $derived(!!run && (run.running || run.paused) && run.queued.length > 0 && run.queued[0] === matchId);
    const recovering = $derived(details.kind === "recovering");

    $effect(() => {
        if (atHead) {
            headSinceMs ??= Date.now();
        } else {
            headSinceMs = null;
        }
    });

    $effect(() => {
        if (!recovering) return;
        nowMs = Date.now();
        const id = setInterval(() => (nowMs = Date.now()), 1000);
        return () => clearInterval(id);
    });
    const replay = $derived(
        replayState({
            matchId,
            startTime: row?.startTime ?? null,
            withReplay: coverage?.withReplay ?? null,
            nowS: Math.floor(Date.now() / 1000),
            gameRunning: jobs.gameRunning,
            gcRecovery: settings.gcRecovery,
            matchIngest: settings.matchIngest,
            // The details row shows the run; recovering this match brings its replay too.
            run: null,
        }),
    );

    const progressText = $derived.by(() => {
        if (details.kind !== "recovering") return "";
        const progress = details.progress;
        switch (progress.kind) {
            case "eta": {
                const eta = etaParts(progress.secs);
                return t(`match_history.detail.missing.eta_${eta.unit}`, { count: eta.count });
            }
            case "paused":
                return t("match_history.detail.missing.paused");
            case "after_game":
                return t("gc.own.continues_after_game");
            case "limit":
                return t("gc.own.waiting_limit", { continues: continuesText(progress.until, Date.now() / 1000) });
        }
    });

    const replayNote = $derived.by(() => {
        switch (replay?.kind) {
            case "available":
                return replay.daysLeft === null
                    ? ""
                    : tn("match_history.detail.missing.replay_days_left", replay.daysLeft);
            case "recoverable":
                return t("match_history.detail.missing.replay_recoverable_note");
            case "unrecoverable":
                return t("match_history.detail.missing.replay_unrecoverable_note");
            case "expired":
                return t("match_history.detail.missing.replay_expired_note");
            case "none":
                return t("match_history.detail.missing.replay_none_note");
            default:
                return "";
        }
    });

    $effect(() => {
        const heroId = row?.heroId;
        if (heroId === undefined) return;
        void loadHeroes([heroId]).then((h) => (heroes = h));
        return onHeroesRefreshed((h) => (heroes = h));
    });

    $effect(() => matchCoverage.trackRun());
    $effect(() => matchCoverage.load(matchId));

    async function recover() {
        busy = true;
        try {
            await recoverMatches([matchId], [], false);
            await gcStatus.refresh();
        } catch (e) {
            toast.error(errorText(e));
        } finally {
            busy = false;
        }
    }
</script>

<div class="flex flex-col gap-4">
    {#if row}
        <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 class="text-2xl {OUTCOME_TONE[row.outcome]}">{t(outcomeLabelKey(row.outcome))}</h2>
            <p class="text-sm text-muted-foreground tabular-nums">{meta.join(" · ")}</p>
        </div>
    {/if}

    <Section padding="none" class="divide-y divide-border">
        <div class="grid gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-[180px_1fr]" role="status">
            <div class="flex flex-col gap-2">
                <p class="flex items-center gap-2 text-sm font-medium">
                    <FileText class="size-4 text-muted-foreground" aria-hidden="true" />{t(
                        "match_history.detail.missing.details",
                    )}
                </p>
                {#if !applies}
                    <Badge variant="outline" class="text-muted-foreground"
                        >{t("match_history.detail.missing.badge_not_applicable")}</Badge
                    >
                {:else if details.kind === "recovering"}
                    <Badge variant="secondary">
                        <LoaderCircle class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                        {t("match_history.detail.missing.badge_recovering")}
                    </Badge>
                {:else}
                    <Badge variant="destructive">
                        <TriangleAlert aria-hidden="true" />{t("match_history.detail.missing.badge_missing")}
                    </Badge>
                {/if}
            </div>
            <div class="flex flex-col items-start gap-1">
                <p class="text-sm text-foreground">
                    {t(applies ? "match_history.detail.missing.lead" : "match_history.detail.missing.not_applicable")}
                </p>
                {#if !applies}
                    <!-- Recovery skips matches outside matchmaking. -->
                {:else if details.kind === "recovering"}
                    <div class="flex flex-col items-start gap-3">
                        <span class="text-xs text-muted-foreground tabular-nums">{progressText}</span>
                        <div class="h-1 w-56 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                            <div
                                class="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear"
                                style:width="{details.fraction * 100}%"
                            ></div>
                        </div>
                    </div>
                {:else if details.kind === "open_in_game"}
                    <p class="flex items-start gap-2 text-sm text-muted-foreground">
                        <Gamepad2 class="mt-0.5 size-4 shrink-0 text-brass" aria-hidden="true" />
                        {t("match_history.detail.missing.open_in_game")}
                    </p>
                {:else if details.kind === "turn_on_sharing"}
                    <p class="flex items-start gap-2 text-sm text-muted-foreground">
                        <Gamepad2 class="mt-0.5 size-4 shrink-0 text-brass" aria-hidden="true" />
                        <span>
                            {t("match_history.detail.missing.sharing_off")}
                            <a href="/settings/sharing" class="text-primary underline-offset-4 hover:underline">
                                {t("match_history.detail.missing.sharing_link")}
                            </a>
                        </span>
                    </p>
                {:else}
                    <div class="flex flex-col items-start gap-3">
                        {#if details.consent}
                            <p
                                class="max-w-[560px] rounded-md border border-border bg-background/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
                            >
                                {t("match_history.recovery.consent")}
                            </p>
                        {/if}
                        <div class="flex flex-wrap items-center gap-3">
                            <Button onclick={recover} disabled={busy} aria-busy={busy}>
                                <RotateCw aria-hidden="true" />
                                {t("match_history.detail.missing.recover")}
                            </Button>
                            <span class="text-xs text-muted-foreground">
                                {t(
                                    details.consent
                                        ? "match_history.detail.missing.consent_note"
                                        : "match_history.detail.missing.recover_time",
                                )}
                            </span>
                        </div>
                    </div>
                {/if}
            </div>
        </div>

        {#if replay}
            <div class="grid items-center gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-[180px_1fr]">
                <div class="flex flex-col gap-2">
                    <p class="flex items-center gap-2 text-sm font-medium">
                        <Film class="size-4 text-muted-foreground" aria-hidden="true" />{t(
                            "match_history.detail.missing.replay",
                        )}
                    </p>
                    {#if replay.kind === "available"}
                        <Badge variant="success">
                            <CircleCheck aria-hidden="true" />{t("match_history.detail.missing.replay_available")}
                        </Badge>
                    {:else}
                        <Badge variant="outline" class="text-muted-foreground"
                            >{t(`match_history.detail.missing.replay_${replay.kind}`)}</Badge
                        >
                    {/if}
                </div>
                {#if replayNote}
                    <p class="text-sm text-muted-foreground">{replayNote}</p>
                {/if}
            </div>
        {/if}
    </Section>
</div>
