<script lang="ts">
    import { Search } from "@lucide/svelte";
    import EmptyState from "@deadlock-plus/ui/empty-state.svelte";
    import Input from "@deadlock-plus/ui/input.svelte";
    import * as Tabs from "@deadlock-plus/ui/tabs";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { formatNumber, t } from "$lib/core/i18n.svelte";
    import { SHOP_SLOTS, type ShopCatalog, type ShopItem, type ShopSlot } from "../../catalog";
    import { addCategory, addItems } from "../../editor/document";
    import { drag } from "../../editor/drag.svelte";
    import type { BuildEditor } from "../../editor/editor.svelte";
    import { inBuildCounts, nearestCard, pickerGroups, type ArrowKey } from "../../editor/picker";
    import { statLabelMatchers, type StatsById } from "../../stats";

    let {
        editor,
        catalog,
        statsById,
    }: {
        editor: BuildEditor;
        catalog: ShopCatalog;
        statsById: StatsById;
    } = $props();

    const SEARCH_ID = "build-editor-item-search";
    const ARROWS = new Set<string>(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

    let query = $state("");
    let slot = $state<ShopSlot>("weapon");
    let focused = $state(0);
    let list = $state<HTMLElement>();
    let failedArt = $state(new Set<string>());

    const matchers = $derived(statLabelMatchers(statsById));
    const groups = $derived(pickerGroups(catalog, slot, query, matchers));
    const searching = $derived(query.trim() !== "");
    const counts = $derived(inBuildCounts(editor.build));
    const cards = $derived(groups.flatMap((g) => g.rows.flatMap((r) => r.items)));
    const indexOf = $derived(new Map(cards.map((item, i) => [item.id, i])));

    $effect(() => {
        if (focused >= cards.length) focused = Math.max(0, cards.length - 1);
    });

    function add(id: number) {
        let build = editor.build;
        const count = build.modCategories.length;
        let target =
            editor.activeCategory !== null && editor.activeCategory < count ? editor.activeCategory : count - 1;
        if (target < 0) {
            build = addCategory(build, 0, "");
            target = 0;
        }
        editor.apply(addItems(build, target, build.modCategories[target]!.mods.length, [id]));
    }

    // A drag that ends back on its own card still fires click; this keeps it from also adding the item.
    let pressedAt: { id: number; x: number; y: number } | null = null;

    function pointerDown(event: PointerEvent, item: ShopItem) {
        if (event.button !== 0) return;
        pressedAt = { id: item.id, x: event.clientX, y: event.clientY };
        drag.begin({ kind: "new", abilityIds: [item.id] }, event, { art: item.art, label: item.name });
    }

    function click(event: MouseEvent, item: ShopItem) {
        const press = pressedAt;
        pressedAt = null;
        if (press?.id === item.id && event.detail > 0) {
            if (Math.hypot(event.clientX - press.x, event.clientY - press.y) >= 4) return;
        }
        focused = indexOf.get(item.id) ?? 0;
        add(item.id);
    }

    // The tooltip trigger's own handlers come in `props`; a plain handler after the spread would replace them.
    function chain<E extends Event>(theirs: unknown, mine: (event: E) => void) {
        return (event: E) => {
            if (typeof theirs === "function") theirs(event);
            mine(event);
        };
    }

    function cardElements(): HTMLElement[] {
        return [...(list?.querySelectorAll<HTMLElement>("[data-card]") ?? [])];
    }

    function focusCard(index: number) {
        focused = index;
        cardElements()[index]?.focus();
    }

    function cardKey(event: KeyboardEvent, index: number) {
        if (!ARROWS.has(event.key)) return;
        event.preventDefault();
        const rects = cardElements().map((el) => el.getBoundingClientRect());
        if (event.key === "ArrowUp" && rects[index] && rects.every((r) => r.y >= rects[index]!.y - 1)) {
            document.getElementById(SEARCH_ID)?.focus();
            return;
        }
        focusCard(nearestCard(rects, index, event.key as ArrowKey));
    }

    function searchKey(event: KeyboardEvent) {
        if (event.key === "Escape") {
            event.preventDefault();
            if (query !== "") query = "";
            else (event.currentTarget as HTMLElement).blur();
        } else if (event.key === "ArrowDown" && cards.length > 0) {
            event.preventDefault();
            focusCard(Math.min(focused, cards.length - 1));
        } else if (event.key === "Enter" && searching && cards.length > 0) {
            event.preventDefault();
            add(cards[0]!.id);
        }
    }

    function windowKey(event: KeyboardEvent) {
        if (event.key !== "/" || event.ctrlKey || event.altKey || event.metaKey) return;
        const target = event.target as HTMLElement | null;
        if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
        event.preventDefault();
        document.getElementById(SEARCH_ID)?.focus();
    }

    function statValue(value: number, unit: string | null): string {
        return `${value > 0 ? "+" : ""}${formatNumber(value)}${unit ?? ""}`;
    }

    const slotLabel = (s: ShopSlot) => t(`builds.editor.picker.slot_${s}`);
</script>

<svelte:window onkeydown={windowKey} />

<aside
    class="dock flex h-full w-[340px] shrink-0 flex-col border-l border-border bg-card"
    aria-label={t("builds.editor.picker.label")}
>
    <div class="flex flex-col gap-2 border-b border-border p-3">
        <div class="relative">
            <Search
                class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
            />
            <Input
                id={SEARCH_ID}
                bind:value={query}
                type="search"
                class="pl-8"
                placeholder={t("builds.editor.picker.search")}
                aria-label={t("builds.editor.picker.search_label")}
                aria-keyshortcuts="/"
                onkeydown={searchKey}
            />
        </div>
        <Tabs.Root value={slot} onValueChange={(v) => (slot = v as ShopSlot)}>
            <Tabs.List class="grid w-full grid-cols-3">
                {#each SHOP_SLOTS as s (s)}
                    <Tabs.Trigger
                        value={s}
                        class="slot-tab {searching ? 'searching' : ''}"
                        data-shop-slot={s}
                        onclick={() => (query = "")}
                    >
                        {slotLabel(s)}
                    </Tabs.Trigger>
                {/each}
            </Tabs.List>
        </Tabs.Root>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-3" bind:this={list}>
        {#if cards.length === 0}
            <EmptyState role="status" size="sm" tone="muted" spacing="lg">
                {searching
                    ? t("builds.editor.picker.no_results", { query: query.trim() })
                    : t("builds.editor.picker.empty")}
            </EmptyState>
        {:else}
            <Tooltip.Provider>
                {#each groups as group (group.slot)}
                    <section class="group" data-shop-slot={group.slot}>
                        {#if searching}
                            <h3 class="slot-heading">{slotLabel(group.slot)}</h3>
                        {/if}
                        {#each group.rows as row (row.tier)}
                            {#if row.items.length > 0}
                                {#if row.tier !== null}
                                    <div class="tier-heading">
                                        <span>{t("builds.editor.picker.tier", { tier: row.tier })}</span>
                                        {#if row.price !== null}
                                            <span class="souls">{formatNumber(row.price)}</span>
                                        {/if}
                                    </div>
                                {/if}
                                <div class="cards">
                                    {#each row.items as item (item.id)}
                                        {@const index = indexOf.get(item.id) ?? 0}
                                        {@const count = counts.get(item.id) ?? 0}
                                        {@const stats = statsById.get(item.id) ?? []}
                                        <Tooltip.Root delayDuration={350}>
                                            <Tooltip.Trigger>
                                                {#snippet child({ props })}
                                                    <button
                                                        {...props}
                                                        type="button"
                                                        class="card"
                                                        class:active={item.active}
                                                        data-card
                                                        data-shop-slot={item.slot}
                                                        data-tier={item.tier}
                                                        tabindex={index === focused ? 0 : -1}
                                                        aria-label={count > 0
                                                            ? t("builds.editor.picker.add_counted", {
                                                                  name: item.name,
                                                                  count,
                                                              })
                                                            : t("builds.editor.picker.add", { name: item.name })}
                                                        onpointerdown={chain(props.onpointerdown, (e: PointerEvent) =>
                                                            pointerDown(e, item),
                                                        )}
                                                        onclick={chain(props.onclick, (e: MouseEvent) =>
                                                            click(e, item),
                                                        )}
                                                        onkeydown={chain(props.onkeydown, (e: KeyboardEvent) =>
                                                            cardKey(e, index),
                                                        )}
                                                        onfocus={chain(props.onfocus, () => (focused = index))}
                                                    >
                                                        <span class="art">
                                                            {#if item.art && !failedArt.has(item.art)}
                                                                <img
                                                                    src={item.art}
                                                                    alt=""
                                                                    draggable="false"
                                                                    onerror={() =>
                                                                        (failedArt = new Set(failedArt).add(item.art!))}
                                                                />
                                                            {/if}
                                                            {#if item.imbue}
                                                                <span class="imbue">{t("builds.shop.imbue")}</span>
                                                            {/if}
                                                            {#if count > 0}
                                                                <span class="count"
                                                                    >{t("builds.editor.picker.count", { count })}</span
                                                                >
                                                            {/if}
                                                        </span>
                                                        <span class="name">{item.name}</span>
                                                        {#if searching}
                                                            <span class="cost">{formatNumber(item.cost)}</span>
                                                        {/if}
                                                    </button>
                                                {/snippet}
                                            </Tooltip.Trigger>
                                            <Tooltip.Content side="left" class="w-60">
                                                <div class="flex items-baseline justify-between gap-2">
                                                    <span class="font-heading text-sm font-semibold">{item.name}</span>
                                                    <span class="souls shrink-0">{formatNumber(item.cost)}</span>
                                                </div>
                                                <div class="text-muted-foreground">
                                                    {t("builds.editor.picker.tier_slot", {
                                                        tier: item.tier,
                                                        slot: slotLabel(item.slot),
                                                    })}{item.active ? ` · ${t("builds.editor.picker.active")}` : ""}
                                                </div>
                                                {#if stats.length > 0}
                                                    <ul class="mt-1.5 flex flex-col gap-0.5">
                                                        {#each stats as stat (stat.key)}
                                                            <li class="flex justify-between gap-3">
                                                                <span class="text-muted-foreground">{stat.label}</span>
                                                                <span class="tabular-nums"
                                                                    >{statValue(stat.value, stat.unit)}</span
                                                                >
                                                            </li>
                                                        {/each}
                                                    </ul>
                                                {/if}
                                                {#if count > 0}
                                                    <div class="mt-1.5 text-muted-foreground">
                                                        {t("builds.editor.picker.in_build", { count })}
                                                    </div>
                                                {/if}
                                            </Tooltip.Content>
                                        </Tooltip.Root>
                                    {/each}
                                </div>
                            {/if}
                        {/each}
                    </section>
                {/each}
            </Tooltip.Provider>
        {/if}
    </div>
</aside>

<style>
    .dock :global([data-shop-slot="weapon"]) {
        --bright: #ec9719;
        --dark: #302306;
    }
    .dock :global([data-shop-slot="vitality"]) {
        --bright: #7bba1d;
        --dark: #1f3400;
    }
    .dock :global([data-shop-slot="spirit"]) {
        --bright: #ce90ff;
        --dark: #362147;
    }

    .dock :global(.slot-tab[data-state="active"]:not(.searching)) {
        background: color-mix(in oklch, var(--bright) 22%, var(--background));
        color: var(--bright);
        box-shadow: inset 0 -2px 0 var(--bright);
    }
    .dock :global(.slot-tab:hover) {
        color: var(--bright);
    }

    .group + .group {
        margin-top: 0.75rem;
    }
    .slot-heading {
        margin-bottom: 0.375rem;
        color: var(--bright);
        font-family: var(--font-heading);
        font-size: 0.8125rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }
    .tier-heading {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        margin: 0.75rem 0 0.375rem;
        color: var(--muted-foreground);
        font-family: var(--font-heading);
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }
    .group > .tier-heading:first-child {
        margin-top: 0;
    }
    .souls {
        color: #7de6c5;
        font-variant-numeric: tabular-nums;
    }

    .cards {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 6px;
    }
    .card {
        --name-bg: var(--bright);
        --name-fg: #10130d;
        position: relative;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border-radius: 3px;
        background: var(--name-bg);
        box-shadow: 1px 1px 6px #0006;
        cursor: grab;
        touch-action: none;
        user-select: none;
        transition: translate 80ms ease-out;
    }
    .card:hover {
        translate: 0 -1px;
    }
    .card:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: 2px;
    }
    .card[data-tier="4"] {
        --name-bg: var(--dark);
        --name-fg: color-mix(in oklch, var(--bright) 45%, white);
        outline: 1px solid var(--bright);
        outline-offset: -1px;
    }
    .card.active {
        border-radius: 999px 999px 3px 3px;
    }
    .art {
        position: relative;
        display: flex;
        aspect-ratio: 1;
        align-items: center;
        justify-content: center;
        margin: 2px 2px 0;
        border-radius: inherit;
        background: radial-gradient(
            circle at 50% 40%,
            color-mix(in oklch, var(--bright) 30%, var(--dark)),
            var(--dark)
        );
    }
    .card[data-tier="4"] .art {
        background: radial-gradient(circle at 50% 40%, color-mix(in oklch, var(--bright) 18%, #000), #000);
    }
    .art img {
        width: 82%;
        height: 82%;
        object-fit: contain;
    }
    .card.active .art img {
        border-radius: 50%;
    }
    .imbue {
        position: absolute;
        bottom: 1px;
        left: 50%;
        translate: -50% 0;
        padding: 0 3px;
        border-radius: 2px;
        background: #000a;
        color: #e7c8ff;
        font-size: 8px;
        font-style: italic;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        white-space: nowrap;
    }
    .count {
        position: absolute;
        top: 2px;
        right: 2px;
        padding: 0 4px;
        border-radius: 999px;
        background: var(--brass, #c9a227);
        color: #10130d;
        font-size: 10px;
        font-weight: 700;
        line-height: 14px;
        font-variant-numeric: tabular-nums;
    }
    .name {
        display: -webkit-box;
        min-height: calc(2 * 1.05em + 6px);
        overflow: hidden;
        padding: 3px 3px;
        color: var(--name-fg);
        font-family: var(--font-heading);
        font-size: 11px;
        font-weight: 600;
        line-height: 1.05;
        text-align: center;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        line-clamp: 2;
    }
    .cost {
        padding-bottom: 2px;
        background: #0002;
        color: var(--name-fg);
        font-size: 10px;
        font-weight: 700;
        text-align: center;
        font-variant-numeric: tabular-nums;
    }
</style>
