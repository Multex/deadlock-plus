<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import type { Scope } from "@deadlock-plus/stats/stats";

    let { scope = $bindable() }: { scope: Scope } = $props();

    const scopes = $derived<{ id: Scope; label: string }[]>([
        { id: "ranked", label: t("stats.scope.ranked") },
        { id: "unranked", label: t("stats.scope.unranked") },
        { id: "all", label: t("stats.scope.all") },
    ]);
</script>

{#each scopes as s (s.id)}
    <Button
        size="sm"
        variant={scope === s.id ? "default" : "outline"}
        aria-pressed={scope === s.id}
        onclick={() => (scope = s.id)}>{s.label}</Button
    >
{/each}
