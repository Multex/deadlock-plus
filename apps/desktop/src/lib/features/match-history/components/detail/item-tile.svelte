<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import { heroInitials } from "$lib/features/live/live";
    import type { ItemSlot } from "@deadlock-plus/match/scoreboard";

    let { slot }: { slot: ItemSlot | null } = $props();

    const label = $derived(slot ? (slot.name ?? t("match_history.detail.item_unknown", { id: slot.itemId })) : "");
</script>

{#if slot}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <li class="tile" data-label={label} tabindex="0">
        {#if slot.src}
            <img src={slot.src} alt={label} />
        {:else}
            <span class="ph" role="img" aria-label={label}>{slot.name ? heroInitials(slot.name) : "?"}</span>
        {/if}
    </li>
{:else}
    <li class="tile empty" aria-hidden="true"></li>
{/if}

<style>
    .tile {
        position: relative;
        display: flex;
        aspect-ratio: 1;
        min-width: 0;
        border-radius: 4px;
        background: color-mix(in oklch, var(--foreground) 8%, transparent);
    }
    .tile.empty {
        background: color-mix(in oklch, var(--foreground) 4%, transparent);
        outline: 1px dashed color-mix(in oklch, var(--foreground) 12%, transparent);
        outline-offset: -1px;
    }
    .tile:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: 1px;
    }
    .tile::after {
        content: attr(data-label);
        position: absolute;
        bottom: calc(100% + 4px);
        left: var(--tip-left, 50%);
        z-index: 20;
        translate: var(--tip-shift, -50% 0);
        padding: 3px 7px;
        border: 1px solid var(--border);
        border-radius: 6px;
        background: var(--popover, var(--card));
        color: var(--popover-foreground, var(--foreground));
        font-size: 12px;
        white-space: nowrap;
        pointer-events: none;
        display: none;
    }
    .tile:hover::after,
    .tile:focus-visible::after {
        display: block;
    }
    img {
        width: 100%;
        height: 100%;
        border-radius: 4px;
        object-fit: cover;
    }
    .ph {
        display: flex;
        width: 100%;
        height: 100%;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 700;
        color: var(--muted-foreground);
    }
</style>
