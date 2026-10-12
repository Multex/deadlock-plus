<script lang="ts" module>
    import { tv, type VariantProps } from "tailwind-variants";

    export const emptyStateVariants = tv({
        base: "text-center",
        variants: {
            layout: {
                inline: "",
                fill: "flex flex-1 items-center justify-center px-6",
            },
            size: {
                sm: "text-sm",
                base: "text-base",
            },
            tone: {
                muted: "text-muted-foreground",
                destructive: "text-destructive",
            },
            spacing: {
                none: "",
                sm: "py-6",
                md: "py-8",
                lg: "py-12",
                xl: "py-16",
            },
        },
        defaultVariants: {
            layout: "inline",
            size: "sm",
            tone: "muted",
            spacing: "md",
        },
    });

    export type EmptyStateLayout = VariantProps<typeof emptyStateVariants>["layout"];
    export type EmptyStateSize = VariantProps<typeof emptyStateVariants>["size"];
    export type EmptyStateTone = VariantProps<typeof emptyStateVariants>["tone"];
    export type EmptyStateSpacing = VariantProps<typeof emptyStateVariants>["spacing"];
</script>

<script lang="ts">
    import type { Snippet } from "svelte";
    import type { HTMLAttributes } from "svelte/elements";
    import { cn } from "$lib/core/utils";

    type Props = HTMLAttributes<HTMLElement> & {
        as?: "p" | "div" | "li";
        layout?: EmptyStateLayout;
        size?: EmptyStateSize;
        tone?: EmptyStateTone;
        spacing?: EmptyStateSpacing;
        action?: Snippet;
        class?: string;
    };

    let {
        as = "p",
        layout = "inline",
        size = "sm",
        tone = "muted",
        spacing,
        action,
        class: className,
        children,
        ...rest
    }: Props = $props();

    const resolvedSpacing = $derived(spacing ?? (layout === "fill" ? "none" : "md"));
</script>

<svelte:element
    this={as}
    class={cn(emptyStateVariants({ layout, size, tone, spacing: resolvedSpacing }), className)}
    {...rest}
>
    {@render children?.()}
    {#if action}
        <span class="mt-3 flex justify-center">{@render action()}</span>
    {/if}
</svelte:element>
