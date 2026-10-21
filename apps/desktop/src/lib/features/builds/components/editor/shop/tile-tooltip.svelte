<script lang="ts">
    import { TrendingUp } from "@lucide/svelte";
    import type { ItemStat } from "@deadlock-plus/ipc-types/ItemStat";
    import { formatNumber, t } from "$lib/core/i18n.svelte";
    import type { ShopItem } from "../../../catalog";
    import type { PopularityText } from "../../../editor/popularity.svelte";

    let {
        item,
        stats,
        count,
        lines,
    }: {
        item: ShopItem;
        stats: readonly ItemStat[];
        count: number;
        lines: PopularityText;
    } = $props();

    function statValue(value: number, unit: string | null): string {
        return `${value > 0 ? "+" : ""}${formatNumber(value)}${unit ?? ""}`;
    }
</script>

<div class="flex items-baseline justify-between gap-2">
    <span class="font-heading text-sm font-semibold">{item.name}</span>
    <span class="souls shrink-0">{formatNumber(item.cost)}</span>
</div>
<div class="text-muted-foreground">
    {t("builds.editor.picker.tier_slot", {
        tier: item.tier,
        slot: t(`builds.editor.picker.slot_${item.slot}`),
    })}{item.active ? ` · ${t("builds.editor.picker.active")}` : ""}
</div>
{#if stats.length > 0}
    <ul class="mt-1.5 flex flex-col gap-0.5">
        {#each stats as stat (stat.key)}
            <li class="flex justify-between gap-3">
                <span class="text-muted-foreground">{stat.label}</span>
                <span class="tabular-nums">{statValue(stat.value, stat.unit)}</span>
            </li>
        {/each}
    </ul>
{/if}
{#if lines.popular.length > 0 || lines.stats.length > 0}
    <div class="mt-1.5 flex flex-col gap-0.5 border-t border-border pt-1.5">
        {#each lines.popular as line (line)}
            <div class="popular flex items-start gap-1.5">
                <TrendingUp class="mt-px size-3.5 shrink-0" aria-hidden="true" />
                <span>{line}</span>
            </div>
        {/each}
        {#each lines.stats as line (line.label)}
            <div class="flex justify-between gap-3">
                <span class="text-muted-foreground">{line.label}</span>
                <span class="tabular-nums">{line.value}</span>
            </div>
        {/each}
    </div>
{/if}
{#if count > 0}
    <div class="mt-1.5 text-muted-foreground">{t("builds.editor.picker.in_build", { count })}</div>
{/if}

<style>
    .souls {
        color: #7de6c5;
        font-variant-numeric: tabular-nums;
    }
    .popular {
        color: #6fd36f;
    }
</style>
