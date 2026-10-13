<script lang="ts">
    import type { HTMLInputAttributes } from "svelte/elements";
    import { cn } from "./utils";

    type Props = HTMLInputAttributes & {
        class?: string;
        value?: string;
    };

    let { class: className, value = $bindable(""), ...rest }: Props = $props();
</script>

<input
    bind:value
    class={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className,
    )}
    {...rest}
/>
