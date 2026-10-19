<script lang="ts">
    import { onDestroy } from "svelte";
    import { X } from "@lucide/svelte";
    import { toast } from "svelte-sonner";

    import { errorText } from "$lib/core/errors";
    import { formatNumber, t } from "$lib/core/i18n.svelte";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import IconButton from "@deadlock-plus/ui/icon-button.svelte";
    import * as Dialog from "@deadlock-plus/ui/dialog";
    import { cancelMatchRecovery, pauseMatchRecovery, recoverMatches, resumeMatchRecovery } from "$lib/features/gc/api";
    import { recoveryView, type RecoveryAction, type RecoveryPhase } from "$lib/features/gc/recovery-view";
    import { durationText } from "$lib/features/gc/recovery-bar";
    import { gcStatus } from "$lib/features/gc/status.svelte";
    import { lastRunLine, ownRecoveryLine } from "$lib/features/gc/status-line";
    import { matchCoverage } from "$lib/features/match-history/coverage.svelte";
    import { playerNames } from "$lib/features/match-history/names";
    import { recoveryPanel } from "$lib/features/match-history/recovery-panel.svelte";
    import { settings } from "$lib/features/settings/settings.svelte";
    import ProgressBar from "./progress-bar.svelte";

    import type { RecoveryStep } from "@deadlock-plus/ipc-types/RecoveryStep";

    let { missingIds }: { missingIds: number[] } = $props();

    const replayIds = $derived(matchCoverage.summary?.replayIds ?? []);
    const own = $derived(gcStatus.status?.ownRecovery ?? null);
    const view = $derived(recoveryView(own, missingIds.length, replayIds.length));
    const showSteps = $derived(view.segments.some((s) => s.step === "replays"));

    const STEP_LABELS: Record<RecoveryStep, string> = {
        details: "match_history.recovery.step_details",
        replays: "match_history.recovery.step_replays",
    };
    const dim = $derived(view.phase === "paused" || view.phase === "waiting_game" || view.phase === "waiting_limit");
    const lastRun = $derived(lastRunLine(gcStatus.status?.lastRun ?? null));
    const consentNote = $derived(view.actions.includes("start") && !settings.gcRecovery);

    const BADGES: Partial<Record<RecoveryPhase, { key: string; variant: "secondary" | "warning" }>> = {
        paused: { key: "match_history.recovery.badge_paused", variant: "secondary" },
        waiting_game: { key: "match_history.recovery.badge_game", variant: "secondary" },
        waiting_limit: { key: "match_history.recovery.badge_limit", variant: "warning" },
    };
    const badge = $derived(BADGES[view.phase]);

    let names = $state<ReadonlyMap<number, string>>(new Map());
    const accountKey = $derived(view.accounts.map((a) => a.accountId).join(","));

    $effect(() => {
        if (!recoveryPanel.open || accountKey === "") return;
        let current = true;
        playerNames.resolve(accountKey.split(",").map(Number)).then(
            (found) => {
                if (current) names = found;
            },
            () => {},
        );
        return () => {
            current = false;
        };
    });

    onDestroy(() => (recoveryPanel.open = false));

    const side = $derived.by(() => {
        switch (view.phase) {
            case "idle":
                return view.total > 0
                    ? t("match_history.recovery.eta_total", { time: durationText(view.etaSecs) })
                    : "";
            case "running":
                return t("match_history.recovery.eta_left", { time: durationText(view.etaSecs) });
            case "paused":
                return t("gc.own.paused", { left: formatNumber(Math.max(0, view.total - view.done)) });
            case "waiting_game":
                return t("gc.own.continues_after_game");
            case "waiting_limit":
                return t("match_history.recovery.limit_note");
            case "done":
                return ownRecoveryLine(own);
        }
    });

    const BUTTONS: Record<RecoveryAction, { variant: "default" | "outline" | "ghost"; run: () => Promise<unknown> }> = {
        start: { variant: "default", run: () => recoverMatches(missingIds, replayIds, true) },
        pause: { variant: "outline", run: pauseMatchRecovery },
        resume: { variant: "default", run: resumeMatchRecovery },
        cancel: { variant: "ghost", run: cancelMatchRecovery },
    };

    function label(action: RecoveryAction): string {
        switch (action) {
            case "start":
                return t("match_history.recovery.start", { count: formatNumber(view.pending) });
            case "pause":
                return t("match_history.recovery.pause");
            case "resume":
                return t("match_history.recovery.resume");
            case "cancel":
                return t("common.cancel");
        }
    }

    let busy = $state(false);

    async function act(action: RecoveryAction) {
        busy = true;
        try {
            await BUTTONS[action].run();
            await gcStatus.refresh();
        } catch (e) {
            toast.error(errorText(e));
        } finally {
            busy = false;
        }
    }
</script>

<Dialog.Root bind:open={recoveryPanel.open}>
    <Dialog.Content class="max-w-lg gap-5" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div class="flex items-start justify-between gap-3">
            <Dialog.Title class="flex items-center gap-2">
                {t("match_history.recovery.title")}
                {#if badge}
                    <Badge variant={badge.variant}>{t(badge.key)}</Badge>
                {/if}
            </Dialog.Title>
            <IconButton
                label={t("match_history.recovery.close")}
                size="sm"
                class="-mr-2 -mt-1 size-8"
                onclick={() => (recoveryPanel.open = false)}
            >
                <X />
            </IconButton>
        </div>

        <div class="flex flex-col gap-5">
            <div class="flex items-end justify-between gap-4">
                <p class="font-heading text-4xl tabular-nums">
                    {#if view.phase === "idle"}
                        {formatNumber(view.total)}<span class="ml-1.5 text-lg text-muted-foreground"
                            >{t("match_history.recovery.missing")}</span
                        >
                    {:else}
                        {formatNumber(view.done)}<span class="ml-1 text-lg text-muted-foreground"
                            >/ {formatNumber(view.total)}</span
                        >
                    {/if}
                </p>
                {#if side}
                    <p class="max-w-[60%] pb-1 text-right text-xs text-muted-foreground">{side}</p>
                {/if}
            </div>
            <div class="flex flex-col gap-2">
                <div class="flex gap-1" role="group" aria-label={t("match_history.recovery.progress_label")}>
                    {#each view.segments as segment (segment.step)}
                        <div class="min-w-0" style="flex: {Math.max(1, segment.total)} 1 0">
                            <ProgressBar
                                done={segment.done}
                                total={segment.total}
                                {dim}
                                label={t(STEP_LABELS[segment.step])}
                            />
                        </div>
                    {/each}
                </div>
                {#if showSteps}
                    <ol class="flex justify-between gap-4 text-xs text-muted-foreground">
                        {#each view.segments as segment, i (segment.step)}
                            <li class={i > 0 ? "text-right" : undefined}>
                                {t(STEP_LABELS[segment.step])}
                                <span class="ml-1 tabular-nums text-foreground"
                                    >{formatNumber(segment.done)} / {formatNumber(segment.total)}</span
                                >
                            </li>
                        {/each}
                    </ol>
                {/if}
            </div>
        </div>

        {#if view.accounts.length > 0}
            <div class="flex flex-col gap-2">
                <p class="text-xs text-muted-foreground">{t("match_history.recovery.accounts")}</p>
                <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {#each view.accounts as account (account.accountId)}
                        {@const name = names.get(account.accountId) ?? String(account.accountId)}
                        <div class="flex flex-col gap-1.5 rounded-md border border-border px-3 py-2">
                            <div class="flex items-baseline justify-between gap-2 text-xs">
                                <span class="truncate font-medium">{name}</span>
                                <span class="tabular-nums text-muted-foreground"
                                    >{formatNumber(account.usedToday)}/{formatNumber(account.limit)}</span
                                >
                            </div>
                            <ProgressBar
                                done={account.usedToday}
                                total={account.limit}
                                size="sm"
                                tone={account.rateLimited || account.usedToday >= account.limit ? "warning" : "primary"}
                                label={name}
                            />
                        </div>
                    {/each}
                </div>
            </div>
        {/if}

        {#if consentNote}
            <p class="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                {t("settings.privacy.gc_description")}
            </p>
        {/if}

        <div class="flex items-center justify-between gap-3 border-t border-border pt-4">
            <p class="min-w-0 text-xs text-muted-foreground">{lastRun}</p>
            <div class="flex shrink-0 gap-2">
                {#each [...view.actions].reverse() as action (action)}
                    <Button variant={BUTTONS[action].variant} size="sm" disabled={busy} onclick={() => act(action)}>
                        {label(action)}
                    </Button>
                {/each}
            </div>
        </div>
    </Dialog.Content>
</Dialog.Root>
