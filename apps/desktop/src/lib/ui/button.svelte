<script lang="ts" module>
    import { tv, type VariantProps } from "tailwind-variants";

    export const buttonVariants = tv({
        base: "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-[color,background-color,border-color,box-shadow,opacity,translate] active:translate-y-px disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        variants: {
            variant: {
                default:
                    "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_1px_2px_rgb(0_0_0/0.3)] hover:opacity-90 active:opacity-80",
                destructive: "bg-destructive text-destructive-foreground shadow-sm hover:opacity-90 active:opacity-80",
                outline:
                    "border border-input bg-transparent shadow-sm hover:border-brass/50 hover:bg-accent hover:text-accent-foreground active:bg-accent/70",
                secondary: "bg-secondary text-secondary-foreground shadow-sm hover:opacity-90 active:opacity-80",
                ghost: "hover:bg-accent hover:text-accent-foreground active:bg-accent/70",
                link: "text-primary underline-offset-4 hover:underline active:translate-y-0",
                // An on/off control: set `aria-pressed`, the lit state is drawn from it.
                toggle: "border border-input bg-transparent text-muted-foreground shadow-sm hover:border-brass/50 hover:bg-accent hover:text-accent-foreground active:bg-accent/70 aria-pressed:border-brass/70 aria-pressed:bg-brass/10 aria-pressed:text-foreground aria-pressed:shadow-[inset_0_-2px_0_var(--brass),inset_0_0_12px_color-mix(in_oklch,var(--brass)_18%,transparent)] aria-pressed:hover:bg-brass/15 aria-pressed:[&_svg]:text-brass",
            },
            size: {
                default: "h-9 px-4 py-2 [&_svg]:size-4",
                sm: "h-8 rounded-md px-3 text-xs [&_svg]:size-3.5",
                lg: "h-10 rounded-md px-6 [&_svg]:size-4",
                icon: "h-9 w-9 [&_svg]:size-4",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    });

    // Only the focus ring and disabled state: for clickable cards and rows that carry their own layout and colours.
    export const unstyledButtonClass =
        "text-left transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

    export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
    export type ButtonSize = VariantProps<typeof buttonVariants>["size"];
</script>

<script lang="ts">
    import type { HTMLButtonAttributes } from "svelte/elements";
    import { cn } from "$lib/core/utils";

    type Props = HTMLButtonAttributes & {
        variant?: ButtonVariant | "unstyled";
        size?: ButtonSize;
        class?: string;
        ref?: HTMLButtonElement | null;
    };

    let {
        variant = "default",
        size = "default",
        class: className,
        ref = $bindable(null),
        children,
        ...rest
    }: Props = $props();
</script>

<button
    bind:this={ref}
    class={cn(variant === "unstyled" ? unstyledButtonClass : buttonVariants({ variant, size }), className)}
    {...rest}
>
    {@render children?.()}
</button>
