<script lang="ts">
    import type { Snippet } from "svelte";
    import Card from "@deadlock-plus/ui/card.svelte";

    let { label, value, children }: { label: string; value: string; children?: Snippet } = $props();
</script>

<Card>
    <p class="text-sm text-muted-foreground">{label}</p>
    <p class="mt-1 font-heading text-3xl font-semibold">{value}</p>
    {@render children?.()}
</Card>
