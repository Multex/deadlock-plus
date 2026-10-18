<script lang="ts">
    import type { RankTier } from "@deadlock-plus/stats/rank";
    import { t } from "$lib/core/i18n.svelte";
    import { partsName } from "$lib/features/stats/rank-view";
    import { rankView } from "../live";

    let {
        rank,
        tiers,
        fromHistory = false,
    }: { rank: number | null; tiers: RankTier[]; fromHistory?: boolean } = $props();

    const parts = $derived(rankView(rank));
    const tier = $derived(parts ? (tiers.find((t) => t.tier === parts.tier) ?? null) : null);
</script>

{#if parts}
    {@const name = partsName(tiers, parts)}
    <span class="badge" title={fromHistory ? t("live.rank_from_history", { rank: name }) : name}>
        {#if tier?.image}
            <img src={tier.image} alt="" class="art" />
            <span class="sub">{parts.sub}</span>
        {:else}
            <span class="numeral" style:background={tier?.color ?? "oklch(0.7 0.05 200)"}>{parts.tier}</span>
        {/if}
    </span>
{:else}
    <span class="none">–</span>
{/if}

<style>
    .badge {
        position: relative;
        display: inline-flex;
        width: var(--rank-badge-size, 24px);
        height: var(--rank-badge-size, 24px);
        align-items: center;
        justify-content: center;
    }
    .art {
        height: 100%;
        width: 100%;
        object-fit: contain;
        transform: translate(var(--rank-art-x, 0), var(--rank-art-y, 0)) scale(var(--rank-art-scale, 1));
    }
    .sub {
        position: absolute;
        bottom: -4px;
        left: 0;
        right: 0;
        text-align: center;
        font-size: 12px;
        font-weight: 800;
        line-height: 1;
        font-variant-numeric: tabular-nums;
        color: #fff;
        text-shadow:
            -1px -1px 0 oklch(0.1 0.01 70),
            1px -1px 0 oklch(0.1 0.01 70),
            -1px 1px 0 oklch(0.1 0.01 70),
            1px 1px 0 oklch(0.1 0.01 70),
            0 0 3px oklch(0.1 0.01 70);
    }
    .numeral {
        display: inline-flex;
        width: 24px;
        height: 20px;
        align-items: center;
        justify-content: center;
        border-radius: 5px;
        font-size: 11px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: oklch(0.15 0.01 70);
    }
    .none {
        opacity: 0.5;
    }
</style>
