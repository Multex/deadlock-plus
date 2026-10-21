<script module lang="ts">
    import type { CategorySize } from "$lib/features/builds/editor/row-ops";

    // Shared by every category's menu, so a size copied from one pastes into another.
    let copiedSize = $state<CategorySize | null>(null);
</script>

<script lang="ts">
    import {
        ArrowDownUp,
        ClipboardCopy,
        ClipboardPaste,
        Copy,
        Ellipsis,
        Merge,
        Minus,
        Pencil,
        Plus,
        Rows3,
        Ruler,
        Scissors,
        Shrink,
        StretchHorizontal,
        Text,
        Trash2,
    } from "@lucide/svelte";
    import { t } from "$lib/core/i18n.svelte";
    import type { Screen } from "@deadlock-plus/build-layout";
    import type { BuildView } from "@deadlock-plus/ipc-types/BuildView";
    import Button, { buttonVariants } from "@deadlock-plus/ui/button.svelte";
    import ConfirmDialog from "@deadlock-plus/ui/confirm-dialog.svelte";
    import * as Dialog from "@deadlock-plus/ui/dialog";
    import * as DropdownMenu from "@deadlock-plus/ui/dropdown-menu";
    import IconButton from "@deadlock-plus/ui/icon-button.svelte";
    import Input from "@deadlock-plus/ui/input.svelte";
    import { cn } from "@deadlock-plus/ui/utils";
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
    import {
        MAX_COLUMNS,
        equalRows,
        equalWidths,
        equalizeHeights,
        fillRow,
        fillRowProportionally,
        pasteSize,
        rowOf,
        setSize,
        sizeOf,
    } from "$lib/features/builds/editor/row-ops";
    import { MEASURED_RESOLUTION, SHOP_SCREENS } from "$lib/features/builds/shop-view";
    import CategoryDetailsDialog from "./category-details-dialog.svelte";

    let {
        editor,
        index,
        byId,
        onRename,
        onSplit,
        screen = SHOP_SCREENS[MEASURED_RESOLUTION],
        open = $bindable(false),
        triggerClass,
    }: {
        editor: BuildEditor;
        index: number;
        byId: ReadonlyMap<number, ShopItem>;
        /** Rename is inline in the category header. */
        onRename: () => void;
        /** The category Split in half made, for its rename. */
        onSplit?: (index: number) => void;
        /** The screen that decides which categories share a row. */
        screen?: Screen;
        open?: boolean;
        triggerClass?: string;
    } = $props();

    const category = $derived(editor.build.modCategories[index]);
    const items = $derived(category?.mods.length ?? 0);
    const last = $derived(index >= editor.build.modCategories.length - 1);
    const row = $derived(open ? rowOf(editor.build, index, screen) : []);
    const name = $derived(category?.name || t("builds.editor.menu.unnamed"));

    const id = $props.id();
    let detailsOpen = $state(false);
    let removeOpen = $state(false);
    let sizeOpen = $state(false);
    let columnsText = $state("1");
    let rowsText = $state("1");

    const columns = $derived(whole(columnsText, 1, MAX_COLUMNS));
    const rows = $derived(whole(rowsText, 1, Number.MAX_SAFE_INTEGER));

    function whole(text: string, min: number, max: number): number | null {
        const trimmed = text.trim();
        if (!/^\d+$/.test(trimmed)) return null;
        const value = Number(trimmed);
        return value >= min && value <= max ? value : null;
    }

    function apply(fn: (build: BuildView) => BuildView, clearSelection = false) {
        editor.apply(fn(editor.build));
        if (clearSelection) editor.select([], "replace");
    }

    function openSize() {
        const size = sizeOf(editor.build, index, screen);
        columnsText = String(Math.min(size.columns, MAX_COLUMNS));
        rowsText = String(size.rows);
        sizeOpen = true;
    }

    function saveSize(event: SubmitEvent) {
        event.preventDefault();
        if (columns === null || rows === null) return;
        apply((b) => setSize(b, index, columns, rows));
        sizeOpen = false;
    }

    function step(text: string, by: number, max: number): string {
        const value = Number.parseInt(text, 10);
        return String(Math.min(max, Math.max(1, (Number.isNaN(value) ? 1 : value) + by)));
    }

    function copySize() {
        const { width, height } = sizeOf(editor.build, index, screen);
        copiedSize = { width, height };
    }

    function split() {
        apply((b) => splitCategory(b, index, Math.ceil(items / 2)), true);
        onSplit?.(index + 1);
    }

    function remove() {
        apply((b) => removeCategory(b, index), true);
    }
</script>

{#snippet stepper(id: string, label: string, value: string, set: (next: string) => void, max: number)}
    <div class="flex flex-col gap-1.5">
        <label for={id} class="text-sm font-medium">{label}</label>
        <div class="flex items-center gap-1">
            <IconButton
                label={t("builds.editor.menu.decrease", { label })}
                variant="outline"
                onclick={() => set(step(value, -1, max))}
            >
                <Minus />
            </IconButton>
            <Input
                {id}
                class="w-16 text-center tabular-nums"
                inputmode="numeric"
                autocomplete="off"
                bind:value={() => value, set}
            />
            <IconButton
                label={t("builds.editor.menu.increase", { label })}
                variant="outline"
                onclick={() => set(step(value, 1, max))}
            >
                <Plus />
            </IconButton>
        </div>
    </div>
{/snippet}

<DropdownMenu.Root bind:open>
    <DropdownMenu.Trigger
        class={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-7", triggerClass)}
        aria-label={t("builds.editor.menu.category_actions", { name })}
    >
        <Ellipsis />
    </DropdownMenu.Trigger>
    <DropdownMenu.Content>
        <DropdownMenu.Item onSelect={onRename}>
            <Pencil />
            {t("builds.editor.menu.rename")}
        </DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => (detailsOpen = true)}>
            <Text />
            {t("builds.editor.menu.description")}
        </DropdownMenu.Item>
        <DropdownMenu.CheckboxItem
            checked={category?.optional ?? false}
            onCheckedChange={(optional) => apply((b) => updateCategory(b, index, { optional }))}
        >
            {t("builds.editor.menu.optional")}
        </DropdownMenu.CheckboxItem>
        <DropdownMenu.Separator />
        <DropdownMenu.Item onSelect={() => apply((b) => fitToItems(b, index))}>
            <Shrink />
            {t("builds.editor.menu.fit_to_items")}
        </DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => apply((b) => fillRow(b, index, screen))}>
            <StretchHorizontal />
            {t("builds.editor.menu.fill_row")}
        </DropdownMenu.Item>
        <DropdownMenu.Item onSelect={openSize}>
            <Ruler />
            {t("builds.editor.menu.set_size")}
        </DropdownMenu.Item>
        <DropdownMenu.Item onSelect={copySize}>
            <ClipboardCopy />
            {t("builds.editor.menu.copy_size")}
        </DropdownMenu.Item>
        <DropdownMenu.Item
            disabled={copiedSize === null}
            onSelect={() => {
                const size = copiedSize;
                if (size) apply((b) => pasteSize(b, index, size));
            }}
        >
            <ClipboardPaste />
            {t("builds.editor.menu.paste_size")}
        </DropdownMenu.Item>
        <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger disabled={row.length < 2}>
                <Rows3 />
                {t("builds.editor.menu.row")}
            </DropdownMenu.SubTrigger>
            <DropdownMenu.SubContent>
                <DropdownMenu.Item onSelect={() => apply((b) => equalWidths(b, index, screen))}>
                    {t("builds.editor.menu.equal_widths")}
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => apply((b) => equalRows(b, index, screen))}>
                    {t("builds.editor.menu.equal_rows")}
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => apply((b) => equalizeHeights(b, index, screen))}>
                    {t("builds.editor.menu.equalize_heights")}
                </DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => apply((b) => fillRowProportionally(b, index, screen))}>
                    {t("builds.editor.menu.fill_row_proportionally")}
                </DropdownMenu.Item>
            </DropdownMenu.SubContent>
        </DropdownMenu.Sub>
        <DropdownMenu.Separator />
        <DropdownMenu.Item onSelect={() => apply((b) => duplicateCategory(b, index), true)}>
            <Copy />
            {t("builds.editor.menu.duplicate")}
        </DropdownMenu.Item>
        <DropdownMenu.Item disabled={items < 2} onSelect={split}>
            <Scissors />
            {t("builds.editor.menu.split_in_half")}
        </DropdownMenu.Item>
        <DropdownMenu.Item disabled={last} onSelect={() => apply((b) => mergeWithNext(b, index), true)}>
            <Merge />
            {t("builds.editor.menu.merge_with_next")}
        </DropdownMenu.Item>
        <DropdownMenu.Item disabled={items < 2} onSelect={() => apply((b) => sortItems(b, index, byId), true)}>
            <ArrowDownUp />
            {t("builds.editor.menu.sort_items")}
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item
            class="text-destructive data-[highlighted]:text-destructive"
            onSelect={() => (items > 0 ? (removeOpen = true) : remove())}
        >
            <Trash2 />
            {t("builds.editor.menu.remove")}
        </DropdownMenu.Item>
    </DropdownMenu.Content>
</DropdownMenu.Root>

<CategoryDetailsDialog {editor} {index} bind:open={detailsOpen} focus="description" />

<ConfirmDialog
    bind:open={removeOpen}
    title={t("builds.editor.menu.remove_title", { name })}
    description={t("builds.editor.menu.remove_description", { count: items })}
    confirmLabel={t("builds.editor.menu.remove")}
    cancelLabel={t("builds.editor.menu.cancel")}
    destructive
    onconfirm={remove}
/>

<Dialog.Root bind:open={sizeOpen}>
    <Dialog.Content class="max-w-sm">
        <Dialog.Title>{t("builds.editor.menu.set_size_title")}</Dialog.Title>
        <form class="flex flex-col gap-4" onsubmit={saveSize}>
            <div class="flex items-end gap-4">
                {@render stepper(
                    `${id}-columns`,
                    t("builds.editor.menu.columns"),
                    columnsText,
                    (next) => (columnsText = next),
                    MAX_COLUMNS,
                )}
                {@render stepper(
                    `${id}-rows`,
                    t("builds.editor.menu.rows"),
                    rowsText,
                    (next) => (rowsText = next),
                    Number.MAX_SAFE_INTEGER,
                )}
            </div>
            {#if columns === null || rows === null}
                <p role="alert" class="text-sm text-destructive">
                    {t("builds.editor.menu.size_range", { max: MAX_COLUMNS })}
                </p>
            {/if}
            <div class="flex justify-end gap-2">
                <Button variant="outline" type="button" onclick={() => (sizeOpen = false)}>
                    {t("builds.editor.menu.cancel")}
                </Button>
                <Button type="submit" disabled={columns === null || rows === null}>
                    {t("builds.editor.menu.apply")}
                </Button>
            </div>
        </form>
    </Dialog.Content>
</Dialog.Root>
