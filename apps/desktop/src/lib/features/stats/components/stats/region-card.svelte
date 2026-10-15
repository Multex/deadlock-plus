<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import { LEADERBOARD_RULES, type LeaderboardProgress } from "@deadlock-plus/stats/leaderboard";
    import NeedBar from "./need-bar.svelte";

    let { board }: { board: LeaderboardProgress } = $props();

    const rule = LEADERBOARD_RULES.region;
</script>

<Card as="section">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h3 class="text-lg">{t("stats.region.heading")}</h3>
        <span class="text-sm {board.regionReady ? 'text-primary' : 'text-muted-foreground'}">
            {board.regionReady ? t("stats.region.eligible") : t("stats.region.not_eligible")}
        </span>
    </div>
    <p class="mt-1 text-sm text-muted-foreground">
        {t("stats.region.note")}
    </p>
    <div class="mt-3 grid gap-4 sm:grid-cols-2">
        <NeedBar
            label={t("stats.region.recent_games", { days: rule.windowDays })}
            value={board.recentGames}
            need={rule.gamesInWindow}
        />
        <NeedBar label={t("stats.region.total_games")} value={board.totalGames} need={rule.totalGames} />
    </div>
</Card>
