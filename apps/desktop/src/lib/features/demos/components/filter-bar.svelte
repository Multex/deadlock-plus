<script lang="ts">
    import { Pin } from "@lucide/svelte";

    import { t, tn } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import { formatBytes, statusInfo, totalSize, type Demo, type DemoStatus } from "$lib/features/demos/demos";
    import type { DemoFilter } from "$lib/features/demos/list";

    let {
        demos,
        filtered,
        counts,
        filter,
        pinnedCount,
        onfilter,
    }: {
        demos: Demo[];
        filtered: Demo[];
        counts: Record<DemoStatus, number>;
        filter: DemoFilter;
        pinnedCount: number;
        onfilter: (next: DemoFilter) => void;
    } = $props();
</script>

<div class="flex flex-wrap items-center gap-2">
    <Button
        size="sm"
        variant={filter === "all" ? "default" : "outline"}
        aria-pressed={filter === "all"}
        onclick={() => onfilter("all")}
    >
        {t("demos.filter.all", { count: demos.length })}
    </Button>
    {#each ["complete", "outdated", "partial", "unknown"] as const as s (s)}
        {#if counts[s] > 0}
            <Button
                size="sm"
                variant={filter === s ? "default" : "outline"}
                aria-pressed={filter === s}
                onclick={() => onfilter(s)}
            >
                {t("demos.filter.status_count", { label: statusInfo(s).label, count: counts[s] })}
            </Button>
        {/if}
    {/each}
    <Button
        size="sm"
        variant={filter === "pinned" ? "default" : "outline"}
        aria-pressed={filter === "pinned"}
        onclick={() => onfilter("pinned")}
    >
        <Pin aria-hidden="true" />
        {t("demos.filter.pinned", { count: pinnedCount })}
    </Button>
    <span class="ml-auto text-sm text-muted-foreground">
        {tn("demos.filter.summary", filtered.length, { size: formatBytes(totalSize(filtered)) })}
    </span>
</div>
