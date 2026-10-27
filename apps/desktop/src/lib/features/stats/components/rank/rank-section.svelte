<script lang="ts">
    import { ArrowRight } from "@lucide/svelte";
    import Card from "@deadlock-plus/ui/card.svelte";

    import { t, tn } from "$lib/core/i18n.svelte";
    import { breakEvenWinrate, climbForecast } from "@deadlock-plus/stats/climb";
    import {
        gainForWin,
        lossOutcome,
        standing,
        subrankAt,
        windowStats,
        winStreak,
        winsToNext,
        type RankInfo,
        type RankPoint,
        type RankTier,
    } from "@deadlock-plus/stats/rank";
    import { etaText, pct } from "../../format";
    import { partsName, type RankChart } from "../../rank-view";
    import StatTile from "../shared/stat-tile.svelte";
    import SyncingBadge from "../shared/syncing-badge.svelte";
    import ProgressChart from "./progress-chart.svelte";

    let {
        info,
        track,
        ranks,
        modelled = 0,
        chart,
        shown = $bindable(),
    }: {
        info: RankInfo | null;
        track: RankPoint[];
        ranks: RankTier[];
        modelled?: number;
        chart: RankChart | null;
        shown: number;
    } = $props();

    const FORM_WINDOW = 20;
    const breakEven = breakEvenWinrate();

    const topTier = $derived(Math.max(0, ...ranks.map((r) => r.tier)));
    const now = $derived(info ? standing(info) : null);
    const tier = $derived(now ? ranks.find((r) => r.tier === now.tier) : undefined);
    const atTop = $derived(now !== null && now.tier >= topTier);
    const streak = $derived(winStreak(track));
    const toNext = $derived(now && !atTop && now.within !== null ? winsToNext(now.within, now.span, streak) : null);
    const nextLoss = $derived(
        now && now.within !== null && info ? lossOutcome(now.within, info.shieldsLeft ?? 0) : null,
    );
    const form = $derived(windowStats(track, FORM_WINDOW));
    const forecast = $derived(info && !atTop ? climbForecast(track, info.finalFlat, Date.now() / 1000) : null);
    const nextName = $derived.by(() => {
        const cur = subrankAt(info?.finalFlat ?? 0);
        return partsName(ranks, subrankAt(cur.start + cur.span));
    });
    const shields = $derived(info?.shieldsLeft ?? null);
    const climbing = $derived(form.winrate !== null && form.winrate >= breakEven);
    const holdText = $derived(t("rank.outlook.hold", { winrate: pct(breakEven) }));
    const outlookLabel = $derived.by(() => {
        if (form.winrate === null) return holdText;
        const args = { winrate: pct(form.winrate), count: FORM_WINDOW };
        const pace = climbing ? t("rank.outlook.climbing", args) : t("rank.outlook.sliding", args);
        return `${pace} ${holdText}`;
    });
</script>

<section class="flex flex-col gap-5" aria-labelledby="rank-heading">
    <h2 id="rank-heading" class="flex items-center gap-2 text-xl">
        {t("rank.title")}
        {#if modelled > 0}<SyncingBadge count={modelled} />{/if}
    </h2>

    {#if !info || !now || track.length === 0}
        <p class="text-sm text-muted-foreground">{t("rank.empty")}</p>
    {:else}
        <Card padding="lg" class="flex min-w-0 items-center gap-6">
            {#if tier?.image}
                <img src={tier.image} alt="" class="size-28 shrink-0 object-contain" />
            {/if}
            <div class="min-w-0 flex-1">
                {#if modelled > 0}
                    <p class="text-xs text-muted-foreground">{tn("rank.summary.estimated", modelled)}</p>
                {/if}
                <p class="flex flex-wrap items-center gap-x-3 font-heading text-4xl font-semibold">
                    <span style:color={tier?.color}>{partsName(ranks, now)}</span>
                    {#if !atTop}
                        <ArrowRight class="size-6 text-muted-foreground" aria-hidden="true" />
                        <span class="text-muted-foreground">{nextName}</span>
                    {/if}
                </p>
                {#if atTop}
                    <p class="mt-2 text-sm text-muted-foreground">{t("rank.summary.top_tier")}</p>
                {:else if now.within !== null}
                    <div
                        class="mt-3 h-2.5 w-full max-w-xl overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-label={t("rank.summary.progress_aria", { next: nextName })}
                        aria-valuemin="0"
                        aria-valuemax={now.span}
                        aria-valuenow={now.within}
                    >
                        <div
                            class="h-full rounded-full bg-primary"
                            style:width="{(now.within / now.span) * 100}%"
                        ></div>
                    </div>
                    <p class="mt-1.5 text-sm text-muted-foreground">
                        {toNext !== null
                            ? tn("rank.summary.progress_streak", toNext, {
                                  within: now.within,
                                  span: now.span,
                                  next: nextName,
                              })
                            : t("rank.summary.progress", { within: now.within, span: now.span, next: nextName })}
                    </p>
                {:else}
                    <p class="mt-2 text-sm text-muted-foreground">{t("rank.summary.boundary")}</p>
                {/if}
                {#if (info.placementLeft ?? 0) > 0}
                    <p class="mt-1 text-sm text-muted-foreground">
                        {t("rank.summary.placement_left", { count: info.placementLeft ?? 0 })}
                    </p>
                {/if}
            </div>
        </Card>

        <div class="grid gap-3 sm:grid-cols-3">
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
            <StatTile label={t("rank.shields.heading")} value={shields === null ? "-" : String(shields)}>
                <p class="text-sm {shields === 0 ? 'text-destructive' : 'text-muted-foreground'}">
                    {shields === null
                        ? t("rank.shields.not_reported")
                        : shields === 0
                          ? t("rank.shields.none_hint")
                          : t("rank.shields.left_hint")}
                </p>
            </StatTile>
        </div>

        <Card as="section" padding="lg" aria-labelledby="rank-outlook-heading">
            <h3 id="rank-outlook-heading" class="font-heading text-lg font-semibold">
                {t("rank.outlook.heading")}
            </h3>
            <div class="mt-4 grid gap-5 md:grid-cols-3">
                <div class="min-w-0">
                    <p class="text-sm text-muted-foreground">{t("rank.outlook.hold_rank")}</p>
                    <p class="mt-1 font-heading text-3xl font-semibold">{pct(breakEven)}</p>
                    <p class="mt-1 text-sm text-muted-foreground">{t("rank.outlook.no_data")}</p>
                </div>
                <div class="min-w-0">
                    <p class="text-sm text-muted-foreground">{t("rank.outlook.your_last", { count: FORM_WINDOW })}</p>
                    <p class="mt-1 font-heading text-3xl font-semibold">{pct(form.winrate)}</p>
                    {#if form.winrate !== null}
                        <p class="mt-1 text-sm font-medium {climbing ? 'text-primary' : 'text-destructive'}">
                            {climbing ? t("rank.outlook.climbing_short") : t("rank.outlook.sliding_short")}
                        </p>
                    {/if}
                </div>
                {#if !atTop}
                    <div class="min-w-0">
                        <p class="truncate text-sm text-muted-foreground">{nextName}</p>
                        {#if forecast}
                            <p class="mt-1 font-heading text-3xl font-semibold">{etaText(forecast.subrank)}</p>
                            {#if forecast.tier}
                                <p class="mt-1 text-sm text-muted-foreground">
                                    {t("rank.outlook.next_tier", { eta: etaText(forecast.tier) })}
                                </p>
                            {/if}
                        {:else}
                            <p class="mt-1 text-sm text-muted-foreground">{t("rank.outlook.forecast_none")}</p>
                        {/if}
                    </div>
                {/if}
            </div>

            <div class="relative mt-6 mb-7 h-2.5 rounded-full bg-muted" role="img" aria-label={outlookLabel}>
                {#if form.winrate !== null}
                    <div
                        class="absolute inset-y-0 left-0 rounded-full {climbing ? 'bg-primary' : 'bg-destructive'}"
                        style:width="{form.winrate * 100}%"
                    ></div>
                {/if}
                <div
                    class="absolute -top-1.5 -bottom-1.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
                    style:left="{breakEven * 100}%"
                ></div>
                <span
                    class="absolute top-full mt-2 -translate-x-1/2 text-xs whitespace-nowrap text-muted-foreground"
                    style:left="{breakEven * 100}%">{pct(breakEven)}</span
                >
            </div>
        </Card>

        <ProgressChart {chart} bind:shown />
    {/if}
</section>
