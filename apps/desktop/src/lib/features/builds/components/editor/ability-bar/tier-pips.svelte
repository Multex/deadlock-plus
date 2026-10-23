<script lang="ts">
    import { cn } from "@deadlock-plus/ui/utils";
    import { TIER_COSTS } from "../../../editor/ability-order";

    let {
        taken,
        next = null,
        class: className,
    }: {
        /** Tiers bought, 0-3. */
        taken: number;
        /** The tier a click buys next, drawn as an open brass ring. */
        next?: number | null;
        class?: string;
    } = $props();
</script>

<span class={cn("flex items-center gap-[3px]", className)} aria-hidden="true">
    {#each TIER_COSTS as _, i (i)}
        <span
            class={cn(
                "size-1.5 rounded-full",
                i < taken
                    ? "bg-brass shadow-[0_0_4px_color-mix(in_oklch,var(--brass)_60%,transparent)]"
                    : next === i + 1
                      ? "ring-1 ring-brass/70 ring-inset"
                      : "bg-muted-foreground/25",
            )}
        ></span>
    {/each}
</span>
