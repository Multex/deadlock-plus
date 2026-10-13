<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import type { Hero } from "$lib/features/heroes/heroes";
    import type { HeroStat } from "@deadlock-plus/stats/stats";
    import { BEST_HERO_MIN_GAMES } from "@deadlock-plus/stats/hero-rows";
    import { pct } from "../../format";
    import HeroIcon from "./hero-icon.svelte";

    let { mostPlayed, best, heroes }: { mostPlayed: HeroStat; best: HeroStat | null; heroes: Record<number, Hero> } =
        $props();
</script>

<div class="grid gap-3 sm:grid-cols-2">
    <Card class="flex items-center gap-4">
        <HeroIcon hero={heroes[mostPlayed.heroId]} size="size-14" />
        <div class="min-w-0">
            <p class="text-sm text-muted-foreground">{t("stats.highlights.most_played")}</p>
            <p class="truncate font-heading text-xl">
                {heroes[mostPlayed.heroId]?.name ?? t("stats.hero_fallback", { id: mostPlayed.heroId })}
            </p>
            <p class="text-sm text-muted-foreground">
                {t("stats.highlights.most_played_summary", {
                    games: mostPlayed.games,
                    winrate: pct(mostPlayed.winrate),
                })}
            </p>
        </div>
    </Card>
    <Card class="flex items-center gap-4">
        {#if best}
            <HeroIcon hero={heroes[best.heroId]} size="size-14" />
            <div class="min-w-0">
                <p class="text-sm text-muted-foreground">{t("stats.highlights.best", { min: BEST_HERO_MIN_GAMES })}</p>
                <p class="truncate font-heading text-xl">
                    {heroes[best.heroId]?.name ?? t("stats.hero_fallback", { id: best.heroId })}
                </p>
                <p class="text-sm text-muted-foreground">
                    {t("stats.highlights.best_summary", { winrate: pct(best.winrate), games: best.games })}
                </p>
            </div>
        {:else}
            <p class="text-sm text-muted-foreground">
                {t("stats.highlights.best_empty", { min: BEST_HERO_MIN_GAMES })}
            </p>
        {/if}
    </Card>
</div>
