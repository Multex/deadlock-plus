<script lang="ts">
    import { t, tn } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import type { Scope } from "@deadlock-plus/stats/stats";
    import ScopeButtons from "../shared/scope-buttons.svelte";

    let { scope = $bindable(), days = $bindable() }: { scope: Scope; days: number | null } = $props();

    const windows = $derived<{ days: number | null; label: string }[]>([
        { days: 7, label: tn("stats.filter.days", 7) },
        { days: 30, label: tn("stats.filter.days", 30) },
        { days: 90, label: tn("stats.filter.days", 90) },
        { days: null, label: t("stats.filter.all_time") },
    ]);
</script>

<div class="flex flex-wrap items-center gap-2">
    <ScopeButtons bind:scope />
    <span class="mx-2 h-5 w-px bg-border" aria-hidden="true"></span>
    {#each windows as w (w.label)}
        <Button
            size="sm"
            variant={days === w.days ? "default" : "outline"}
            aria-pressed={days === w.days}
            onclick={() => (days = w.days)}>{w.label}</Button
        >
    {/each}
</div>
