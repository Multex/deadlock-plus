<script lang="ts">
    import type { Snippet } from "svelte";
    import type { HTMLAttributes } from "svelte/elements";
    import { cn } from "./utils";

    type Props = HTMLAttributes<HTMLDivElement> & {
        class?: string;
        children?: Snippet;
    };

    let { class: className, children, ...rest }: Props = $props();
</script>

<div class={cn("mx-auto flex min-h-full max-w-5xl flex-col gap-5 px-8 pb-12 pt-8", className)} {...rest}>
    {@render children?.()}
</div>
