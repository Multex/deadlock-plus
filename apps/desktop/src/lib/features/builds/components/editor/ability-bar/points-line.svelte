<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import type { PointsSummary } from "../../../editor/ability-order";

    let { points, stepCount }: { points: PointsSummary; stepCount: number } = $props();
</script>

<span class="shrink-0">
    {points.available === null
        ? t("builds.editor.abilities.spent", { spent: points.spent })
        : t("builds.editor.abilities.spent_of", { spent: points.spent, available: points.available })}
    {#if stepCount > 0}
        <span class="text-muted-foreground/50" aria-hidden="true">·</span>
        {points.lastLevel === null
            ? t("builds.editor.abilities.last_level_unknown")
            : t("builds.editor.abilities.last_level", { level: points.lastLevel })}
    {/if}
</span>
