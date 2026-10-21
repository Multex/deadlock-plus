<script lang="ts">
    import { Search, X } from "@lucide/svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import IconButton from "@deadlock-plus/ui/icon-button.svelte";
    import Input from "@deadlock-plus/ui/input.svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { tick } from "svelte";
    import { formatNumber, t } from "$lib/core/i18n.svelte";
    import type { ShopCatalog } from "../../../catalog";
    import { drag } from "../../../editor/drag.svelte";
    import type { BuildEditor } from "../../../editor/editor.svelte";
    import { inBuildCounts, nearestCard, type ArrowKey } from "../../../editor/picker";
    import type { HeroPopularity } from "../../../editor/popularity.svelte";
    import { statLabelMatchers, type StatsById } from "../../../stats";
    import { addToTarget, flyoutRows, type FlyoutHeading, type RailTab } from "./rail";
    import ShopTile from "./shop-tile.svelte";

    let {
        tab,
        editor,
        catalog,
        statsById,
        popularity,
        popularLoading,
        searchId,
        onclose,
    }: {
        tab: RailTab;
        editor: BuildEditor;
        catalog: ShopCatalog;
        statsById: StatsById;
        popularity: HeroPopularity;
        popularLoading: boolean;
        searchId: string;
        onclose: () => void;
    } = $props();

    const ARROWS = new Set<string>(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

    let query = $state("");
    let focused = $state(0);
    let list = $state<HTMLElement>();

    const matchers = $derived(statLabelMatchers(statsById));
    const rows = $derived(flyoutRows(catalog, tab, query, popularity.game, matchers));
    const tiles = $derived(rows.flatMap((r) => r.items));
    // An item can sit in more than one Popular phase, so a tile's index comes from its row, not its id.
    const offsets = $derived(
        rows.reduce<number[]>((acc, r, i) => [...acc, i === 0 ? 0 : acc[i - 1]! + rows[i - 1]!.items.length], []),
    );
    const counts = $derived(inBuildCounts(editor.build));
    const searching = $derived(tab === "search");
    const dragging = $derived(drag.current?.payload.kind === "new");

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

    function add(id: number) {
        editor.apply(addToTarget(editor.build, editor.activeCategory, [id]));
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
        } else if (event.key === "Enter" && tiles.length > 0) {
            event.preventDefault();
            add(tiles[0]!.id);
        }
    }

    function heading(h: FlyoutHeading): string {
        if (h.kind === "tier") return t("builds.editor.picker.tier", { tier: h.tier });
        if (h.kind === "phase") return t(`builds.editor.picker.phase_${h.phase}`);
        return t(`builds.editor.picker.slot_${h.slot}`);
    }

    const empty = $derived.by(() => {
        if (tab === "search") {
            return query.trim() === ""
                ? t("builds.editor.shop.search_hint")
                : t("builds.editor.picker.no_results", { query: query.trim() });
        }
        if (tab === "popular") {
            return popularLoading ? t("builds.editor.shop.popular_loading") : t("builds.editor.shop.popular_empty");
        }
        return t("builds.editor.picker.empty");
    });
</script>

<section
    class="flyout absolute top-0 bottom-0 left-14 z-20 flex w-[420px] flex-col border-r border-border bg-card"
    class:dragging
    data-shop-tab={tab}
    aria-label={t("builds.editor.picker.label")}
>
    <header class="flex flex-col gap-2 border-b border-border px-3 pt-2 pb-2">
        <div class="flex items-center justify-between gap-2">
            <h2 class="title">{title}</h2>
            <IconButton label={t("builds.editor.shop.close")} size="sm" class="size-7" onclick={onclose}>
                <X />
            </IconButton>
        </div>
        {#if searching}
            <div class="relative">
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
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-3" bind:this={list}>
        {#if tiles.length === 0}
            <EmptyState role="status" size="sm" tone="muted" spacing="lg">{empty}</EmptyState>
        {:else}
            <Tooltip.Provider>
                {#each rows as row, r (row.key)}
                    <div class="row-heading" data-row={row.key}>
                        <span>{heading(row.heading)}</span>
                        {#if row.heading.kind === "tier" && row.heading.price !== null}
                            <span class="souls">{formatNumber(row.heading.price)}</span>
                        {/if}
                    </div>
                    <div class="tiles">
                        {#each row.items as item, i (item.id)}
                            {@const index = offsets[r]! + i}
                            <ShopTile
                                {item}
                                {popularity}
                                count={counts.get(item.id) ?? 0}
                                stats={statsById.get(item.id) ?? []}
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
            </Tooltip.Provider>
        {/if}
    </div>
</section>

<style>
    .flyout {
        box-shadow: 12px 0 32px #0008;
        transition:
            opacity 140ms ease-out,
            transform 140ms ease-out;
    }
    /* Slides aside while a tile is dragged out so the whole canvas can take the drop; it comes back after. */
    .flyout.dragging {
        opacity: 0;
        transform: translateX(-24px);
        pointer-events: none;
    }
    .flyout[data-shop-tab="weapon"] {
        --accent-slot: #ec9719;
    }
    .flyout[data-shop-tab="vitality"] {
        --accent-slot: #7bba1d;
    }
    .flyout[data-shop-tab="spirit"] {
        --accent-slot: #ce90ff;
    }
    .flyout[data-shop-tab="popular"] {
        --accent-slot: #6fd36f;
    }
    .flyout {
        border-top: 2px solid var(--accent-slot, var(--brass));
    }
    .title {
        color: var(--accent-slot, var(--foreground));
        font-family: var(--font-heading);
        font-size: 0.875rem;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
    }
    .row-heading {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        margin: 0.625rem 0 0.25rem;
        color: var(--muted-foreground);
        font-family: var(--font-heading);
        font-size: 0.6875rem;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
    }
    .souls {
        color: #7de6c5;
        font-variant-numeric: tabular-nums;
    }
    .tiles {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
        gap: 4px;
    }
</style>
