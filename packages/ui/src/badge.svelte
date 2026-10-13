<script lang="ts" module>
    import { tv, type VariantProps } from "tailwind-variants";

    export const badgeVariants = tv({
        base: "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&_svg]:size-3",
        variants: {
            variant: {
                default: "border-transparent bg-primary text-primary-foreground",
                secondary: "border-transparent bg-secondary text-secondary-foreground",
                outline: "border-border text-foreground",
                success: "border-transparent bg-success/15 text-success",
                warning: "border-transparent bg-warning/15 text-warning",
                destructive: "border-transparent bg-destructive/15 text-destructive",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    });

    export type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];
</script>

<script lang="ts">
    import type { HTMLAttributes } from "svelte/elements";
    import { cn } from "./utils";

    type Props = HTMLAttributes<HTMLSpanElement> & {
        variant?: BadgeVariant;
        class?: string;
    };

    let { variant = "default", class: className, children, ...rest }: Props = $props();
</script>

<span class={cn(badgeVariants({ variant }), className)} {...rest}>
    {@render children?.()}
</span>
