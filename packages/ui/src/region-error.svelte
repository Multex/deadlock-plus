<script lang="ts">
    import { CircleAlert } from "@lucide/svelte";
    import Button from "./button.svelte";
    import EmptyState from "./empty-state.svelte";

    type Props = {
        name: string;
        title: string;
        body?: string;
        retryLabel?: string;
        onretry?: () => void;
        size?: "sm" | "md";
        class?: string;
    };

    let { name, title, body, retryLabel, onretry, size = "md", class: className }: Props = $props();
</script>

<EmptyState
    as="div"
    size={size === "md" ? "base" : "sm"}
    spacing={size === "md" ? "xl" : "md"}
    class={className}
    data-region={name}
    data-region-state="error"
    action={onretry ? retry : undefined}
>
    <p class="flex items-center justify-center gap-2">
        <CircleAlert class="size-4 shrink-0" aria-hidden="true" />
        {title}
    </p>
    {#if body}
        <p class="mt-1">{body}</p>
    {/if}
</EmptyState>

{#snippet retry()}
    <Button variant="outline" size="sm" onclick={onretry}>{retryLabel}</Button>
{/snippet}
