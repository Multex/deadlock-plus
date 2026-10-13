<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import type { Forecast } from "@deadlock-plus/stats/climb";
    import type { WindowStats } from "@deadlock-plus/stats/rank";
    import { etaText, pct, signed } from "../../format";
    import StatTile from "../shared/stat-tile.svelte";

    let {
        form,
        formWindow,
        breakEven,
        forecast,
        nextName,
    }: {
        form: WindowStats;
        formWindow: number;
        breakEven: number;
        forecast: Forecast | null;
        nextName: string;
    } = $props();
</script>

<div class="grid gap-3 md:grid-cols-2">
    <StatTile label={t("rank.outlook.hold_rank")} value={pct(breakEven)}>
        <p class="text-sm text-muted-foreground">
            {#if form.winrate === null}
                {t("rank.outlook.no_data")}
            {:else if form.winrate >= breakEven}
                {t("rank.outlook.climbing", { winrate: pct(form.winrate), count: formWindow })}
            {:else}
                {t("rank.outlook.sliding", { winrate: pct(form.winrate), count: formWindow })}
            {/if}
        </p>
    </StatTile>
    <StatTile
        label={t("rank.outlook.forecast")}
        value={forecast ? t("rank.outlook.per_day", { amount: signed(Math.round(forecast.perDay)) }) : "-"}
    >
        <p class="text-sm text-muted-foreground">
            {#if forecast}
                {forecast.tier
                    ? t("rank.outlook.forecast_with_tier", {
                          name: nextName,
                          eta: etaText(forecast.subrank),
                          tier: etaText(forecast.tier),
                      })
                    : t("rank.outlook.forecast_subrank", { name: nextName, eta: etaText(forecast.subrank) })}
            {:else}
                {t("rank.outlook.forecast_none")}
            {/if}
        </p>
    </StatTile>
</div>
