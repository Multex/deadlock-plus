<script lang="ts">
    import { cn } from "@deadlock-plus/ui/utils";
    import type { AbilityInfo } from "../../../build-detail.svelte";

    let {
        ability,
        ultimate = false,
        class: className,
    }: { ability: AbilityInfo | undefined; ultimate?: boolean; class?: string } = $props();

    let failed = $state(false);

    const initials = $derived(
        (ability?.name ?? "?")
            .split(/\s+/)
            .slice(0, 2)
            .map((word) => word[0]?.toUpperCase() ?? "")
            .join(""),
    );
</script>

<span
    class={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-md border bg-muted",
        ultimate ? "border-brass/70" : "border-border",
        className,
    )}
>
    {#if ability?.art && !failed}
        <img
            src={ability.art}
            alt=""
            draggable="false"
            class="size-[78%] object-contain"
            onerror={() => (failed = true)}
        />
    {:else}
        <span class="text-xs text-muted-foreground" aria-hidden="true">{initials}</span>
    {/if}
</span>
