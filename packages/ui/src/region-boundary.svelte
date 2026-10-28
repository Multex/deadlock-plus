<script lang="ts">
    import type { Snippet } from "svelte";
    import RegionError from "./region-error.svelte";

    type Props = {
        name: string;
        title: string;
        body?: string;
        retryLabel: string;
        size?: "sm" | "md";
        onretry?: () => void;
        onerror?: (error: unknown, name: string) => void;
        children: Snippet;
    };

    let { name, title, body, retryLabel, size, onretry, onerror, children }: Props = $props();
</script>

<svelte:boundary onerror={(error) => onerror?.(error, name)}>
    {@render children()}

    {#snippet failed(_error, reset)}
        <RegionError
            {name}
            {title}
            {body}
            {retryLabel}
            {size}
            onretry={() => {
                onretry?.();
                reset();
            }}
        />
    {/snippet}
</svelte:boundary>
