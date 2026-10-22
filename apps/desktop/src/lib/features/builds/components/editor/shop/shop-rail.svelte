<script lang="ts">
    import Button from "@deadlock-plus/ui/button.svelte";
    import { tick } from "svelte";
    import { t } from "$lib/core/i18n.svelte";
    import type { HeroKit } from "../../../build-detail.svelte";
    import type { ShopCatalog } from "../../../catalog";
    import type { BuildEditor } from "../../../editor/editor.svelte";
    import type { StatsById } from "../../../stats";
    import { RAIL_COLORS, RAIL_ICONS, RAIL_TABS, toggleTab, type RailTab } from "./rail";
    import { itemTipSource, provideItemTips } from "../../shop/item-tips";
    import ShopFlyout from "./shop-flyout.svelte";

    let {
        editor,
        catalog,
        statsById,
        kit = null,
    }: {
        editor: BuildEditor;
        catalog: ShopCatalog;
        statsById: StatsById;
        /** The hero's abilities and levels, for the shop tooltips' notes and hero level. */
        kit?: HeroKit | null;
    } = $props();

    const SEARCH_ID = "build-editor-item-search";

    let open = $state<RailTab | null>(null);
    const tips = itemTipSource();
    // The shop's tooltips show each item at its point in the build being edited.
    provideItemTips(() => {
        const outer = tips();
        return outer && { ...outer, build: editor.build, kit: kit ?? outer.kit ?? null };
    });
    const popularity = $derived(tips()?.popularity ?? null);

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
    class="rail relative z-30 flex w-[84px] shrink-0 flex-col items-end gap-1.5 border-r border-border bg-card py-2"
    aria-label={t("builds.editor.picker.label")}
>
    {#each RAIL_TABS as tab (tab)}
        {@const Icon = RAIL_ICONS[tab]}
        <Button
            variant="unstyled"
            class="rail-tab"
            style="--slot: {RAIL_COLORS[tab]}"
            data-rail-tab={tab}
            aria-pressed={open === tab}
            aria-keyshortcuts={tab === "search" ? "/" : undefined}
            onclick={() => (open = toggleTab(open, tab))}
        >
            <Icon aria-hidden="true" />
            <span class="rail-label">{label(tab)}</span>
        </Button>
    {/each}
</nav>

{#if open !== null && popularity}
    <ShopFlyout
        tab={open}
        {editor}
        {catalog}
        {statsById}
        {popularity}
        searchId={SEARCH_ID}
        onclose={() => (open = null)}
    />
{/if}

<style>
    /* Tabs sit flush against the flyout's edge like the game's: the open one fills in and points into the shop. */
    .rail :global(.rail-tab) {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        width: 72px;
        height: 72px;
        margin-right: -1px;
        border-radius: 10px 0 0 10px;
        background: color-mix(in oklch, var(--slot) 32%, var(--card));
        box-shadow: inset 3px 0 0 color-mix(in oklch, var(--slot) 55%, transparent);
        color: #fffc;
        transition:
            background-color 120ms ease-out,
            box-shadow 120ms ease-out,
            translate 120ms ease-out,
            color 120ms ease-out;
    }
    .rail :global(.rail-tab[data-rail-tab="popular"]) {
        margin-bottom: 8px;
    }
    .rail :global(.rail-tab[data-rail-tab="search"]) {
        margin-top: 8px;
    }
    .rail :global(.rail-tab:hover) {
        translate: 0 -2px;
        background: color-mix(in oklch, var(--slot) 50%, var(--card));
        box-shadow:
            inset 3px 0 0 var(--slot),
            0 4px 10px #0007;
        color: #fff;
    }
    .rail :global(.rail-tab[aria-pressed="true"]) {
        translate: none;
        background: color-mix(in oklch, var(--slot) 82%, black);
        box-shadow: inset 0 1px 0 #fff4;
        color: #fff;
    }
    .rail :global(.rail-tab[aria-pressed="true"]::after) {
        content: "";
        position: absolute;
        top: 50%;
        right: -9px;
        border-block: 9px solid transparent;
        border-left: 9px solid color-mix(in oklch, var(--slot) 82%, black);
        translate: 0 -50%;
    }
    .rail :global(.rail-tab:focus-visible) {
        box-shadow:
            0 0 0 2px var(--card),
            0 0 0 4px var(--slot);
    }
    .rail :global(.rail-tab svg) {
        width: 30px;
        height: 30px;
        filter: drop-shadow(0 1px 1px #0009);
    }
    .rail-label {
        font-family: var(--font-heading);
        font-size: 0.6875rem;
        font-weight: 600;
        line-height: 1;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        text-shadow: 0 1px 2px #000a;
    }
</style>
