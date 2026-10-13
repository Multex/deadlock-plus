<script lang="ts">
    import type { Snippet } from "svelte";
    import type { HTMLAttributes } from "svelte/elements";
    import { cn } from "./utils";

    type Props = Omit<HTMLAttributes<HTMLElement>, "title"> & {
        title: string;
        subtitle?: string | Snippet;
        actions?: Snippet;
        class?: string;
    };

    let { title, subtitle, actions, class: className, ...rest }: Props = $props();
</script>

<header class={cn("flex flex-wrap items-start justify-between gap-3", className)} {...rest}>
    <div>
        <h1 class="text-3xl">{title}</h1>
        {#if typeof subtitle === "function"}
            <p class="mt-1 text-base text-muted-foreground">
                {@render subtitle()}
            </p>
        {:else if subtitle}
            <p class="mt-1 text-base text-muted-foreground">{subtitle}</p>
        {/if}
    </div>
    {#if actions}
        <div class="flex shrink-0 items-center gap-2">
            {@render actions()}
        </div>
    {/if}
</header>
