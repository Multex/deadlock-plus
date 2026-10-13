<script lang="ts">
    import { t, tn } from "$lib/core/i18n.svelte";
    import Card from "@deadlock-plus/ui/card.svelte";
    import type { RankInfo, RankTier, Standing } from "@deadlock-plus/stats/rank";
    import SyncingBadge from "../shared/syncing-badge.svelte";
    import ShieldPanel from "./shield-panel.svelte";

    let {
        info,
        now,
        tier,
        name,
        nextName,
        atTop,
        toNext,
        modelled = 0,
    }: {
        info: RankInfo;
        now: Standing;
        tier: RankTier | undefined;
        name: string;
        nextName: string;
        atTop: boolean;
        toNext: number | null;
        modelled?: number;
    } = $props();
</script>

<Card as="section" padding="lg" class="grid gap-4 md:grid-cols-[1fr_auto]">
    <div class="flex items-center gap-5">
        {#if tier?.image}
            <img src={tier.image} alt="" class="size-28 shrink-0 object-contain" />
        {/if}
        <div class="min-w-0 flex-1">
            <p class="flex items-center gap-2 text-sm text-muted-foreground">
                {t("rank.summary.current")}
                {#if modelled > 0}<SyncingBadge count={modelled} />{/if}
            </p>
            {#if modelled > 0}
                <p class="text-xs text-muted-foreground">
                    {tn("rank.summary.estimated", modelled)}
                </p>
            {/if}
            <p class="font-heading text-4xl font-semibold" style:color={tier?.color}>{name}</p>
            {#if atTop}
                <p class="mt-2 text-sm text-muted-foreground">
                    {t("rank.summary.top_tier")}
                </p>
            {:else}
                {#if now.within !== null}
                    <div
                        class="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-valuemin="0"
                        aria-valuemax={now.span}
                        aria-valuenow={now.within ?? 0}
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
                    <p class="mt-2 text-sm text-muted-foreground">
                        {t("rank.summary.boundary")}
                    </p>
                {/if}
            {/if}
            {#if (info.placementLeft ?? 0) > 0}
                <p class="mt-1 text-sm text-muted-foreground">
                    {t("rank.summary.placement_left", { count: info.placementLeft ?? 0 })}
                </p>
            {/if}
        </div>
    </div>

    <ShieldPanel shieldsLeft={info.shieldsLeft} />
</Card>
