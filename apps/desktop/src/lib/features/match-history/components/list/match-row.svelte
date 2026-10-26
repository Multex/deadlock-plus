<script lang="ts">
    import {
        ChevronRight,
        CircleDashed,
        CircleHelp,
        Clock,
        Coins,
        Flame,
        Gamepad2,
        LoaderCircle,
        Swords,
        Trophy,
        Users,
    } from "@lucide/svelte";

    import { formatDate, formatNumber, t } from "$lib/core/i18n.svelte";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import type { Hero } from "$lib/features/heroes/heroes";
    import RankBadge from "$lib/features/live/components/rank-badge.svelte";
    import { formatClock } from "$lib/features/live/live";
    import type { RankTier } from "@deadlock-plus/stats/rank";
    import type { MatchRow, RowMode } from "@deadlock-plus/match/list";
    import { kdaRatio } from "@deadlock-plus/match/list-summary";
    import { rowState } from "@deadlock-plus/match/coverage";
    import { coverageApplies, matchCoverage } from "../../coverage.svelte";
    import { rowGrades } from "../../row-grades.svelte";
    import RowGrade from "./row-grade.svelte";
    import { rowStateBadge, showGrade } from "./row-state";
    import { deltaView, matchHref, modeLabelKey, outcomeLabelKey } from "./view-model";

    let { row, hero, tiers }: { row: MatchRow; hero: Hero | undefined; tiers: RankTier[] } = $props();

    const MODE_ICON: Record<RowMode, typeof Trophy> = {
        ranked: Trophy,
        unranked: Swords,
        streetBrawl: Flame,
        custom: Users,
        bot: Gamepad2,
        other: Gamepad2,
    };
    const SURFACE = {
        win: "border-l-primary bg-linear-to-r from-primary/15 via-card to-card hover:from-primary/25 hover:via-accent hover:to-accent",
        loss: "border-l-destructive bg-linear-to-r from-destructive/15 via-card to-card hover:from-destructive/25 hover:via-accent hover:to-accent",
        unscored: "border-l-muted-foreground/50 bg-card hover:bg-accent",
    } as const;
    const DELTA_TONE = {
        up: "bg-primary/15 text-primary",
        down: "bg-destructive/15 text-destructive",
        flat: "bg-muted text-muted-foreground",
        none: "text-muted-foreground",
    } as const;

    const delta = $derived(deltaView(row));
    const ModeIcon = $derived(MODE_ICON[row.mode]);
    const ratio = $derived(kdaRatio(row).toFixed(1));
    const duration = $derived(formatClock(row.durationS) ?? "-");
    const time = $derived(formatDate(row.startTime * 1000, { hour: "2-digit", minute: "2-digit" }));
    const grade = $derived(rowGrades.own(row.matchId));
    const state = $derived(
        coverageApplies(row.mode) ? rowState(row.matchId, matchCoverage.coverage, matchCoverage.queued) : null,
    );
    const stateBadge = $derived(rowStateBadge(state));
    const outcomeVariant = $derived(
        row.outcome === "win" ? "success" : row.outcome === "loss" ? "destructive" : "outline",
    );

    $effect(() => rowGrades.watch(row.matchId));
</script>

<li>
    <a
        href={matchHref(row.matchId)}
        class="group grid h-[4.5rem] grid-cols-[3rem_minmax(0,1fr)_6.5rem_5.5rem_5.5rem_5rem_7rem_1rem] items-center gap-x-4 rounded-lg border border-l-4 border-border px-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 {SURFACE[
            row.outcome
        ]}"
    >
        <div class="flex size-12 items-center justify-center overflow-hidden rounded-lg bg-muted ring-1 ring-border">
            {#if hero?.icon}
                <img src={hero.icon} alt="" class="size-full object-cover" loading="lazy" />
            {:else}
                <CircleHelp class="size-6 text-muted-foreground" aria-label={t("stats.unknown_hero")} />
            {/if}
        </div>

        <div class="min-w-0">
            <p class="truncate font-heading text-base leading-tight">
                {hero?.name ?? t("stats.hero_fallback", { id: row.heroId })}
            </p>
            <p class="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                <ModeIcon class="size-3.5 shrink-0" aria-hidden="true" />
                <span class="truncate">{t(modeLabelKey(row.mode))}</span>
                <span aria-hidden="true">·</span>
                <span class="tabular-nums">{time}</span>
                {#if row.source === "provisional"}
                    <Badge variant="warning" title={t("match_history.list.provisional_hint")}>
                        {t("match_history.list.provisional")}
                    </Badge>
                {/if}
                {#if stateBadge}
                    <Badge variant={stateBadge.variant} class={state === "missing" ? "text-muted-foreground" : ""}>
                        {#if state === "recovering"}
                            <LoaderCircle
                                class="animate-spin text-brass motion-reduce:animate-none"
                                aria-hidden="true"
                            />
                        {:else}
                            <CircleDashed aria-hidden="true" />
                        {/if}
                        {t(stateBadge.labelKey)}
                    </Badge>
                {/if}
            </p>
        </div>

        <div class="flex flex-col items-start gap-1.5">
            <Badge variant={outcomeVariant}>{t(outcomeLabelKey(row.outcome))}</Badge>
            {#if grade && showGrade(grade, state)}
                <RowGrade {grade} class="pl-0.5" />
            {/if}
        </div>

        <div class="text-right" title={t("match_history.list.row.kda_split")}>
            <p class="text-sm font-medium tabular-nums">{row.kills} / {row.deaths} / {row.assists}</p>
            <p class="mt-0.5 text-xs text-muted-foreground tabular-nums">
                {t("match_history.list.row.kda_ratio", { ratio })}
            </p>
        </div>

        <p class="flex items-center justify-end gap-1.5 text-sm tabular-nums" title={t("match_history.list.row.souls")}>
            <Coins class="size-4 text-brass" aria-hidden="true" />
            <span class="sr-only">{t("match_history.list.row.souls")}</span>
            {formatNumber(row.souls)}
        </p>

        <p
            class="flex items-center justify-end gap-1.5 text-sm text-muted-foreground tabular-nums"
            title={t("match_history.list.row.duration")}
        >
            <Clock class="size-4" aria-hidden="true" />
            <span class="sr-only">{t("match_history.list.row.duration")}</span>
            {duration}
        </p>

        <div class="flex items-center justify-end gap-2">
            <RankBadge rank={row.rankBadge > 0 ? row.rankBadge : null} {tiers} />
            <span
                class="min-w-10 rounded-md px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums {DELTA_TONE[
                    delta.tone
                ]}"
                title={t("sessions.row.rank_change")}
            >
                <span class="sr-only">{t("sessions.row.rank_change")}</span>
                {delta.text}
            </span>
        </div>

        <ChevronRight
            class="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transition-none"
            aria-hidden="true"
        />
    </a>
</li>
