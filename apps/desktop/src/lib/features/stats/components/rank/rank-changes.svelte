<script lang="ts">
    import { ArrowDown, ArrowUp } from "@lucide/svelte";

    import { t } from "$lib/core/i18n.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import type { RankChange, RankTier } from "@deadlock-plus/stats/rank";
    import { shortDay } from "../../format";
    import { badgeName } from "../../rank-view";

    let { changes, ranks }: { changes: RankChange[]; ranks: RankTier[] } = $props();
</script>

<section>
    <h2 class="mb-2 text-xl">{t("rank.changes.heading")}</h2>
    {#if changes.length === 0}
        <p class="text-sm text-muted-foreground">{t("rank.changes.none")}</p>
    {:else}
        <ul class="flex flex-col gap-2">
            {#each changes as c (c.matchId)}
                <Card as="li" radius="md" padding="none" class="flex h-14 items-center gap-3 px-3 text-sm">
                    {#if c.promoted}
                        <ArrowUp class="size-4 text-primary" aria-label={t("rank.changes.promoted")} />
                    {:else}
                        <ArrowDown class="size-4 text-destructive" aria-label={t("rank.changes.demoted")} />
                    {/if}
                    <div class="min-w-0 flex-1">
                        <p class="truncate text-sm font-medium">{badgeName(ranks, c.to)}</p>
                        <p class="text-xs text-muted-foreground">
                            {c.promoted
                                ? t("rank.changes.promoted_from", { name: badgeName(ranks, c.from) })
                                : t("rank.changes.demoted_from", { name: badgeName(ranks, c.from) })} · {shortDay(
                                c.startTime,
                            )}
                        </p>
                    </div>
                </Card>
            {/each}
        </ul>
    {/if}
</section>
