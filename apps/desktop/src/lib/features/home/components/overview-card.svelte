<script lang="ts">
    import type { Component, Snippet } from "svelte";

    import Badge from "@deadlock-plus/ui/badge.svelte";

    type Props = {
        href: string;
        icon: Component<{ class?: string }>;
        title: string;
        badge?: string;
        children: Snippet;
    };

    let { href, icon: Icon, title, badge, children }: Props = $props();
</script>

<a
    {href}
    class="flex h-full flex-col gap-2 rounded-lg border border-border bg-card px-4 py-4 transition-colors hover:bg-accent/50"
>
    <div class="flex items-center gap-2">
        <Icon class="size-4 shrink-0 text-brass" />
        <p class="font-heading text-sm font-semibold tracking-wide">{title}</p>
        {#if badge}
            <Badge class="ml-auto">{badge}</Badge>
        {/if}
    </div>
    {@render children()}
</a>
