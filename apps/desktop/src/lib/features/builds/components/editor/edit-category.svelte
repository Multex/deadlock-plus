<script lang="ts" module>
    let gestures = 0;
</script>

<script lang="ts">
    import type { Snippet } from "svelte";
    import type { Screen } from "@deadlock-plus/build-layout";
    import type { ModCategoryView } from "@deadlock-plus/ipc-types/ModCategoryView";
    import Badge from "@deadlock-plus/ui/badge.svelte";
    import Input from "@deadlock-plus/ui/input.svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { t, tn } from "$lib/core/i18n.svelte";
    import { updateCategory, type ItemRef } from "../../editor/document";
    import { drag } from "../../editor/drag.svelte";
    import type { BuildEditor } from "../../editor/editor.svelte";
    import { sizeTag, snapHeight, snapWidth } from "../../editor/resize";
    import type { ChipItem, ShopCategoryView, ShopView } from "../../shop-view";
    import ItemChip from "../shop/item-chip.svelte";
    import { chipShifts, itemCaret, slotBoxes, storedSize } from "./canvas/geometry";

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
        items,
        counts,
        rowWraps,
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
        items: (ChipItem | undefined)[];
        /** How often each ability sits in the build. */
        counts: ReadonlyMap<number, number>;
        /** This category's flow row wraps at another scale. */
        rowWraps: boolean;
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
    const selected = $derived(
        new Set(editor.selection.filter((ref) => ref.category === index).map((ref) => ref.index)),
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
            label: refs.length > 1 ? t("builds.editor.drag_items", { count: refs.length }) : name,
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
    } | null>(null);

    function resizeDown(edge: Edge, event: PointerEvent) {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        (event.currentTarget as Element).setPointerCapture(event.pointerId);
        activate();
        resizing = {
            edge,
            x: event.clientX,
            y: event.clientY,
            ...size,
            key: `resize:${index}:${++gestures}`,
            applied: false,
            pointer: { x: event.clientX, y: event.clientY },
        };
    }

    function resizeMove(event: PointerEvent) {
        if (!resizing) return;
        resizing.pointer = { x: event.clientX, y: event.clientY };
        const patch: { width?: number; height?: number } = {};
        if (resizing.edge !== "bottom") {
            patch.width = snapWidth(resizing.width + (event.clientX - resizing.x) / shop.unit, event.altKey);
        }
        if (resizing.edge !== "right") {
            patch.height = snapHeight(resizing.height + (event.clientY - resizing.y) / shop.unit, event.altKey);
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
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
    class="category"
    class:optional={category.optional}
    class:active
    class:dragged
    class:resizing={!!resizing}
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
    onclick={activate}
>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <header style:height="{shop.header}px" onpointerdown={headerDown}>
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
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <span class="name" class:unnamed={!category.name} ondblclick={startRename}>
                {category.name || t("builds.editor.unnamed")}
            </span>
        {/if}
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
        {#if category.optional}
            <Badge variant="outline" class="optional-pill">{t("builds.shop.optional")}</Badge>
        {/if}
        {#if categoryMenu}
            <span class="menu">{@render categoryMenu(index)}</span>
        {/if}
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
            <ItemChip item={items[i]} box={{ x: 0, y: 0, width: box.width, height: box.height }} scale={shop.unit} />
            {#if copies > 1}
                <span class="copies" title={t("builds.editor.copies_hint", { count: copies })}>
                    {t("builds.editor.copies", { count: copies })}
                </span>
            {/if}
        </div>
    {/each}

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

    {#if tag.overflow}
        <span class="overflow">{t("builds.editor.overflow")}</span>
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
        {#if tag.unsafe}<span>{t("builds.editor.unsafe_width")}</span>{/if}
        {#if rowWraps}<span>{t("builds.editor.row_wraps")}</span>{/if}
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
        display: flex;
        align-items: center;
        gap: calc(var(--u) * 6);
        overflow: hidden;
        padding: 0 calc(var(--u) * 4) 0 calc(var(--u) * 12);
        background: color-mix(in oklch, #10130d 70%, transparent);
        cursor: grab;
        user-select: none;
    }
    header:active {
        cursor: grabbing;
    }
    .category.active header {
        background: color-mix(in oklch, var(--brass) 14%, #10130d);
    }
    .name {
        min-width: 0;
        overflow: hidden;
        color: var(--foreground);
        font-size: calc(var(--u) * 16);
        font-weight: 700;
        text-overflow: ellipsis;
        white-space: nowrap;
        cursor: text;
    }
    .name.unnamed {
        color: var(--muted-foreground);
        font-style: italic;
        font-weight: 600;
    }
    header :global(.rename) {
        height: calc(var(--u) * 24);
        min-width: 0;
        flex: 1;
        padding: 0 calc(var(--u) * 6);
        font-size: calc(var(--u) * 15);
        font-weight: 700;
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
    header :global(.optional-pill) {
        padding: 0 calc(var(--u) * 4);
        border: 0;
        border-radius: 2px;
        background: #00000050;
        color: color-mix(in oklch, #85b5ff 90%, transparent);
        font-size: calc(var(--u) * 12);
        font-weight: 700;
        line-height: 1.4;
        text-transform: uppercase;
    }
    .menu {
        display: inline-flex;
        margin-left: auto;
        cursor: default;
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

    .item {
        position: absolute;
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
    .resize-label.warn {
        border-color: color-mix(in oklch, var(--warning) 70%, transparent);
    }
</style>
