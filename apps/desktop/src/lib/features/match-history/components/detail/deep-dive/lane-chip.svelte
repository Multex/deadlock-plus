<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import type { Lane } from "@deadlock-plus/match/deep-dive/lanes";

    let { lane, ordinal }: { lane?: Lane; ordinal?: number } = $props();

    const colour = $derived(lane ? t(`match_history.deep_dive.lanes.${lane.color}`) : null);
    const street = $derived(lane ? t(`match_history.deep_dive.lanes.street_${lane.color}`) : null);
    const label = $derived(
        colour ?? (ordinal === undefined ? null : t("match_history.deep_dive.lanes.ordinal", { n: ordinal })),
    );
</script>

{#if label}
    <span
        class="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs"
        title={street ? t("match_history.deep_dive.lanes.named", { colour: colour ?? "", street }) : label}
    >
        <i
            class="inline-block size-2.5 rounded-full"
            style:background={lane?.hex ?? "var(--color-muted-foreground)"}
            aria-hidden="true"
        ></i>
        {label}
    </span>
{/if}
