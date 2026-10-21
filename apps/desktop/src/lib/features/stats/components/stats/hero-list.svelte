<script lang="ts">
    import { formatNumber, t } from "$lib/core/i18n.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import type { Hero } from "$lib/features/heroes/heroes";
    import type { HeroRow } from "@deadlock-plus/stats/hero-rows";
    import { LEADERBOARD_RULES } from "@deadlock-plus/stats/leaderboard";
    import { formatPlaytime } from "../../stats";
    import { pct } from "../../format";
    import HeroIcon from "./hero-icon.svelte";
    import NeedBar from "./need-bar.svelte";

    let { rows, heroes }: { rows: HeroRow[]; heroes: Record<number, Hero> } = $props();

    const rule = LEADERBOARD_RULES.hero;
</script>

<section>
    <h3 class="text-lg">{t("stats.heroes.heading")}</h3>
    <p class="mb-3 mt-1 text-sm text-muted-foreground">
        {t("stats.heroes.intro", { days: rule.windowDays, games: rule.totalGames })}
    </p>
    <ul class="flex flex-col gap-3">
        {#each rows as row (row.heroId)}
            {@const hero = heroes[row.heroId]}
            {@const st = row.stat}
            {@const heroName = hero?.name ?? t("stats.hero_fallback", { id: row.heroId })}
            <Card as="li">
                <div class="flex items-center gap-4">
                    <HeroIcon {hero} size="size-16" />
                    <div class="min-w-0 flex-1">
                        <div class="flex items-baseline justify-between gap-3">
                            <p class="truncate font-heading text-xl">{heroName}</p>
                            <div class="flex shrink-0 items-baseline gap-3 text-sm">
                                <a
                                    href="/builds?hero={row.heroId}"
                                    class="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                                    aria-label={t("stats.heroes.builds_label", { hero: heroName })}
                                >
                                    {t("stats.heroes.builds")}
                                </a>
                                <p class={row.board.ready ? "text-primary" : "text-muted-foreground"}>
                                    {row.board.ready ? t("stats.heroes.eligible") : t("stats.heroes.not_yet")}
                                </p>
                            </div>
                        </div>
                        {#if st}
                            <div class="mt-2 flex items-center gap-3">
                                <div class="h-2 flex-1 overflow-hidden rounded-full bg-destructive/60">
                                    <div class="h-full bg-primary" style:width={pct(st.winrate)}></div>
                                </div>
                                <span class="w-10 text-right text-sm font-medium">{pct(st.winrate)}</span>
                            </div>
                            <dl class="mt-2 flex flex-wrap gap-x-8 gap-y-1 text-sm">
                                <div>
                                    <dt class="text-xs text-muted-foreground">{t("stats.heroes.games")}</dt>
                                    <dd>{st.games}</dd>
                                </div>
                                <div>
                                    <dt class="text-xs text-muted-foreground">{t("stats.heroes.kda")}</dt>
                                    <dd>
                                        {formatNumber(st.kda, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </dd>
                                </div>
                                <div>
                                    <dt class="text-xs text-muted-foreground">{t("stats.heroes.avg_souls")}</dt>
                                    <dd>{formatNumber(Math.round(st.avgNetWorth))}</dd>
                                </div>
                                <div>
                                    <dt class="text-xs text-muted-foreground">{t("stats.heroes.time")}</dt>
                                    <dd>{formatPlaytime(st.playtimeS)}</dd>
                                </div>
                            </dl>
                        {:else if row.lifetimeGames > 0}
                            <p class="mt-2 text-sm text-muted-foreground">
                                {t("stats.heroes.none_lifetime", { games: row.lifetimeGames })}
                            </p>
                        {:else}
                            <p class="mt-2 text-sm text-muted-foreground">{t("stats.heroes.none")}</p>
                        {/if}
                    </div>
                </div>
                <div class="mt-4 grid gap-4 border-t border-border pt-3 sm:grid-cols-2">
                    <NeedBar
                        label={t("stats.heroes.recent_games", { days: rule.windowDays })}
                        value={row.board.recentGames}
                        need={rule.gamesInWindow}
                    />
                    <NeedBar label={t("stats.heroes.lifetime_wins")} value={row.board.wins} need={rule.lifetimeWins} />
                </div>
            </Card>
        {/each}
    </ul>
</section>
