<script lang="ts">
    import { Plus } from "@lucide/svelte";
    import type { Snippet } from "svelte";
    import type { Screen } from "@deadlock-plus/build-layout";
    import Button from "@deadlock-plus/ui/button.svelte";
    import * as Tooltip from "@deadlock-plus/ui/tooltip";
    import { t } from "$lib/core/i18n.svelte";
    import {
        addCategory,
        addItems,
        moveCategory,
        moveItems,
        occurrences,
        removeItems,
        type ItemRef,
    } from "../../editor/document";
    import { drag, type DragState } from "../../editor/drag.svelte";
    import type { BuildEditor } from "../../editor/editor.svelte";
    import type { ChipItem } from "../../shop-view";
    import { canvasView, categoryBar, dropTarget, rowWarnings, storedSize, type DropTarget } from "./canvas/geometry";
    import DragPreview from "./drag-preview.svelte";
    import EditCategory from "./edit-category.svelte";

    let {
        editor,
        resolve,
        screen = { width: 2560, height: 1440 },
        categoryMenu,
        itemMenu,
        renaming = $bindable(null),
    }: {
        editor: BuildEditor;
        resolve: (abilityId: number) => ChipItem | undefined;
        screen?: Screen;
        /** The category's `...` menu, trigger included. */
        categoryMenu?: Snippet<[number]>;
        /** The right-click menu: rendered after a right-click, to open at `at` (client px) with no trigger of its own. */
        itemMenu?: Snippet<[ItemRef, { x: number; y: number }]>;
        /** The category whose name is being edited inline; set it to start a rename. */
        renaming?: number | null;
    } = $props();

    let root = $state<HTMLDivElement>();
    let content = $state<HTMLDivElement>();
    let available = $state(0);
    let focus = $state<ItemRef | null>(null);
    let menu = $state<{ ref: ItemRef; at: { x: number; y: number }; id: number } | null>(null);
    let menus = 0;

    const build = $derived(editor.build);
    const layout = $derived(canvasView(build.modCategories, screen, available));
    const view = $derived(layout.view);
    const items = $derived(build.modCategories.map((category) => category.mods.map((mod) => resolve(mod.abilityId))));
    const counts = $derived(occurrences(build));
    const wraps = $derived(
        rowWarnings(
            view,
            build.modCategories.map((category, i) => storedSize(category, view.categories[i]!, view.unit).width),
        ),
    );

    function canvasPoint(state: DragState): { x: number; y: number } | null {
        if (!content) return null;
        const rect = content.getBoundingClientRect();
        const slack = 24;
        if (
            state.x < rect.left - slack ||
            state.x > rect.right + slack ||
            state.y < rect.top - slack ||
            state.y > rect.bottom + slack
        )
            return null;
        return { x: state.x - rect.left, y: state.y - rect.top };
    }

    function targetFor(state: DragState): DropTarget | null {
        const point = canvasPoint(state);
        if (!point) return null;
        return dropTarget(view, layout.tile, state.payload.kind === "category" ? "category" : "items", point);
    }

    const hover = $derived(drag.current ? targetFor(drag.current) : null);
    const empty = $derived(build.modCategories.length === 0);
    const draggingItems = $derived(!!drag.current && drag.current.payload.kind !== "category");
    const bar = $derived(hover?.kind === "category" ? categoryBar(view, hover.index, screen) : null);

    function sameItems(refs: readonly ItemRef[], to: ItemRef): boolean {
        if (refs.length !== 1) return false;
        const [only] = refs;
        return only!.category === to.category && (to.index === only!.index || to.index === only!.index + 1);
    }

    function drop(state: DragState): boolean {
        const target = targetFor(state);
        if (!target) return false;
        const { payload } = state;
        if (payload.kind === "category") {
            if (target.kind !== "category") return false;
            const from = payload.index;
            if (target.index !== from && target.index !== from + 1) {
                editor.apply(moveCategory(editor.build, from, target.index));
                editor.activeCategory = target.index > from ? target.index - 1 : target.index;
            }
            return true;
        }
        if (target.kind === "category") return false;
        let next = editor.build;
        let to: ItemRef;
        if (target.kind === "new-category") {
            to = { category: next.modCategories.length, index: 0 };
            next = addCategory(next, to.category, t("builds.editor.new_category"));
        } else {
            to = { category: target.category, index: target.index };
        }
        if (payload.kind === "new") {
            const at = Math.min(to.index, next.modCategories[to.category]!.mods.length);
            editor.apply(addItems(next, to.category, at, payload.abilityIds));
            editor.select(
                payload.abilityIds.map((_, k) => ({ category: to.category, index: at + k })),
                "replace",
            );
        } else {
            if (!state.copy && target.kind === "items" && sameItems(payload.refs, to)) return true;
            editor.apply(moveItems(next, payload.refs, to, state.copy));
        }
        if (target.kind === "new-category") renaming = to.category;
        root?.focus({ preventScroll: true });
        return true;
    }

    $effect(() => drag.onDrop(drop));

    function addFirst() {
        const index = editor.build.modCategories.length;
        editor.apply(addCategory(editor.build, index, t("builds.editor.new_category")));
        editor.select([], "replace");
        editor.activeCategory = index;
        renaming = index;
    }

    function openItemMenu(ref: ItemRef, at: { x: number; y: number }) {
        if (!itemMenu) return;
        menu = { ref, at, id: ++menus };
    }

    function moveFocus(step: { x: number; y: number }, extend: boolean) {
        const from = focus ?? editor.selection.at(-1);
        if (!from) return;
        const category = view.categories[from.category];
        const count = build.modCategories[from.category]?.mods.length ?? 0;
        if (!category || count === 0) return;
        const index = Math.min(count - 1, Math.max(0, from.index + step.x + step.y * category.columns));
        const ref = { category: from.category, index };
        editor.select([ref], extend ? "range" : "replace");
        focus = ref;
    }

    const ARROWS: Record<string, { x: number; y: number }> = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
    };

    function keydown(event: KeyboardEvent) {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
        const ctrl = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();
        if (ctrl && key === "z") {
            event.preventDefault();
            if (event.shiftKey) editor.redo();
            else editor.undo();
        } else if (ctrl && key === "y") {
            event.preventDefault();
            editor.redo();
        } else if (event.key === "Delete" || event.key === "Backspace") {
            if (editor.selection.length === 0) return;
            event.preventDefault();
            editor.apply(removeItems(editor.build, editor.selection));
            focus = null;
        } else if (event.key === "Escape") {
            if (drag.current) drag.cancel();
            else if (menu) menu = null;
            else if (editor.selection.length > 0) editor.select([], "replace");
            else return;
            event.preventDefault();
        } else if (event.key === "F2") {
            if (editor.activeCategory === null) return;
            event.preventDefault();
            renaming = editor.activeCategory;
        } else if (ARROWS[event.key] && !ctrl) {
            event.preventDefault();
            moveFocus(ARROWS[event.key]!, event.shiftKey);
        }
    }

    function pointerdown(event: PointerEvent) {
        if (menu && !(event.target instanceof Element && event.target.closest("[data-item-menu]"))) menu = null;
    }

    function clickEmpty(event: MouseEvent) {
        if (event.target !== event.currentTarget) return;
        editor.select([], "replace");
        editor.activeCategory = null;
    }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
    class="canvas"
    bind:this={root}
    bind:clientWidth={available}
    role="application"
    aria-label={t("builds.editor.canvas")}
    tabindex="0"
    onkeydown={keydown}
    onpointerdowncapture={pointerdown}
>
    {#if available > 0}
        <Tooltip.Provider>
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div
                class="content"
                class:empty
                bind:this={content}
                style:width="{view.contentWidth}px"
                style:height="{draggingItems ? view.contentHeight : layout.bareHeight}px"
                onclick={clickEmpty}
            >
                {#each view.categories as category (category.index)}
                    <EditCategory
                        {editor}
                        index={category.index}
                        category={build.modCategories[category.index]!}
                        view={category}
                        shop={view}
                        {screen}
                        items={items[category.index]!}
                        {counts}
                        rowWraps={wraps.has(category.index)}
                        dropIndex={hover?.kind === "items" && hover.category === category.index ? hover.index : null}
                        dragged={drag.current?.payload.kind === "category" &&
                            drag.current.payload.index === category.index}
                        renaming={renaming === category.index}
                        onRenameStart={() => (renaming = category.index)}
                        onRenameEnd={() => {
                            renaming = null;
                            root?.focus({ preventScroll: true });
                        }}
                        onItemMenu={openItemMenu}
                        onItemFocus={(ref) => (focus = ref)}
                        {categoryMenu}
                    />
                {/each}

                {#if draggingItems && !empty}
                    <div
                        class="new-category"
                        class:target={hover?.kind === "new-category"}
                        aria-hidden="true"
                        style:left="{layout.tile.x}px"
                        style:top="{layout.tile.y}px"
                        style:width="{layout.tile.width}px"
                        style:height="{layout.tile.height}px"
                        style:--u="{view.unit}px"
                    >
                        <Plus />
                        <span>{t("builds.editor.new_category")}</span>
                    </div>
                {/if}

                {#if bar}
                    <div
                        class="insert-bar"
                        aria-hidden="true"
                        style:left="{bar.x}px"
                        style:top="{bar.y}px"
                        style:height="{bar.height}px"
                    ></div>
                {/if}

                {#if empty}
                    <div class="call" class:target={hover?.kind === "new-category"}>
                        <Button size="lg" onclick={addFirst}>
                            <Plus aria-hidden="true" />
                            {t("builds.editor.add_first_category")}
                        </Button>
                        <p>{t("builds.editor.empty_canvas")}</p>
                    </div>
                {/if}
            </div>
        </Tooltip.Provider>
    {/if}

    {#if menu && itemMenu}
        {#key menu.id}
            <div class="item-menu" data-item-menu>{@render itemMenu(menu.ref, menu.at)}</div>
        {/key}
    {/if}

    <DragPreview />
</div>

<style>
    .canvas {
        width: 100%;
        min-width: 0;
        outline: none;
        user-select: none;
    }
    .canvas:focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: 4px;
        border-radius: 4px;
    }
    .content {
        position: relative;
    }
    .content.empty {
        min-height: 360px;
    }
    .new-category {
        position: absolute;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: calc(var(--u) * 6);
        box-sizing: border-box;
        border: 2px dashed color-mix(in oklch, var(--muted-foreground) 35%, transparent);
        border-radius: 2px;
        color: var(--muted-foreground);
        font-size: calc(var(--u) * 13);
        font-weight: 700;
        pointer-events: none;
        transition:
            border-color 120ms,
            background-color 120ms;
    }
    .new-category.target {
        border-color: var(--brass);
        background: color-mix(in oklch, var(--brass) 10%, transparent);
        color: var(--foreground);
    }
    .new-category :global(svg) {
        width: calc(var(--u) * 22);
        height: calc(var(--u) * 22);
    }
    .call {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        border: 2px dashed color-mix(in oklch, var(--muted-foreground) 30%, transparent);
        border-radius: 6px;
        transition:
            border-color 120ms,
            background-color 120ms;
    }
    .call.target {
        border-color: var(--brass);
        background: color-mix(in oklch, var(--brass) 8%, transparent);
    }
    .call p {
        margin: 0;
        color: var(--muted-foreground);
        font-size: 13px;
    }
    .insert-bar {
        position: absolute;
        z-index: 3;
        width: 4px;
        margin-left: -2px;
        border-radius: 2px;
        background: var(--brass);
        box-shadow: 0 0 10px var(--brass);
        pointer-events: none;
    }
    .insert-bar::before,
    .insert-bar::after {
        position: absolute;
        left: 50%;
        width: 14px;
        height: 4px;
        border-radius: 2px;
        background: var(--brass);
        content: "";
        translate: -50% 0;
    }
    .insert-bar::before {
        top: 0;
    }
    .insert-bar::after {
        bottom: 0;
    }
    .item-menu {
        display: contents;
    }
</style>
