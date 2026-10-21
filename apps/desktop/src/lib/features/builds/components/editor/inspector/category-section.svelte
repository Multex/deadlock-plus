<script lang="ts">
    import { ArrowDownUp, Copy, Merge, Minus, Plus, Scissors, Shrink, Trash2 } from "@lucide/svelte";
    import type { Component } from "svelte";
    import type { Screen } from "@deadlock-plus/build-layout";
    import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
    import ConfirmDialog from "@deadlock-plus/ui/confirm-dialog.svelte";
    import IconButton from "@deadlock-plus/ui/icon-button.svelte";
    import Input from "@deadlock-plus/ui/input.svelte";
    import Switch from "@deadlock-plus/ui/switch.svelte";
    import Textarea from "@deadlock-plus/ui/textarea.svelte";
    import { formatNumber, t } from "$lib/core/i18n.svelte";
    import type { ShopItem } from "$lib/features/builds/catalog";
    import {
        duplicateCategory,
        fitToItems,
        mergeWithNext,
        removeCategory,
        sortItems,
        splitCategory,
        updateCategory,
    } from "$lib/features/builds/editor/document";
    import type { BuildEditor } from "$lib/features/builds/editor/editor.svelte";
    import { MAX_COLUMNS, setSize, sizeOf } from "$lib/features/builds/editor/row-ops";

    type Icon = Component<{ class?: string; "aria-hidden"?: boolean | "true" | "false" }>;

    let {
        editor,
        byId,
        screen,
        onSplit,
    }: {
        editor: BuildEditor;
        byId?: ReadonlyMap<number, ShopItem>;
        screen: Screen;
        /** The category Split made, for its rename. */
        onSplit?: (index: number) => void;
    } = $props();

    const id = $props.id();
    let removeOpen = $state(false);

    const index = $derived(editor.activeCategory);
    const category = $derived(index === null ? undefined : editor.build.modCategories[index]);
    const items = $derived(category?.mods.length ?? 0);
    const last = $derived(index !== null && index >= editor.build.modCategories.length - 1);
    const size = $derived(index !== null && category ? sizeOf(editor.build, index, screen) : null);
    const displayName = $derived(category?.name || t("builds.editor.menu.unnamed"));

    function apply(fn: (build: BuildView, index: number) => BuildView, mergeKey?: string, clearSelection = false) {
        if (index === null) return;
        editor.apply(fn(editor.build, index), mergeKey);
        if (clearSelection) editor.select([], "replace");
    }

    function resize(columns: number, rows: number) {
        apply((b, i) => setSize(b, i, Math.min(MAX_COLUMNS, Math.max(1, columns)), Math.max(1, rows)));
    }

    function split() {
        if (index === null) return;
        const at = index;
        apply((b, i) => splitCategory(b, i, Math.ceil(items / 2)), undefined, true);
        onSplit?.(at + 1);
    }

    function remove() {
        if (index === null) return;
        const at = index;
        apply((b, i) => removeCategory(b, i), undefined, true);
        const left = editor.build.modCategories.length;
        editor.activeCategory = left === 0 ? null : Math.min(at, left - 1);
    }

    const actions = $derived<{ key: string; icon: Icon; label: string; disabled?: boolean; run: () => void }[]>([
        {
            key: "fit",
            icon: Shrink,
            label: t("builds.editor.menu.fit_to_items"),
            run: () => apply((b, i) => fitToItems(b, i)),
        },
        {
            key: "duplicate",
            icon: Copy,
            label: t("builds.editor.menu.duplicate"),
            run: () => apply((b, i) => duplicateCategory(b, i), undefined, true),
        },
        { key: "split", icon: Scissors, label: t("builds.editor.menu.split_in_half"), disabled: items < 2, run: split },
        {
            key: "merge",
            icon: Merge,
            label: t("builds.editor.menu.merge_with_next"),
            disabled: last,
            run: () => apply((b, i) => mergeWithNext(b, i), undefined, true),
        },
        {
            key: "sort",
            icon: ArrowDownUp,
            label: t("builds.editor.menu.sort_items"),
            disabled: items < 2 || !byId,
            run: () => byId && apply((b, i) => sortItems(b, i, byId), undefined, true),
        },
    ]);
</script>

{#snippet stepper(label: string, value: number, min: number, max: number, set: (next: number) => void, test: string)}
    <div class="flex flex-col gap-1">
        <span class="text-xs font-medium" id="{id}-{test}">{label}</span>
        <div class="flex items-center gap-1" role="group" aria-labelledby="{id}-{test}">
            <IconButton
                label={t("builds.editor.menu.decrease", { label })}
                variant="outline"
                class="h-8 w-8"
                disabled={value <= min}
                data-testid="{test}-less"
                onclick={() => set(value - 1)}
            >
                <Minus />
            </IconButton>
            <output class="w-8 text-center text-sm font-semibold tabular-nums" data-testid={test} aria-live="polite">
                {formatNumber(value)}
            </output>
            <IconButton
                label={t("builds.editor.menu.increase", { label })}
                variant="outline"
                class="h-8 w-8"
                disabled={value >= max}
                data-testid="{test}-more"
                onclick={() => set(value + 1)}
            >
                <Plus />
            </IconButton>
        </div>
    </div>
{/snippet}

<section class="flex flex-col gap-3" aria-labelledby="{id}-title" data-testid="inspector-category">
    <h2 id="{id}-title" class="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {t("builds.editor.inspector.category")}
    </h2>

    {#if index === null || !category || !size}
        <p class="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            {t("builds.editor.inspector.select_category")}
        </p>
    {:else}
        {@const at = index}
        <div class="flex flex-col gap-1">
            <label for="{id}-name" class="text-xs font-medium">{t("builds.editor.menu.name")}</label>
            <Input
                id="{id}-name"
                value={category.name}
                autocomplete="off"
                placeholder={t("builds.editor.unnamed")}
                data-testid="category-name"
                oninput={(e) =>
                    editor.apply(
                        updateCategory(editor.build, at, { name: e.currentTarget.value }),
                        `category:${at}:name`,
                    )}
            />
        </div>

        <div class="flex flex-col gap-1">
            <label for="{id}-description" class="text-xs font-medium">
                {t("builds.editor.menu.description_label")}
            </label>
            <Textarea
                id="{id}-description"
                rows={2}
                value={category.description}
                data-testid="category-description"
                oninput={(e) =>
                    editor.apply(
                        updateCategory(editor.build, at, { description: e.currentTarget.value }),
                        `category:${at}:description`,
                    )}
            />
        </div>

        <div class="flex items-center justify-between gap-2">
            <label for="{id}-optional" class="text-xs font-medium">{t("builds.editor.menu.optional")}</label>
            <Switch
                id="{id}-optional"
                checked={category.optional}
                data-testid="category-optional"
                onCheckedChange={(optional) => apply((b, i) => updateCategory(b, i, { optional }))}
            />
        </div>

        <div class="flex items-end gap-4">
            {@render stepper(
                t("builds.editor.menu.columns"),
                size.columns,
                1,
                MAX_COLUMNS,
                (columns) => resize(columns, size.rows),
                "category-columns",
            )}
            {@render stepper(
                t("builds.editor.menu.rows"),
                size.rows,
                1,
                Number.MAX_SAFE_INTEGER,
                (rows) => resize(size.columns, rows),
                "category-rows",
            )}
        </div>

        <div class="flex items-center gap-1 border-t border-border pt-3" role="toolbar" aria-label={displayName}>
            {#each actions as action (action.key)}
                <IconButton
                    label={action.label}
                    tooltip
                    class="h-8 w-8"
                    disabled={action.disabled}
                    data-testid="category-{action.key}"
                    onclick={action.run}
                >
                    <action.icon aria-hidden="true" />
                </IconButton>
            {/each}
            <IconButton
                label={t("builds.editor.menu.remove")}
                tooltip
                class="ml-auto h-8 w-8 text-destructive hover:text-destructive"
                data-testid="category-remove"
                onclick={() => (items > 0 ? (removeOpen = true) : remove())}
            >
                <Trash2 aria-hidden="true" />
            </IconButton>
        </div>
    {/if}
</section>

<ConfirmDialog
    bind:open={removeOpen}
    title={t("builds.editor.menu.remove_title", { name: displayName })}
    description={t("builds.editor.menu.remove_description", { count: items })}
    confirmLabel={t("builds.editor.menu.remove")}
    cancelLabel={t("builds.editor.menu.cancel")}
    destructive
    onconfirm={remove}
/>
