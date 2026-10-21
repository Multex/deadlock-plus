<script lang="ts">
    import { Search, X } from "@lucide/svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import IconButton from "@deadlock-plus/ui/icon-button.svelte";
    import Input from "@deadlock-plus/ui/input.svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import type { ShopUiImage } from "@deadlock-plus/ipc-types/ShopUiImage";
    import { tick } from "svelte";
    import { formatNumber, t } from "$lib/core/i18n.svelte";
    import Segmented from "$lib/features/match-history/components/list/segmented.svelte";
    import { isInShop, type ShopCatalog, type ShopItem } from "../../../catalog";
    import { drag } from "../../../editor/drag.svelte";
    import type { BuildEditor } from "../../../editor/editor.svelte";
    import {
        GRID_SLOTS,
        inBuildCounts,
        itemFilters,
        nearestCard,
        providedFilters,
        taggedCategories,
        type ArrowKey,
        type FilterCategory,
    } from "../../../editor/picker";
    import { PHASES, type Phase } from "../../../editor/popularity";
    import type { HeroPopularity } from "../../../editor/popularity.svelte";
    import { statLabelMatchers, type StatsById } from "../../../stats";
    import { addToTarget, flyoutRows, RAIL_COLORS, RAIL_ICONS, type RailTab } from "./rail";
    import ShopTile from "./shop-tile.svelte";

    let {
        tab,
        editor,
        catalog,
        statsById,
        popularity,
        popularLoading,
        uiArt,
        searchId,
        onclose,
    }: {
        tab: RailTab;
        editor: BuildEditor;
        catalog: ShopCatalog;
        statsById: StatsById;
        popularity: HeroPopularity;
        popularLoading: boolean;
        /** The game's own shop icons by name; missing ones fall back to drawn icons or plain labels. */
        uiArt: Partial<Record<ShopUiImage, string>>;
        searchId: string;
        onclose: () => void;
    } = $props();

    /** The game's stat tab colours. */
    const TAB_COLORS: Record<FilterCategory, string> = {
        physical: "#c0673b",
        spirit: "#b377e3",
        defense: "#28ae4e",
        mobility: "#30ace6",
        disruption: "#e3b018",
        misc: "#b38763",
    };

    const ARROWS = new Set<string>(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

    let query = $state("");
    let phase = $state<Phase | null>(null);
    let categories = $state<ReadonlySet<FilterCategory>>(new Set());
    let focused = $state(0);
    let list = $state<HTMLElement>();

    const matchers = $derived(statLabelMatchers(statsById));
    const filtersOf = (item: ShopItem) => providedFilters(statsById.get(item.id) ?? []);
    const rows = $derived(flyoutRows(catalog, tab, { query, phase, categories, filtersOf }, popularity.game, matchers));
    const tiles = $derived(rows.flatMap((r) => r.cells.flatMap((c) => c.items)));
    // Each cell's first tile index; the roving tabindex and arrow keys count tiles in DOM order.
    const offsets = $derived.by(() => {
        let n = 0;
        return rows.map((r) =>
            r.cells.map((c) => {
                const start = n;
                n += c.items.length;
                return start;
            }),
        );
    });
    const counts = $derived(inBuildCounts(editor.build));
    const searching = $derived(tab === "search");
    const grid = $derived(tab === "popular" || tab === "search");
    const dragging = $derived(drag.current?.payload.kind === "new");
    const offered = $derived(
        taggedCategories([...catalog.byId.values()].filter(isInShop).map((item) => itemFilters(item, filtersOf(item)))),
    );

    $effect(() => {
        if (focused >= tiles.length) focused = Math.max(0, tiles.length - 1);
    });

    $effect(() => {
        if (tab === "search") tick().then(() => document.getElementById(searchId)?.focus());
        else focused = 0;
    });

    const title = $derived(
        tab === "popular"
            ? t("builds.editor.shop.popular")
            : tab === "search"
              ? t("builds.editor.shop.search")
              : t(`builds.editor.picker.slot_${tab}`),
    );

    const phaseOptions = $derived([
        { value: "all" as const, label: t("builds.editor.shop.phase_all") },
        ...PHASES.map((p) => ({ value: p, label: t(`builds.editor.picker.phase_${p}`) })),
    ]);

    function add(id: number) {
        editor.apply(addToTarget(editor.build, editor.activeCategory, [id]));
    }

    function toggleCategory(category: FilterCategory) {
        const next = new Set(categories);
        if (!next.delete(category)) next.add(category);
        categories = next;
    }

    function tileElements(): HTMLElement[] {
        return [...(list?.querySelectorAll<HTMLElement>("[data-tile]") ?? [])];
    }

    function focusTile(index: number) {
        focused = index;
        tileElements()[index]?.focus();
    }

    function tileKey(event: KeyboardEvent, index: number) {
        if (!ARROWS.has(event.key)) return;
        event.preventDefault();
        const rects = tileElements().map((el) => el.getBoundingClientRect());
        const top = rects[index] && rects.every((r) => r.y >= rects[index]!.y - 1);
        if (event.key === "ArrowUp" && top && searching) {
            document.getElementById(searchId)?.focus();
            return;
        }
        focusTile(nearestCard(rects, index, event.key as ArrowKey));
    }

    function searchKey(event: KeyboardEvent) {
        if (event.key === "Escape" && query !== "") {
            event.preventDefault();
            event.stopPropagation();
            query = "";
        } else if (event.key === "ArrowDown" && tiles.length > 0) {
            event.preventDefault();
            focusTile(Math.min(focused, tiles.length - 1));
        } else if (event.key === "Enter" && query.trim() !== "") {
            // The grid keeps shop order, so Enter takes the best-ranked hit rather than the first tile.
            const best = catalog.search(query, tiles)[0];
            if (best) {
                event.preventDefault();
                add(best.id);
            }
        }
    }

    const empty = $derived.by(() => {
        if (tab === "search") {
            return query.trim() === ""
                ? t("builds.editor.shop.no_filter_results")
                : t("builds.editor.picker.no_results", { query: query.trim() });
        }
        if (tab === "popular") {
            return popularLoading ? t("builds.editor.shop.popular_loading") : t("builds.editor.shop.popular_empty");
        }
        return t("builds.editor.picker.empty");
    });
</script>

<section
    class="flyout absolute top-0 bottom-0 left-[84px] z-20 flex flex-col bg-card"
    class:grid-view={grid}
    class:dragging
    data-shop-tab={tab}
    style="--accent-slot: {RAIL_COLORS[tab]}"
    aria-label={t("builds.editor.picker.label")}
>
    <header class="flex flex-col gap-2 px-3 pt-2 pb-2">
        <div class="flex items-center gap-3">
            <h2 class="title">{title}</h2>
            {#if tab === "popular"}
                <Segmented
                    options={phaseOptions}
                    value={phase ?? "all"}
                    label={t("builds.editor.shop.phase_label")}
                    onselect={(v) => (phase = v === "all" ? null : v)}
                />
            {/if}
            {#if searching}
                <div class="relative ml-auto w-56">
                    <Search
                        class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                    />
                    <Input
                        id={searchId}
                        bind:value={query}
                        type="search"
                        class="h-8 pl-8"
                        placeholder={t("builds.editor.picker.search")}
                        aria-label={t("builds.editor.picker.search_label")}
                        aria-keyshortcuts="/"
                        onkeydown={searchKey}
                    />
                </div>
            {/if}
            <IconButton
                label={t("builds.editor.shop.close")}
                size="sm"
                class="size-7 {searching ? '' : 'ml-auto'}"
                onclick={onclose}
            >
                <X />
            </IconButton>
        </div>
        {#if searching && offered.length > 0}
            <div class="flex flex-wrap gap-1.5" role="group" aria-label={t("builds.editor.shop.filters_label")}>
                {#each offered as category (category)}
                    {@const art = uiArt[`filter_${category}`]}
                    <Button
                        variant="toggle"
                        size="sm"
                        class="h-7 px-2.5 text-xs"
                        data-filter-category={category}
                        style="--tab: {TAB_COLORS[category]}"
                        aria-pressed={categories.has(category)}
                        onclick={() => toggleCategory(category)}
                    >
                        {#if art}
                            <span class="filter-icon" style="--sigil: url('{art}')" aria-hidden="true"></span>
                        {/if}
                        {t(`builds.editor.shop.filter_${category}`)}
                    </Button>
                {/each}
            </div>
        {/if}
    </header>

    {#if grid}
        <div class="columns" aria-hidden="true">
            {#each GRID_SLOTS as slot (slot)}
                {@const Icon = RAIL_ICONS[slot]}
                {@const art = uiArt[`slot_${slot}`]}
                <div class="column-head" style="--slot: {RAIL_COLORS[slot]}">
                    {#if art}
                        <img src={art} alt="" draggable="false" />
                    {:else}
                        <Icon />
                    {/if}
                    <span>{t(`builds.editor.picker.slot_${slot}`)}</span>
                </div>
            {/each}
        </div>
    {/if}

    <div class="body min-h-0 flex-1 overflow-y-auto" bind:this={list}>
        {#if tiles.length === 0}
            <EmptyState role="status" size="sm" tone="muted" spacing="lg">{empty}</EmptyState>
        {:else}
            <Tooltip.Provider>
                {#each rows as row, r (row.key)}
                    <div class="tier" data-row={row.key}>
                        <div class="rule" aria-label={t("builds.editor.picker.tier", { tier: row.tier })}>
                            {#if row.price !== null}
                                <span class="souls">{formatNumber(row.price)}</span>
                            {/if}
                        </div>
                        <div class="cells">
                            {#each row.cells as cell, c (cell.slot)}
                                <div class="cell" data-cell={cell.slot}>
                                    {#each cell.items as item, i (item.id)}
                                        {@const index = offsets[r]![c]! + i}
                                        <ShopTile
                                            {item}
                                            {popularity}
                                            count={counts.get(item.id) ?? 0}
                                            focusable={index === focused}
                                            onadd={() => {
                                                focused = index;
                                                add(item.id);
                                            }}
                                            onkeydown={(e) => tileKey(e, index)}
                                            onfocus={() => (focused = index)}
                                        />
                                    {/each}
                                </div>
                            {/each}
                        </div>
                    </div>
                {/each}
            </Tooltip.Provider>
        {/if}
    </div>
</section>

<style>
    .flyout {
        --edge: color-mix(in oklch, var(--accent-slot) 82%, black);
        width: 420px;
        /* Same colour as the open rail tab, whose arrow overlaps the left edge, so tab and shop read as one piece. */
        border: 2px solid var(--edge);
        box-shadow: 12px 0 32px #0008;
        transition:
            opacity 140ms ease-out,
            transform 140ms ease-out;
    }
    /* Four tiles per slot column like the game, while leaving a strip of canvas to drop on. */
    .flyout.grid-view {
        width: min(860px, calc(100% - 84px - 160px));
    }
    /* Slides aside while a tile is dragged out so the whole canvas can take the drop; it comes back after. */
    .flyout.dragging {
        opacity: 0;
        transform: translateX(-24px);
        pointer-events: none;
    }
    .title {
        color: var(--accent-slot);
        font-family: var(--font-heading);
        font-size: 0.875rem;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
    }

    .columns {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .column-head {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        height: 34px;
        border-bottom: 2px solid var(--slot);
        background: color-mix(in oklch, var(--slot) 30%, var(--card));
        color: #fff;
        font-family: var(--font-heading);
        font-size: 0.8125rem;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        text-shadow: 0 1px 2px #000a;
    }
    .column-head img {
        width: 18px;
        height: 18px;
        object-fit: contain;
    }
    /* The sigils ship dark; the game washes each with its tab colour. */
    .filter-icon {
        width: 16px;
        height: 16px;
        background: var(--tab);
        mask: var(--sigil) center / contain no-repeat;
    }
    :global([data-filter-category][aria-pressed="true"]) {
        border-color: var(--tab) !important;
        background: color-mix(in oklch, var(--tab) 22%, transparent) !important;
        box-shadow: inset 0 -2px 0 var(--tab) !important;
    }
    .column-head :global(svg) {
        width: 16px;
        height: 16px;
        color: var(--slot);
        filter: drop-shadow(0 1px 1px #000a);
    }

    .body {
        padding-bottom: 12px;
    }
    /* Column stripes run the whole height so a slot reads straight down across the tier rows. */
    .grid-view .body {
        background: linear-gradient(
            to right,
            color-mix(in oklch, #ec9719 5%, transparent) 0 33.333%,
            color-mix(in oklch, #ce90ff 7%, transparent) 33.333% 66.667%,
            color-mix(in oklch, #7bba1d 5%, transparent) 66.667%
        );
    }

    .rule {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 10px 12px 6px;
        min-height: 14px;
        font-family: var(--font-heading);
        font-size: 0.8125rem;
        font-weight: 700;
    }
    .rule::after {
        content: "";
        flex: 1;
        height: 1px;
        background: var(--border);
    }
    .souls {
        color: #7de6c5;
        font-variant-numeric: tabular-nums;
    }

    .cell {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
        align-content: start;
        gap: 4px;
        padding: 0 12px;
    }
    .grid-view .cells {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .grid-view .cell {
        grid-template-columns: repeat(4, minmax(0, 1fr));
        padding: 0 8px;
    }
</style>
