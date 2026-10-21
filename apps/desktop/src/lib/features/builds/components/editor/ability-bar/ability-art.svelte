<script lang="ts">
    import { cn } from "@deadlock-plus/ui/utils";
    import type { AbilityInfo } from "../../../build-detail.svelte";

    let { ability, class: className }: { ability: AbilityInfo | undefined; class?: string } = $props();

    let failed = $state(false);

    const initials = $derived(
        (ability?.name ?? "?")
            .split(/\s+/)
            .slice(0, 2)
            .map((word) => word[0]?.toUpperCase() ?? "")
            .join(""),
    );
</script>

{#if ability?.art && !failed}
    <img
        src={ability.art}
        alt=""
        draggable="false"
        class={cn("object-contain select-none", className)}
        onerror={() => (failed = true)}
    />
{:else}
    <span
        class={cn("grid place-items-center text-[10px] font-semibold text-muted-foreground", className)}
        aria-hidden="true"
    >
        {initials}
    </span>
{/if}
