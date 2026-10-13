<script lang="ts" module>
    import { tv, type VariantProps } from "tailwind-variants";

    export const cardVariants = tv({
        base: "border border-border bg-card",
        variants: {
            radius: {
                md: "rounded-md",
                lg: "rounded-lg",
            },
            padding: {
                none: "",
                sm: "p-3",
                md: "p-4",
                lg: "p-5",
                row: "px-4 py-3",
            },
        },
        defaultVariants: {
            radius: "lg",
            padding: "md",
        },
    });

    export type CardRadius = VariantProps<typeof cardVariants>["radius"];
    export type CardPadding = VariantProps<typeof cardVariants>["padding"];
</script>

<script lang="ts">
    import type { HTMLAttributes } from "svelte/elements";
    import { cn } from "./utils";

    type Props = HTMLAttributes<HTMLElement> & {
        as?: "div" | "section" | "li" | "article";
        radius?: CardRadius;
        padding?: CardPadding;
        class?: string;
    };

    let { as = "div", radius = "lg", padding = "md", class: className, children, ...rest }: Props = $props();
</script>

<svelte:element this={as} class={cn(cardVariants({ radius, padding }), className)} {...rest}>
    {@render children?.()}
</svelte:element>
