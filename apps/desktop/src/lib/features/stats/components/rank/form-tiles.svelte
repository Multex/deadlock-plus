<script lang="ts">
    import { t, tn } from "$lib/core/i18n.svelte";
    import type { LossOutcome, WindowStats } from "@deadlock-plus/stats/rank";
    import { gainForWin } from "@deadlock-plus/stats/rank";
    import { pct, signed } from "../../format";
    import StatTile from "../shared/stat-tile.svelte";

    let {
        form,
        formWindow,
        sampled,
        streak,
        nextLoss,
    }: {
        form: WindowStats;
        formWindow: number;
        sampled: number;
        streak: number;
        nextLoss: LossOutcome | null;
    } = $props();

    const unscored = $derived(sampled - form.games);
</script>

<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <StatTile label={t("rank.form.last_ranked", { count: formWindow })} value={pct(form.winrate)}>
        <p class="text-sm text-muted-foreground">
            {unscored > 0
                ? t("stats.record_unscored", { wins: form.wins, losses: form.losses, unscored })
                : t("stats.record", { wins: form.wins, losses: form.losses })}
        </p>
    </StatTile>
    <StatTile label={t("rank.form.progress")} value={signed(form.net)}>
        <p class="text-sm text-muted-foreground">{t("rank.form.subrank_note")}</p>
    </StatTile>
    <StatTile label={t("rank.form.next_win")} value="+{gainForWin(streak + 1)}">
        <p class="text-sm text-muted-foreground">
            {streak === 0 ? t("rank.form.no_streak") : tn("rank.form.streak", streak)}
        </p>
    </StatTile>
    <StatTile label={t("rank.form.next_loss")} value={nextLoss ? `-${nextLoss.lost}` : "-"}>
        {#if nextLoss}
            <p class="text-sm text-muted-foreground">
                {#if nextLoss.usesShield}
                    {nextLoss.lost === 0 ? t("rank.form.only_shield") : t("rank.form.plus_shield")}
                {:else if nextLoss.demotes}
                    {t("rank.form.drops_subrank")}
                {:else}
                    {t("rank.form.no_shield_used")}
                {/if}
            </p>
        {/if}
    </StatTile>
</div>
