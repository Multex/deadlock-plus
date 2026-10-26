<script lang="ts">
    import { CircleCheck, Film, LoaderCircle, RotateCw } from "@lucide/svelte";
    import { toast } from "svelte-sonner";

    import { errorText } from "$lib/core/errors";
    import { t, tn } from "$lib/core/i18n.svelte";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import { recoverMatches } from "$lib/features/gc/api";
    import { gcStatus } from "$lib/features/gc/status.svelte";
    import { jobs } from "$lib/features/jobs/jobs.svelte";
    import { settings } from "$lib/features/settings/settings.svelte";
    import { matchCoverage } from "../../coverage.svelte";
    import { replayRecoverStep, replayState } from "../../detail-state";

    let { matchId, startTime, own }: { matchId: number; startTime: number; own: boolean } = $props();

    const coverage = $derived(matchCoverage.forMatch(matchId));
    let busy = $state(false);

    const replay = $derived(
        replayState({
            matchId,
            startTime,
            withReplay: coverage?.withReplay ?? null,
            nowS: Math.floor(Date.now() / 1000),
            gameRunning: jobs.gameRunning,
            gcRecovery: settings.gcRecovery,
            matchIngest: settings.matchIngest,
            run: gcStatus.status?.ownRecovery ?? null,
        }),
    );
    const recover = $derived(replayRecoverStep(replay, own));

    const hint = $derived.by(() => {
        switch (replay?.kind) {
            case "available":
                return replay.daysLeft === null
                    ? undefined
                    : tn("match_history.detail.missing.replay_days_left", replay.daysLeft);
            case "recoverable":
                if (replay.next.kind === "open_in_game") return t("match_history.detail.missing.open_in_game");
                if (replay.next.kind === "turn_on_sharing") return t("match_history.detail.missing.sharing_off");
                return t("match_history.detail.missing.replay_recoverable_note");
            case "unrecoverable":
                return t("match_history.detail.missing.replay_unrecoverable_note");
            case "expired":
                return t("match_history.detail.missing.replay_expired_note");
            case "none":
                return t("match_history.detail.missing.replay_none_note");
            default:
                return undefined;
        }
    });

    $effect(() => matchCoverage.trackRun());
    $effect(() => matchCoverage.load(matchId, { hasDetails: true }));

    async function recoverReplay() {
        busy = true;
        try {
            await recoverMatches([], [matchId], false);
            await gcStatus.refresh();
        } catch (e) {
            toast.error(errorText(e));
        } finally {
            busy = false;
        }
    }
</script>

{#if replay}
    <div class="flex flex-col items-end gap-1.5" data-export-ignore>
        <div class="flex min-h-8 flex-wrap items-center gap-2">
            {#if replay.kind === "available"}
                <Badge variant="success" title={hint}>
                    <CircleCheck aria-hidden="true" />{t("match_history.detail.replay_status.available")}
                </Badge>
            {:else if replay.kind === "recovering"}
                <Badge variant="secondary">
                    <LoaderCircle class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    {t("match_history.detail.replay_status.recovering")}
                </Badge>
            {:else}
                <Badge variant="outline" class="text-muted-foreground" title={hint}>
                    <Film aria-hidden="true" />{t(`match_history.detail.replay_status.${replay.kind}`)}
                </Badge>
            {/if}
            {#if recover}
                <Button
                    variant="outline"
                    size="sm"
                    onclick={recoverReplay}
                    disabled={busy}
                    aria-busy={busy}
                    title={t(
                        recover.consent
                            ? "match_history.detail.replay_status.consent_note"
                            : "match_history.detail.replay_status.recover_note",
                    )}
                >
                    <RotateCw aria-hidden="true" />
                    {t("match_history.detail.replay_status.recover")}
                </Button>
            {/if}
        </div>
        {#if recover?.consent}
            <p class="max-w-[420px] text-right text-xs leading-relaxed text-muted-foreground">
                {t("match_history.recovery.consent")}
            </p>
        {/if}
    </div>
{/if}
