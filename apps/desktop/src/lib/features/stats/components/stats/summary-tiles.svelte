<script lang="ts">
    import { t, tn } from "$lib/core/i18n.svelte";
    import type { Match, Streaks, WinLoss } from "@deadlock-plus/stats/stats";
    import { totalPlaytime } from "@deadlock-plus/stats/stats";
    import { formatPlaytime } from "../../stats";
    import { pct } from "../../format";
    import StatTile from "../shared/stat-tile.svelte";
    import SyncingBadge from "../shared/syncing-badge.svelte";

    let { windowed, summary, run, form }: { windowed: Match[]; summary: WinLoss; run: Streaks; form: Match[] } =
        $props();
    const syncing = $derived(windowed.filter((m) => m.provisional).length);
</script>

<div class="grid gap-3 sm:grid-cols-3">
    <StatTile label={t("stats.summary.winrate")} value={pct(summary.winrate)}>
        <p class="text-sm text-muted-foreground">
            {summary.unscored > 0
                ? t("stats.record_unscored", {
                      wins: summary.wins,
                      losses: summary.losses,
                      unscored: summary.unscored,
                  })
                : t("stats.record", { wins: summary.wins, losses: summary.losses })}
        </p>
        <div class="mt-3 flex gap-1" role="img" aria-label={t("stats.summary.form_aria", { count: form.length })}>
            {#each form as m (m.matchId)}
                <span
                    class="h-2 flex-1 rounded-full {m.outcome === 'win' ? 'bg-primary' : 'bg-destructive'}"
                    title={m.outcome === "win" ? t("stats.outcome.win") : t("stats.outcome.loss")}
                ></span>
            {/each}
        </div>
    </StatTile>
    <StatTile
        label={t("stats.summary.streak")}
        value={run.current
            ? run.current.kind === "win"
                ? tn("stats.summary.streak_wins", run.current.length)
                : tn("stats.summary.streak_losses", run.current.length)
            : "-"}
    >
        <p class="text-sm text-muted-foreground">
            {t("stats.summary.streak_best", { wins: run.longestWin, losses: run.longestLoss })}
        </p>
    </StatTile>
    <StatTile label={t("stats.summary.playtime")} value={formatPlaytime(totalPlaytime(windowed))}>
        <p class="flex items-center gap-2 text-sm text-muted-foreground">
            {t("stats.summary.matches", { count: windowed.length })}
            {#if syncing > 0}<SyncingBadge count={syncing} />{/if}
        </p>
    </StatTile>
</div>
