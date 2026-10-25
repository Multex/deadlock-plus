<script lang="ts" module>
    let gestures = 0;
</script>

<script lang="ts">
    import { TriangleAlert } from "@lucide/svelte";
    import type { Snippet } from "svelte";
    import type { Screen } from "@deadlock-plus/build-layout";
    import { widthPx } from "@deadlock-plus/build-layout/layout";
    import type { GameItem } from "@deadlock-plus/game-ui/item";
    import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
    import Input from "@deadlock-plus/ui/input.svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { t, tn } from "$lib/core/i18n.svelte";
    import { updateCategory, type ItemRef } from "../../editor/document";
    import { drag } from "../../editor/drag.svelte";
    import type { BuildEditor } from "../../editor/editor.svelte";
    import type { LayoutIssueKind } from "../../editor/repair";
    import { BREAK_THROUGH_PX, dragStop, edgeWidth, sizeTag, snapHeight, type RowEdge } from "../../editor/resize";
    import { rowLimit, rowOf } from "../../editor/row-ops";
    import type { ShopCategoryView, ShopView } from "../../shop-view";
    import CategoryTitle from "../shop/category-title.svelte";
    import ItemChip from "../shop/item-chip.svelte";
    import { chipShifts, itemCaret, slotBoxes, storedSize } from "./canvas/geometry";
    import { freeResize } from "./canvas/snap";

    type Edge = "right" | "bottom" | "corner";
    const EDGES: { edge: Edge; label: string }[] = [
        { edge: "right", label: "builds.editor.resize_width" },
        { edge: "bottom", label: "builds.editor.resize_height" },
        { edge: "corner", label: "builds.editor.resize_both" },
    ];

    let {
        editor,
        index,
        category,
        view,
        shop,
        screen,
        snap = true,
        items,
        counts,
        rowWraps,
        issues = [],
        dropIndex,
        dragged,
        renaming,
        onRenameStart,
        onRenameEnd,
        onItemMenu,
        onItemFocus,
        categoryMenu,
    }: {
        editor: BuildEditor;
        index: number;
        category: ModCategoryView;
        view: ShopCategoryView;
        shop: ShopView;
        screen: Screen;
        /** Resizes snap to safe sizes; Alt flips it for one drag. */
        snap?: boolean;
        items: (GameItem | undefined)[];
        /** How often each ability sits in the build. */
        counts: ReadonlyMap<number, number>;
        /** This category's flow row wraps at another scale. */
        rowWraps: boolean;
        /** What lays this category out differently at 1080p, 1440p or 4K. */
        issues?: readonly LayoutIssueKind[];
        /** Where a hovering item drop would insert. */
        dropIndex: number | null;
        /** This category is being dragged to a new place. */
        dragged: boolean;
        renaming: boolean;
        onRenameStart: () => void;
        onRenameEnd: () => void;
        onItemMenu: (ref: ItemRef, at: { x: number; y: number }) => void;
        onItemFocus: (ref: ItemRef) => void;
        categoryMenu?: Snippet<[number]>;
    } = $props();

    const size = $derived(storedSize(category, view, shop.unit));
    const tag = $derived(sizeTag(size.width, size.height, category.mods.length, screen));
    const capacity = $derived(tag.columns * tag.rows);
    const slots = $derived(
        slotBoxes(shop, view, Math.max(capacity, category.mods.length, (dropIndex ?? -1) + 1), screen),
    );
    const caret = $derived(dropIndex === null ? null : itemCaret(slots, dropIndex, shop, screen));
    const shifts = $derived(chipShifts(view.chips, dropIndex, Math.max(3, 6 * shop.unit)));
    const active = $derived(editor.activeCategory === index);
    const warn = $derived(tag.unsafe || rowWraps);
    // Below three columns the header controls have room for the menu only.
    const narrow = $derived(tag.columns < 3);
    const selected = $derived(
        new Set(editor.selection.filter((ref) => ref.category === index).map((ref) => ref.index)),
    );
    // The game clips the chips at the category's inner edge, under the bottom border.
    const innerHeight = $derived(view.box.height - 2 * shop.border);
    const hidden = $derived(
        view.chips.filter((chip) => chip.y - view.box.y - shop.border + chip.height > innerHeight + 0.5).length,
    );

    function local(box: { x: number; y: number; width: number; height: number }) {
        return {
            x: box.x - view.box.x - shop.border,
            y: box.y - view.box.y - shop.border,
            width: box.width,
            height: box.height,
        };
    }

    function interactive(target: EventTarget | null): boolean {
        return target instanceof Element && !!target.closest("input, button, [role='menuitem'], [data-handle]");
    }

    function ref(i: number): ItemRef {
        return { category: index, index: i };
    }

    function itemDown(i: number, event: PointerEvent) {
        if (event.button !== 0) return;
        const refs = selected.has(i) ? [...editor.selection] : [ref(i)];
        const item = items[i];
        const name = item?.name ?? t("builds.shop.removed_item");
        drag.begin({ kind: "items", refs }, event, {
            art: item?.art,
            label: refs.length > 1 ? tn("builds.editor.drag_items", refs.length) : name,
        });
    }

    function itemClick(i: number, event: MouseEvent) {
        event.stopPropagation();
        const mode = event.shiftKey ? "range" : event.ctrlKey || event.metaKey ? "toggle" : "replace";
        editor.select([ref(i)], mode);
        onItemFocus(ref(i));
    }

    function itemMenu(i: number, event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();
        if (!selected.has(i)) editor.select([ref(i)], "replace");
        onItemFocus(ref(i));
        onItemMenu(ref(i), { x: event.clientX, y: event.clientY });
    }

    function activate() {
        if (editor.selection.length > 0) editor.select([], "replace");
        editor.activeCategory = index;
    }

    function headerDown(event: PointerEvent) {
        if (renaming || interactive(event.target)) return;
        drag.begin({ kind: "category", index }, event, { label: category.name || t("builds.editor.unnamed") });
    }

    let draft = $state("");

    function startRename() {
        onRenameStart();
    }

    $effect(() => {
        if (renaming) draft = category.name;
    });

    function commitRename() {
        if (!renaming) return;
        const name = draft.trim();
        if (name !== category.name) editor.apply(updateCategory(editor.build, index, { name }));
        onRenameEnd();
    }

    function renameKey(event: KeyboardEvent) {
        event.stopPropagation();
        if (event.key === "Enter") {
            event.preventDefault();
            commitRename();
        } else if (event.key === "Escape") {
            event.preventDefault();
            onRenameEnd();
        }
    }

    function focusInput(node: HTMLInputElement) {
        node.focus();
        node.select();
    }

    let resizing = $state<{
        edge: Edge;
        x: number;
        y: number;
        width: number;
        height: number;
        key: string;
        applied: boolean;
        pointer: { x: number; y: number };
        /** The widest width that keeps the flow row, or null when there is no row edge to hold. */
        stop: number | null;
        /** The dragged category is the last on its row, so it is the one a break-through moves. */
        last: boolean;
        row: RowEdge;
        /** Screen px the pointer is past the stop. */
        pull: number;
    } | null>(null);

    function resizeDown(edge: Edge, event: PointerEvent) {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        (event.currentTarget as Element).setPointerCapture(event.pointerId);
        activate();
        const row = rowOf(editor.build, index, screen);
        resizing = {
            edge,
            x: event.clientX,
            y: event.clientY,
            ...size,
            key: `resize:${index}:${++gestures}`,
            applied: false,
            pointer: { x: event.clientX, y: event.clientY },
            stop: edge === "bottom" ? null : dragStop(rowLimit(editor.build, index, screen), size.width),
            last: row.at(-1) === index,
            row: "inside",
            pull: 0,
        };
    }

    function resizeMove(event: PointerEvent) {
        if (!resizing) return;
        resizing.pointer = { x: event.clientX, y: event.clientY };
        const patch: { width?: number; height?: number } = {};
        const free = freeResize(snap, event.altKey);
        if (resizing.edge !== "bottom") {
            const raw = resizing.width + (event.clientX - resizing.x) / shop.unit;
            const next = edgeWidth(raw, free, resizing.stop, shop.unit);
            patch.width = next.width;
            resizing.row = next.edge;
            resizing.pull = resizing.stop === null ? 0 : Math.max(0, (raw - resizing.stop) * shop.unit);
        }
        if (resizing.edge !== "right") {
            patch.height = snapHeight(resizing.height + (event.clientY - resizing.y) / shop.unit, free);
        }
        const current = editor.build.modCategories[index];
        if (!current) return;
        const changed =
            (patch.width !== undefined && patch.width !== current.width) ||
            (patch.height !== undefined && patch.height !== current.height);
        if (!changed) return;
        editor.apply(updateCategory(editor.build, index, patch), resizing.key);
        resizing.applied = true;
    }

    function resizeEnd() {
        resizing = null;
    }

    $effect(() => {
        if (!resizing) return;
        const escape = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || !resizing) return;
            event.preventDefault();
            event.stopPropagation();
            // The whole gesture is one undo step, so undoing it restores the size from before the drag.
            if (resizing.applied) editor.undo();
            resizing = null;
        };
        window.addEventListener("keydown", escape, true);
        return () => window.removeEventListener("keydown", escape, true);
    });

    // The top layer keeps the label above the canvas's scroll clipping and any popover.
    function topLayer(node: HTMLElement) {
        node.showPopover?.();
        return () => {
            if (node.isConnected) node.hidePopover?.();
        };
    }

    const LABEL_ROOM = 260;

    const strain = $derived(resizing ? Math.min(1, resizing.pull / BREAK_THROUGH_PX) : 0);
    const edgeAt = $derived(
        resizing?.stop != null && resizing.row !== "through"
            ? widthPx(resizing.stop, screen.height) * shop.scale - shop.border
            : null,
    );
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
    class="category"
    class:optional={category.optional}
    class:active
    class:dragged
    class:resizing={!!resizing}
    class:narrow
    class:straining={resizing?.row === "pulling"}
    class:warn={warn && !!resizing}
    class:target={dropIndex !== null}
    role="listbox"
    aria-multiselectable="true"
    aria-label={category.name || t("builds.editor.unnamed")}
    tabindex="-1"
    data-category={index}
    style:left="{view.box.x}px"
    style:top="{view.box.y}px"
    style:width="{view.box.width}px"
    style:height="{view.box.height}px"
    style:--u="{shop.unit}px"
    style:--edge="{shop.border}px"
    style:--strain={strain}
    onclick={activate}
>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <header class:renaming style:height="{view.header}px" onpointerdown={headerDown}>
        {#if renaming}
            <Input
                class="rename"
                bind:value={draft}
                aria-label={t("builds.editor.rename")}
                maxlength={64}
                onkeydown={renameKey}
                onblur={commitRename}
                {@attach focusInput}
            />
        {:else}
            <CategoryTitle
                {category}
                label={category.name || t("builds.editor.unnamed")}
                unnamed={!category.name}
                unit={shop.unit}
                ondblclick={startRename}
            />
        {/if}
        <!-- Over the name's first line like the game's edit controls, so the name keeps the game's width to wrap in. -->
        <span class="controls" style:height="{shop.header}px">
            {#if !narrow || resizing}
                <Tooltip.Root delayDuration={200}>
                    <Tooltip.Trigger class="size-tag {warn ? 'warn' : ''} {resizing ? 'live' : ''}">
                        {t("builds.editor.size_tag", { columns: tag.columns, rows: tag.rows })}
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                        {#if tag.unsafe}
                            {t("builds.editor.unsafe_width")}
                        {:else if rowWraps}
                            {t("builds.editor.row_wraps")}
                        {:else}
                            {t("builds.editor.size_hint")}
                        {/if}
                    </Tooltip.Content>
                </Tooltip.Root>
            {/if}
            {#if issues.length > 0}
                <Tooltip.Root delayDuration={200}>
                    <Tooltip.Trigger
                        class="layout-marker"
                        aria-label={t("builds.editor.layout.marker")}
                        data-testid="category-layout-issue"
                    >
                        <TriangleAlert aria-hidden="true" />
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                        {#each issues as kind (kind)}
                            <p>{t(`builds.editor.layout.kind_${kind}`)}</p>
                        {/each}
                    </Tooltip.Content>
                </Tooltip.Root>
            {/if}
            {#if categoryMenu}
                <span class="menu">{@render categoryMenu(index)}</span>
            {/if}
        </span>
    </header>

    {#each slots.slice(category.mods.length, capacity) as slot, i (i)}
        {@const box = local(slot)}
        <div
            class="placeholder"
            aria-hidden="true"
            style:left="{box.x}px"
            style:top="{box.y}px"
            style:width="{box.width}px"
            style:height="{box.height}px"
        ></div>
    {/each}

    {#if dropIndex !== null && dropIndex >= category.mods.length && slots[dropIndex]}
        {@const box = local(slots[dropIndex])}
        <div
            class="drop-slot"
            aria-hidden="true"
            style:left="{box.x}px"
            style:top="{box.y}px"
            style:width="{box.width}px"
            style:height="{box.height}px"
        ></div>
    {/if}

    <div class="chips" style:height="{Math.max(0, innerHeight)}px">
        {#each view.chips as chip, i (i)}
            {@const box = local(chip)}
            {@const mod = category.mods[i]}
            {@const copies = mod ? (counts.get(mod.abilityId) ?? 0) : 0}
            <!-- Arrow keys, Delete and Escape for the chips live on the canvas, which holds the focus. -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
                class="item"
                class:selected={selected.has(i)}
                class:past={i >= capacity}
                role="option"
                aria-selected={selected.has(i)}
                tabindex="-1"
                data-item={i}
                style:left="{box.x}px"
                style:top="{box.y}px"
                style:width="{box.width}px"
                style:height="{box.height}px"
                style:transform={shifts[i] ? `translateX(${shifts[i]}px)` : undefined}
                onpointerdown={(event) => itemDown(i, event)}
                onclick={(event) => itemClick(i, event)}
                oncontextmenu={(event) => itemMenu(i, event)}
            >
                <ItemChip item={items[i]} box={{ x: 0, y: 0 }} scale={shop.unit} />
                {#if copies > 1}
                    <span class="copies" title={tn("builds.editor.copies_hint", copies)}>
                        {t("builds.editor.copies", { count: copies })}
                    </span>
                {/if}
            </div>
        {/each}
    </div>

    {#if hidden > 0}
        <div class="clipped" data-testid="hidden-items" data-count={hidden}>
            <span>{tn("builds.editor.hidden_items", hidden)}</span>
        </div>
    {/if}

    {#if caret && dropIndex !== null && dropIndex < category.mods.length}
        {@const at = local({ ...caret, width: 0 })}
        <div
            class="caret"
            aria-hidden="true"
            style:left="{at.x}px"
            style:top="{at.y}px"
            style:height="{at.height}px"
        ></div>
    {/if}

    {#if tag.overflow && hidden === 0}
        <span class="overflow">{t("builds.editor.overflow")}</span>
    {/if}

    {#if edgeAt !== null && resizing}
        <div class="row-edge" class:pulling={resizing.row === "pulling"} aria-hidden="true" style:left="{edgeAt}px">
            <span>{t("builds.editor.row_edge")}</span>
        </div>
    {/if}

    {#each EDGES as { edge, label } (edge)}
        <div
            class="handle {edge}"
            data-handle
            role="separator"
            aria-orientation={edge === "bottom" ? "horizontal" : "vertical"}
            aria-label={t(label)}
            onpointerdown={(event) => resizeDown(edge, event)}
            onpointermove={resizeMove}
            onpointerup={resizeEnd}
            onpointercancel={resizeEnd}
            onlostpointercapture={resizeEnd}
        >
            {#if edge === "corner"}
                <svg viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M11 1 1 11M11 5 5 11M11 9 9 11" />
                </svg>
            {/if}
        </div>
    {/each}
</div>

{#if resizing}
    {@const flip = resizing.pointer.x > window.innerWidth - LABEL_ROOM}
    <div
        class="resize-label"
        class:warn
        data-row-edge={resizing.row}
        popover="manual"
        aria-live="polite"
        style:left="{resizing.pointer.x}px"
        style:top="{resizing.pointer.y}px"
        style:translate={flip ? "calc(-100% - 18px) 18px" : "18px 18px"}
        {@attach topLayer}
    >
        <strong>
            {t("builds.editor.resize_label", {
                columns: tn("builds.editor.columns_count", tag.columns),
                rows: tn("builds.editor.rows_count", tag.rows),
            })}
        </strong>
        {#if resizing.row === "pulling"}
            <span class="edge-note">
                {t(resizing.last ? "builds.editor.row_edge_pull" : "builds.editor.row_edge_pull_next")}
            </span>
        {:else if resizing.row === "through"}
            <span class="edge-note">
                {t(resizing.last ? "builds.editor.row_edge_release" : "builds.editor.row_edge_release_next")}
            </span>
        {/if}
        {#if tag.unsafe}<span>{t("builds.editor.unsafe_width")}</span>{/if}
        {#if rowWraps && resizing.row !== "through"}<span>{t("builds.editor.row_wraps")}</span>{/if}
        {#if tag.overflow}<span>{t("builds.editor.overflow")}</span>{/if}
    </div>
{/if}

<style>
    /* Dashed frames as the game's edit mode; the width stays the shop's border so the chips keep their places. */
    .category {
        position: absolute;
        box-sizing: border-box;
        border: max(1px, var(--edge)) dashed color-mix(in oklch, var(--muted-foreground) 55%, transparent);
        background: color-mix(in oklch, var(--card) 70%, transparent);
        outline: none;
        transition:
            opacity 120ms,
            border-color 120ms,
            box-shadow 120ms;
    }
    .category:hover {
        border-color: color-mix(in oklch, var(--foreground) 70%, transparent);
    }
    .category.optional {
        background: color-mix(in oklch, #365b92 28%, var(--card));
    }
    .category.active {
        border-style: solid;
        border-color: var(--brass);
        box-shadow:
            0 0 0 1px color-mix(in oklch, var(--brass) 35%, transparent),
            0 0 14px color-mix(in oklch, var(--brass) 28%, transparent);
    }
    .category.target {
        border-style: solid;
        border-color: var(--brass);
        box-shadow: 0 0 0 1px color-mix(in oklch, var(--brass) 40%, transparent);
    }
    .category.resizing {
        border-style: solid;
        border-color: var(--brass);
    }
    .category.warn {
        border-color: var(--warning);
        background: color-mix(in oklch, var(--warning) 10%, var(--card));
        box-shadow: 0 0 14px color-mix(in oklch, var(--warning) 28%, transparent);
    }
    .category.dragged {
        border-style: dashed;
        border-color: var(--brass);
        box-shadow: none;
        opacity: 0.35;
    }

    header {
        position: relative;
        display: flex;
        align-items: flex-start;
        background: color-mix(in oklch, #10130d 70%, transparent);
        cursor: grab;
        user-select: none;
        --header-bg: color-mix(in oklch, #10130d 82%, var(--card));
    }
    header:active {
        cursor: grabbing;
    }
    .category.active header {
        background: color-mix(in oklch, var(--brass) 14%, #10130d);
        --header-bg: color-mix(in oklch, var(--brass) 14%, #10130d);
    }
    header :global(.name) {
        cursor: text;
    }
    header :global(.rename) {
        height: calc(var(--u) * 24);
        min-width: 0;
        flex: 1;
        margin: calc(var(--u) * 3.375) 0 0 calc(var(--u) * 6);
        padding: 0 calc(var(--u) * 6);
        font-size: calc(var(--u) * 15);
        font-weight: 700;
    }
    .controls {
        position: absolute;
        top: 0;
        right: 0;
        display: flex;
        align-items: center;
        gap: calc(var(--u) * 6);
        padding: 0 calc(var(--u) * 4) 0 calc(var(--u) * 10);
        background: linear-gradient(to right, transparent, var(--header-bg) calc(var(--u) * 8));
        cursor: default;
    }
    header.renaming .controls {
        position: static;
        flex-shrink: 0;
        background: none;
    }
    header :global(.size-tag) {
        flex-shrink: 0;
        padding: 0 calc(var(--u) * 5);
        border: 0;
        border-radius: 2px;
        background: #00000050;
        color: var(--muted-foreground);
        font: inherit;
        font-size: calc(var(--u) * 12);
        font-variant-numeric: tabular-nums;
        font-weight: 700;
        line-height: 1.5;
        white-space: nowrap;
        cursor: help;
    }
    header :global(.size-tag.live) {
        color: var(--brass);
    }
    header :global(.size-tag.warn) {
        background: color-mix(in oklch, var(--warning) 22%, transparent);
        color: var(--warning);
    }
    header :global(.layout-marker) {
        display: inline-grid;
        flex-shrink: 0;
        place-items: center;
        width: calc(var(--u) * 20);
        height: calc(var(--u) * 18);
        padding: 0;
        border: 0;
        border-radius: 2px;
        background: color-mix(in oklch, var(--warning) 22%, transparent);
        color: var(--warning);
        cursor: help;
    }
    header :global(.layout-marker svg) {
        width: calc(var(--u) * 12);
        height: calc(var(--u) * 12);
    }
    .category.narrow .controls {
        gap: calc(var(--u) * 3);
        padding-left: calc(var(--u) * 6);
    }
    .category.narrow .menu :global(button) {
        width: calc(var(--u) * 20);
        height: calc(var(--u) * 20);
    }
    .menu {
        display: inline-flex;
    }

    .placeholder,
    .drop-slot {
        position: absolute;
        box-sizing: border-box;
        border: 1px dashed color-mix(in oklch, var(--muted-foreground) 30%, transparent);
        border-radius: calc(var(--u) * 2);
        pointer-events: none;
    }
    .drop-slot {
        border: 2px dashed var(--brass);
        background: color-mix(in oklch, var(--brass) 12%, transparent);
    }

    /* Clips only downward, so selection outlines and drop shifts still show past the sides. */
    .chips {
        position: absolute;
        top: 0;
        right: 0;
        left: 0;
        overflow: visible clip;
        pointer-events: none;
    }
    .clipped {
        position: absolute;
        z-index: 1;
        right: 0;
        bottom: 0;
        left: 0;
        display: flex;
        height: calc(var(--u) * 34);
        align-items: flex-end;
        justify-content: center;
        padding-bottom: calc(var(--u) * 4);
        background: linear-gradient(to top, color-mix(in oklch, var(--warning) 24%, transparent), transparent);
        pointer-events: none;
    }
    .clipped span {
        padding: 0 calc(var(--u) * 5);
        border-radius: 2px;
        background: color-mix(in oklch, var(--warning) 22%, #000);
        color: var(--warning);
        font-size: calc(var(--u) * 11);
        font-weight: 700;
        line-height: 1.5;
    }

    .item {
        position: absolute;
        pointer-events: auto;
        border-radius: calc(var(--u) * 2);
        outline: none;
        cursor: grab;
        transition: transform 120ms ease-out;
    }
    .item.selected {
        outline: 2px solid var(--brass);
        outline-offset: 1px;
    }
    .item.past {
        outline: 1px dashed var(--warning);
        outline-offset: 1px;
    }
    .item.selected.past {
        outline-style: solid;
    }
    .copies {
        position: absolute;
        top: calc(var(--u) * 3);
        left: calc(var(--u) * 3);
        padding: 0 calc(var(--u) * 4);
        border-radius: calc(var(--u) * 6);
        background: #000c;
        color: var(--brass);
        font-size: calc(var(--u) * 10);
        font-weight: 700;
        line-height: 1.4;
        pointer-events: none;
    }

    .caret {
        position: absolute;
        z-index: 1;
        width: 4px;
        margin-left: -2px;
        border-radius: 2px;
        background: var(--brass);
        box-shadow: 0 0 8px var(--brass);
        pointer-events: none;
    }
    .caret::before,
    .caret::after {
        position: absolute;
        left: 50%;
        width: 12px;
        height: 4px;
        border-radius: 2px;
        background: var(--brass);
        content: "";
        translate: -50% 0;
    }
    .caret::before {
        top: 0;
    }
    .caret::after {
        bottom: 0;
    }

    .overflow {
        position: absolute;
        right: calc(var(--u) * 4);
        bottom: calc(var(--u) * 4);
        padding: 0 calc(var(--u) * 5);
        border-radius: 2px;
        background: color-mix(in oklch, var(--warning) 22%, #000);
        color: var(--warning);
        font-size: calc(var(--u) * 11);
        font-weight: 700;
        line-height: 1.5;
        pointer-events: none;
    }

    .handle {
        position: absolute;
        z-index: 2;
        touch-action: none;
    }
    .handle.right {
        top: 0;
        right: -5px;
        bottom: 14px;
        width: 10px;
        cursor: ew-resize;
    }
    .handle.bottom {
        right: 14px;
        bottom: -5px;
        left: 0;
        height: 10px;
        cursor: ns-resize;
    }
    .handle.right::after,
    .handle.bottom::after {
        position: absolute;
        border-radius: 2px;
        background: var(--brass);
        box-shadow: 0 0 6px color-mix(in oklch, var(--brass) 60%, transparent);
        content: "";
        opacity: 0;
        transition: opacity 120ms;
    }
    .handle.right::after {
        top: 50%;
        left: 3.5px;
        width: 3px;
        height: min(40px, 50%);
        translate: 0 -50%;
    }
    .handle.bottom::after {
        top: 3.5px;
        left: 50%;
        width: min(40px, 50%);
        height: 3px;
        translate: -50% 0;
    }
    .category:hover .handle::after,
    .category.resizing .handle::after {
        opacity: 0.55;
    }
    .category .handle:hover::after,
    .category.resizing .handle::after {
        opacity: 1;
    }
    .handle.corner {
        right: -3px;
        bottom: -3px;
        display: grid;
        width: 18px;
        height: 18px;
        place-items: center;
        cursor: nwse-resize;
    }
    .handle.corner svg {
        width: 12px;
        height: 12px;
        fill: none;
        stroke: color-mix(in oklch, var(--muted-foreground) 80%, transparent);
        stroke-linecap: round;
        stroke-width: 1.5;
        transition: stroke 120ms;
    }
    .category.active .handle.corner svg,
    .handle.corner:hover svg,
    .category.resizing .handle.corner svg {
        stroke: var(--brass);
    }

    /* Sits on the outer right edge the category would have at its row limit. */
    .row-edge {
        position: absolute;
        z-index: 3;
        top: -10px;
        bottom: -10px;
        width: 2px;
        margin-left: -1px;
        border-radius: 1px;
        background: var(--brass);
        box-shadow: 0 0 8px color-mix(in oklch, var(--brass) 70%, transparent);
        pointer-events: none;
    }
    /* Above the category so it never covers the header, and on the category's side of the line:
       past the line the canvas would scroll sideways. The line starts 10px above the padding box. */
    .row-edge span {
        position: absolute;
        top: calc(8px - max(1px, var(--edge)));
        right: 100%;
        translate: 0 -100%;
        padding: 1px 6px;
        border-radius: 3px;
        background: var(--brass);
        color: #10130d;
        font-size: 11px;
        font-weight: 700;
        line-height: 1.4;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        white-space: nowrap;
    }
    .row-edge.pulling {
        width: calc(2px + 2px * var(--strain));
        margin-left: calc(-1px - 1px * var(--strain));
        box-shadow: 0 0 calc(8px + 10px * var(--strain)) color-mix(in oklch, var(--brass) 80%, transparent);
    }
    /* The resistance: the edge bar stretches toward the category's full height as the pull nears the break. */
    .category.straining .handle.right::after {
        left: calc(3.5px - 1.5px * var(--strain));
        width: calc(3px + 3px * var(--strain));
        height: calc(min(40px, 50%) + (100% - min(40px, 50%)) * var(--strain));
        background: color-mix(in oklch, var(--foreground) calc(70% * var(--strain)), var(--brass));
        box-shadow: 0 0 calc(6px + 10px * var(--strain)) var(--brass);
        opacity: 1;
        transition: none;
    }
    .category.straining .handle.corner svg {
        stroke: var(--brass);
    }

    .resize-label {
        position: fixed;
        inset: auto;
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin: 0;
        padding: 6px 10px;
        border: 1px solid color-mix(in oklch, var(--brass) 60%, transparent);
        border-radius: 6px;
        background: color-mix(in oklch, var(--popover) 94%, transparent);
        box-shadow: 0 8px 24px #000a;
        color: var(--popover-foreground);
        font-size: 12px;
        line-height: 1.35;
        pointer-events: none;
        user-select: none;
    }
    .resize-label strong {
        color: var(--brass);
        font-size: 15px;
        font-variant-numeric: tabular-nums;
        font-weight: 700;
        white-space: nowrap;
    }
    .resize-label span {
        max-width: 240px;
        color: var(--warning);
        font-weight: 600;
    }
    .resize-label .edge-note {
        color: var(--foreground);
    }
    .resize-label.warn {
        border-color: color-mix(in oklch, var(--warning) 70%, transparent);
    }
</style>
