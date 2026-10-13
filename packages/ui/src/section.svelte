<script lang="ts">
    import type { HTMLAttributes } from "svelte/elements";
    import type { Snippet } from "svelte";
    import { cn } from "./utils";
    import Card, { type CardPadding, type CardRadius } from "./card.svelte";

    type Props = HTMLAttributes<HTMLElement> & {
        title?: string;
        titleClass?: string;
        radius?: CardRadius;
        padding?: CardPadding;
        class?: string;
        children?: Snippet;
    };

    let {
        title,
        titleClass = "mb-3",
        radius = "lg",
        padding = "md",
        class: className,
        children,
        ...rest
    }: Props = $props();
</script>

<Card as="section" {radius} {padding} class={className} {...rest}>
    {#if title}
        <h2 class={cn("text-sm font-medium", titleClass)}>{title}</h2>
    {/if}
    {@render children?.()}
</Card>
