<script lang="ts">
    import type { Snippet } from "svelte";
    import { cn } from "./utils";

    type Props = {
        label: string;
        for?: string;
        description?: string;
        hint?: string;
        size?: "default" | "sub";
        class?: string;
        details?: Snippet;
        children: Snippet;
    };

    let {
        label,
        for: controlId,
        description,
        hint,
        size = "default",
        class: className,
        details,
        children,
    }: Props = $props();

    const labelClass = $derived(
        size === "sub" ? "text-sm font-medium" : "font-heading text-sm font-semibold tracking-wide",
    );
    const descriptionClass = $derived(
        size === "sub" ? "text-xs text-muted-foreground" : "text-sm text-muted-foreground",
    );
</script>

<div class={cn("flex items-center justify-between gap-4", className)}>
    <div class="flex min-w-0 flex-col gap-1 break-words">
        {#if controlId}
            <label for={controlId} class={labelClass}>{label}</label>
        {:else}
            <h3 class={labelClass}>{label}</h3>
        {/if}
        {#if description}<p class={descriptionClass}>{description}</p>{/if}
        {#if hint}<p class="text-xs text-muted-foreground">{hint}</p>{/if}
        {@render details?.()}
    </div>
    {@render children()}
</div>
