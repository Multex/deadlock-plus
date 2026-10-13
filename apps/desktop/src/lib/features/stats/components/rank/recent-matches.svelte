<script lang="ts">
    import { CircleHelp, Shield } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import type { Hero } from "$lib/features/heroes/heroes";
    import type { RankPoint } from "@deadlock-plus/stats/rank";
    import { shortDay, signed } from "../../format";
    import SyncingBadge from "../shared/syncing-badge.svelte";

    let { recent, heroes }: { recent: RankPoint[]; heroes: Record<number, Hero> } = $props();
</script>

<section>
    <h2 class="mb-2 text-xl">{t("rank.recent.heading")}</h2>
    <ul class="flex flex-col gap-2">
        {#each recent as p (p.matchId)}
            {@const hero = heroes[p.heroId]}
            <Card as="li" radius="md" padding="none" class="flex h-14 items-center gap-3 px-3">
                <div class="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                    {#if hero?.icon}
                        <img src={hero.icon} alt="" class="size-full object-cover" />
                    {:else}
                        <CircleHelp class="size-4 text-muted-foreground" aria-label={t("stats.unknown_hero")} />
                    {/if}
                </div>
                <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium">
                        {hero?.name ?? t("stats.hero_fallback", { id: p.heroId })}
                    </p>
                    <p class="text-xs text-muted-foreground">{shortDay(p.startTime)}</p>
                </div>
                {#if p.provisional}
                    <SyncingBadge />
                {/if}
                {#if p.demotionProtected}
                    <Shield class="size-4 fill-primary/25 text-primary" aria-label={t("rank.recent.shield_aria")} />
                {/if}
                <span
                    class="w-12 text-right text-sm {p.outcome === 'win'
                        ? 'text-primary'
                        : p.outcome === 'loss'
                          ? 'text-destructive'
                          : 'text-muted-foreground'}"
                >
                    {p.outcome === "win"
                        ? t("stats.outcome.win")
                        : p.outcome === "loss"
                          ? t("stats.outcome.loss")
                          : "-"}
                </span>
                <span class="w-14 text-right text-sm tabular-nums">{p.delta === null ? "-" : signed(p.delta)}</span>
            </Card>
        {/each}
    </ul>
</section>
