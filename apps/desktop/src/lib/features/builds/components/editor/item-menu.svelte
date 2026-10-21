<script lang="ts">
    import {
        ArrowLeftRight,
        Copy,
        FolderInput,
        Grid2x2,
        ListOrdered,
        Scissors,
        Sparkles,
        StickyNote,
        Trash2,
    } from "@lucide/svelte";
    import { t } from "$lib/core/i18n.svelte";
    import * as DropdownMenu from "@deadlock-plus/ui/dropdown-menu";
    import type { ShopItem } from "$lib/features/builds/catalog";
    import {
        moveItems,
        removeItems,
        splitCategory,
        updateItem,
        type ItemRef,
    } from "$lib/features/builds/editor/document";
    import type { BuildEditor } from "$lib/features/builds/editor/editor.svelte";
    import type { ItemField } from "./inspector/item-section.svelte";

    let {
        editor,
        ref,
        byId,
        open = $bindable(false),
        anchor = null,
        onDetails,
        onSplit,
    }: {
        editor: BuildEditor;
        ref: ItemRef;
        byId: ReadonlyMap<number, ShopItem>;
        open?: boolean;
        /** Where the menu opens: the chip, or the pointer for a right-click. */
        anchor?: HTMLElement | { x: number; y: number } | null;
        /** The item's fields are edited in the inspector. */
        onDetails?: (field: ItemField) => void;
        /** The category Split category here made, for its rename. */
        onSplit?: (index: number) => void;
    } = $props();

    const categories = $derived(editor.build.modCategories);
    const entry = $derived(categories[ref.category]?.mods[ref.index]);
    const item = $derived(entry ? byId.get(entry.abilityId) : undefined);

    /** A right-click on a chip inside a multi-selection acts on the whole selection. */
    const targets = $derived.by((): ItemRef[] => {
        const selection: readonly ItemRef[] = editor.selection;
        const inside = selection.some((s) => s.category === ref.category && s.index === ref.index);
        return inside && selection.length > 1 ? [...selection] : [ref];
    });

    const customAnchor = $derived.by(() => {
        if (!anchor || anchor instanceof HTMLElement) return anchor;
        const { x, y } = anchor;
        return { getBoundingClientRect: () => new DOMRect(x, y, 0, 0) };
    });

    const swaps = $derived.by(() => {
        if (!item) return { components: [], upgrades: [] };
        const live = (i: ShopItem | undefined): i is ShopItem => !!i && i.shopable && !i.disabled;
        return {
            components: item.componentIds.map((id) => byId.get(id)).filter(live),
            upgrades: [...byId.values()].filter((i) => live(i) && i.componentIds.includes(item.id)),
        };
    });

    function details(field: ItemField) {
        onDetails?.(field);
    }

    function swap(next: ShopItem) {
        editor.apply(
            updateItem(editor.build, ref, {
                abilityId: next.id,
                ...(next.imbue ? {} : { imbueTargetAbilityId: null }),
            }),
        );
    }

    function moveTo(category: number) {
        const length = categories[category]?.mods.length ?? 0;
        editor.apply(moveItems(editor.build, targets, { category, index: length }, false));
        editor.select([], "replace");
    }

    function duplicate() {
        const last = targets
            .filter((r) => r.category === ref.category)
            .reduce((m, r) => Math.max(m, r.index), ref.index);
        editor.apply(moveItems(editor.build, targets, { category: ref.category, index: last + 1 }, true));
    }

    function split() {
        editor.apply(splitCategory(editor.build, ref.category, ref.index));
        editor.select([], "replace");
        onSplit?.(ref.category + 1);
    }

    function remove() {
        editor.apply(removeItems(editor.build, targets));
        editor.select([], "replace");
    }
</script>

{#snippet swapItem(next: ShopItem)}
    <DropdownMenu.Item onSelect={() => swap(next)}>
        {#if next.art}
            <img src={next.art} alt="" class="size-5 shrink-0 rounded-sm object-cover" />
        {/if}
        <span class="truncate">{next.name}</span>
    </DropdownMenu.Item>
{/snippet}

<DropdownMenu.Root bind:open>
    <DropdownMenu.Content {customAnchor} align="start" side="bottom">
        <DropdownMenu.Item onSelect={() => details("note")}>
            <StickyNote />
            {t("builds.editor.menu.note")}
        </DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => details("sell")}>
            <ListOrdered />
            {t("builds.editor.menu.sell_priority")}
        </DropdownMenu.Item>
        {#if item?.imbue}
            <DropdownMenu.Item onSelect={() => details("imbue")}>
                <Sparkles />
                {t("builds.editor.menu.imbue_target")}
            </DropdownMenu.Item>
        {/if}
        <DropdownMenu.Item onSelect={() => details("flex")}>
            <Grid2x2 />
            {t("builds.editor.menu.flex_slots")}
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger>
                <FolderInput />
                {t("builds.editor.menu.move_to")}
            </DropdownMenu.SubTrigger>
            <DropdownMenu.SubContent class="max-h-80 overflow-y-auto">
                {#each categories as category, i (i)}
                    <DropdownMenu.Item disabled={i === ref.category && targets.length === 1} onSelect={() => moveTo(i)}>
                        <span class="truncate">{category.name || t("builds.editor.menu.unnamed")}</span>
                    </DropdownMenu.Item>
                {/each}
            </DropdownMenu.SubContent>
        </DropdownMenu.Sub>
        {#if swaps.components.length > 0 || swaps.upgrades.length > 0}
            <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger>
                    <ArrowLeftRight />
                    {t("builds.editor.menu.swap_with")}
                </DropdownMenu.SubTrigger>
                <DropdownMenu.SubContent class="max-h-80 overflow-y-auto">
                    {#if swaps.upgrades.length > 0}
                        <DropdownMenu.Group>
                            <DropdownMenu.GroupHeading>
                                {t("builds.editor.menu.upgrades")}
                            </DropdownMenu.GroupHeading>
                            {#each swaps.upgrades as next (next.id)}
                                {@render swapItem(next)}
                            {/each}
                        </DropdownMenu.Group>
                    {/if}
                    {#if swaps.components.length > 0}
                        <DropdownMenu.Group>
                            <DropdownMenu.GroupHeading>
                                {t("builds.editor.menu.components")}
                            </DropdownMenu.GroupHeading>
                            {#each swaps.components as next (next.id)}
                                {@render swapItem(next)}
                            {/each}
                        </DropdownMenu.Group>
                    {/if}
                </DropdownMenu.SubContent>
            </DropdownMenu.Sub>
        {/if}
        <DropdownMenu.Item disabled={ref.index === 0} onSelect={split}>
            <Scissors />
            {t("builds.editor.menu.split_here")}
        </DropdownMenu.Item>
        <DropdownMenu.Item onSelect={duplicate}>
            <Copy />
            {t("builds.editor.menu.duplicate")}
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item class="text-destructive data-[highlighted]:text-destructive" onSelect={remove}>
            <Trash2 />
            {t("builds.editor.menu.remove")}
        </DropdownMenu.Item>
    </DropdownMenu.Content>
</DropdownMenu.Root>
