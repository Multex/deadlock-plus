<script lang="ts">
    import { formatDate, t } from "$lib/core/i18n.svelte";
    import { dayKey, type DayGroup } from "@deadlock-plus/match/list-summary";

    let { group, nowS }: { group: DayGroup; nowS: number } = $props();

    const label = $derived.by(() => {
        if (group.key === dayKey(nowS)) return t("home.today");
        if (group.key === dayKey(nowS - 86_400)) return t("home.yesterday");
        return formatDate(group.startTime * 1000, { weekday: "long", day: "numeric", month: "long" });
    });
</script>

<div
    class="sticky top-0 z-(--z-local) -mx-1 flex items-baseline justify-between gap-3 bg-background/90 px-1 py-1.5 backdrop-blur-sm"
>
    <h2 class="text-sm font-medium">{label}</h2>
    <p class="text-xs text-muted-foreground tabular-nums">
        {t("stats.record", { wins: group.wins, losses: group.losses })}
    </p>
</div>
