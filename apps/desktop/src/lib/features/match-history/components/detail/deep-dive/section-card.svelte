<script lang="ts">
    import type { Component, Snippet } from "svelte";
    import Section from "$lib/ui/section.svelte";
    import Unavailable from "./unavailable.svelte";

    type Icon = Component<{ size?: number; class?: string; "aria-hidden"?: boolean | "true" | "false" }>;

    let {
        title,
        available,
        icon: Heading,
        actions,
        children,
    }: { title: string; available: boolean; icon?: Icon; actions?: Snippet; children: Snippet } = $props();
</script>

<Section>
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="flex items-center gap-2 text-sm font-medium">
            {#if Heading}
                <Heading size={16} class="shrink-0 text-muted-foreground" aria-hidden="true" />
            {/if}
            {title}
        </h2>
        {#if actions}
            <div class="flex items-center gap-2">{@render actions()}</div>
        {/if}
    </div>
    {#if available}
        {@render children()}
    {:else}
        <Unavailable />
    {/if}
</Section>
