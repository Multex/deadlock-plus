<script lang="ts">
    import Card from "@deadlock-plus/ui/card.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import Sparkline from "./sparkline.svelte";
    import type { HistoryPoint } from "../types";

    type Props = {
        shown: HistoryPoint[];
        series: { label: string; color: string; values: (number | null)[] }[];
    };

    let { shown, series }: Props = $props();
</script>

<Card as="section">
    <div class="mb-2 flex items-center justify-between">
        <h2 class="text-sm font-medium">
            {t("connection.history.title", { minutes: Math.round(shown.length / 60) })}
        </h2>
        <div class="flex gap-4 text-xs text-muted-foreground">
            {#each series as s (s.label)}
                <span class="flex items-center gap-1.5"
                    ><span class="inline-block h-0.5 w-4" style="background:{s.color}"></span>{s.label}</span
                >
            {/each}
        </div>
    </div>
    {#if shown.length < 2}
        <p class="py-8 text-center text-sm text-muted-foreground">{t("connection.history.empty")}</p>
    {:else}
        <Sparkline {series} />
    {/if}
</Card>
