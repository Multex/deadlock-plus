<script lang="ts">
    import { Cross, Crosshair, Search, Sparkles, Star } from "@lucide/svelte";
    import IconButton from "@deadlock-plus/ui/icon-button.svelte";
    import type { Component } from "svelte";
    import { tick } from "svelte";
    import { t } from "$lib/core/i18n.svelte";
    import type { ShopCatalog } from "../../../catalog";
    import type { BuildEditor } from "../../../editor/editor.svelte";
    import { HeroPopularity } from "../../../editor/popularity.svelte";
    import type { StatsById } from "../../../stats";
    import { RAIL_TABS, toggleTab, type RailTab } from "./rail";
    import ShopFlyout from "./shop-flyout.svelte";

    let {
        editor,
        catalog,
        statsById,
        heroId,
    }: {
        editor: BuildEditor;
        catalog: ShopCatalog;
        statsById: StatsById;
        heroId: number;
    } = $props();

    const SEARCH_ID = "build-editor-item-search";

    const ICONS: Record<RailTab, Component> = {
        popular: Star,
        weapon: Crosshair,
        vitality: Cross,
        spirit: Sparkles,
        search: Search,
    };

    let open = $state<RailTab | null>(null);
    let popularLoading = $state(true);
    const popularity = new HeroPopularity();

    $effect(() => {
        const id = heroId;
        popularLoading = true;
        popularity.load(id).finally(() => {
            if (id === heroId) popularLoading = false;
        });
    });

    const label = (tab: RailTab) =>
        tab === "popular"
            ? t("builds.editor.shop.popular")
            : tab === "search"
              ? t("builds.editor.shop.search")
              : t(`builds.editor.picker.slot_${tab}`);

    function windowKey(event: KeyboardEvent) {
        if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
        const target = event.target as HTMLElement | null;
        if (event.key === "Escape" && open !== null) {
            if (target?.closest("[role='dialog'], [role='menu']")) return;
            open = null;
            return;
        }
        if (event.key !== "/") return;
        if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
        event.preventDefault();
        if (open === "search") tick().then(() => document.getElementById(SEARCH_ID)?.focus());
        else open = "search";
    }
</script>

<svelte:window onkeydown={windowKey} />

<nav
    class="rail flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-card py-2"
    aria-label={t("builds.editor.picker.label")}
>
    {#each RAIL_TABS as tab (tab)}
        {@const Icon = ICONS[tab]}
        <IconButton
            label={label(tab)}
            tooltip
            variant="toggle"
            class="rail-tab size-10"
            data-rail-tab={tab}
            aria-pressed={open === tab}
            aria-keyshortcuts={tab === "search" ? "/" : undefined}
            onclick={() => (open = toggleTab(open, tab))}
        >
            <Icon />
        </IconButton>
        {#if tab === "popular" || tab === "spirit"}
            <span class="my-1 h-px w-6 bg-border" aria-hidden="true"></span>
        {/if}
    {/each}
</nav>

{#if open !== null}
    <ShopFlyout
        tab={open}
        {editor}
        {catalog}
        {statsById}
        {popularity}
        {popularLoading}
        searchId={SEARCH_ID}
        onclose={() => (open = null)}
    />
{/if}

<style>
    .rail :global(.rail-tab[data-rail-tab="popular"]) {
        --slot: #6fd36f;
    }
    .rail :global(.rail-tab[data-rail-tab="weapon"]) {
        --slot: #ec9719;
    }
    .rail :global(.rail-tab[data-rail-tab="vitality"]) {
        --slot: #7bba1d;
    }
    .rail :global(.rail-tab[data-rail-tab="spirit"]) {
        --slot: #ce90ff;
    }
    .rail :global(.rail-tab svg) {
        width: 1.25rem;
        height: 1.25rem;
        color: var(--slot, currentColor);
    }
    .rail :global(.rail-tab[aria-pressed="true"]) {
        border-color: var(--slot, var(--brass));
        background: color-mix(in oklch, var(--slot, var(--brass)) 16%, transparent);
        box-shadow: inset 3px 0 0 var(--slot, var(--brass));
    }
</style>
