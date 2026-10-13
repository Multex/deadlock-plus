<script lang="ts">
    import type { Snippet } from "svelte";

    import { formatDate, t } from "$lib/core/i18n.svelte";
    import { formatClock } from "$lib/features/live/live";
    import type { MatchTeam } from "@deadlock-plus/match/detail";
    import { summarizeVersus, type Versus } from "@deadlock-plus/match/versus";
    import type { HeaderSummary } from "@deadlock-plus/match/scoreboard";

    let {
        summary,
        versus = null,
        actions,
    }: { summary: HeaderSummary; versus?: Versus | null; actions?: Snippet } = $props();

    const tally = $derived(versus ? summarizeVersus(versus) : null);

    const teamName = (team: MatchTeam) =>
        team === "hidden-king" ? t("match_history.team.hidden_king") : t("match_history.team.archmother");

    const result = $derived.by(() => {
        if (summary.notScored || summary.outcome === "unscored") return t("match_history.detail.result.unscored");
        if (summary.outcome === "win") return t("stats.outcome.win");
        if (summary.outcome === "loss") return t("stats.outcome.loss");
        return summary.winner
            ? t("match_history.detail.result.team_won", { team: teamName(summary.winner) })
            : t("match_history.detail.result.unknown");
    });
</script>

<section class="flex flex-col gap-3" aria-label={t("match_history.detail.summary")}>
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2
                class="text-2xl"
                class:text-primary={summary.outcome === "win"}
                class:text-destructive={summary.outcome === "loss"}
            >
                {result}
            </h2>
            <p class="text-sm text-muted-foreground tabular-nums">
                {t(`match_history.detail.mode.${summary.mode}`)} · {formatClock(summary.durationS)} ·
                {formatDate(summary.startTime * 1000, { dateStyle: "medium", timeStyle: "short" })}
            </p>
        </div>
        {@render actions?.()}
    </div>
    {#if versus && tally}
        <p class="text-sm text-muted-foreground tabular-nums">
            {t("match_history.detail.versus.summary", {
                samples: versus.samples,
                better: tally.better,
                worse: tally.worse,
            })}
        </p>
    {/if}
</section>
