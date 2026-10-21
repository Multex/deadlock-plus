<script module lang="ts">
    export type ItemField = "note" | "sell" | "imbue" | "flex";

    export interface EditorAbility {
        id: number;
        name: string;
        art?: string;
    }

    /** Lets the canvas's item menu jump to a field here. */
    export const itemFieldId = (field: ItemField) => `inspector-item-${field}`;
</script>

<script lang="ts">
    import { ArrowLeftRight, Copy, FolderInput, Trash2 } from "@lucide/svelte";
    import { untrack } from "svelte";
    import * as DropdownMenu from "@deadlock-plus/ui/dropdown-menu";
    import IconButton from "@deadlock-plus/ui/icon-button.svelte";
    import Input from "@deadlock-plus/ui/input.svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import { formatNumber, t, tn } from "$lib/core/i18n.svelte";
    import type { ShopItem } from "$lib/features/builds/catalog";
    import { moveItems, removeItems, updateItem, type ItemRef } from "$lib/features/builds/editor/document";
    import type { BuildEditor } from "$lib/features/builds/editor/editor.svelte";
    import { duplicateItems, parseCount, swapChoices, swapItem } from "./actions";
    import MenuAction from "./menu-action.svelte";

    let {
        editor,
        byId,
        abilities,
    }: {
        editor: BuildEditor;
        byId?: ReadonlyMap<number, ShopItem>;
        abilities: readonly EditorAbility[];
    } = $props();

    const id = $props.id();
    const NONE = "none";

    const selection = $derived(editor.selection);
    const categories = $derived(editor.build.modCategories);
    const ref = $derived<ItemRef | null>(selection.length === 1 ? selection[0]! : null);
    const entry = $derived(ref ? categories[ref.category]?.mods[ref.index] : undefined);
    const item = $derived(entry ? byId?.get(entry.abilityId) : undefined);
    const swaps = $derived(byId ? swapChoices(item, byId) : { upgrades: [], components: [] });

    let sellText = $state("");
    let flexText = $state("");
    const sell = $derived(parseCount(sellText));
    const flex = $derived(parseCount(flexText));

    // Follows the entry (another item, an undo) without wiping a number that is still being typed.
    $effect.pre(() => {
        const sellPriority = entry?.sellPriority ?? null;
        const requiredFlexSlots = entry?.requiredFlexSlots ?? null;
        untrack(() => {
            if (parseCount(sellText) !== sellPriority) sellText = sellPriority?.toString() ?? "";
            if (parseCount(flexText) !== requiredFlexSlots) flexText = requiredFlexSlots?.toString() ?? "";
        });
    });

    const targets = $derived<{ value: string; label: string; art?: string }[]>([
        { value: NONE, label: t("builds.editor.menu.imbue_none") },
        ...abilities.map((a) => ({ value: String(a.id), label: a.name, art: a.art })),
    ]);

    function patch(field: string, value: Parameters<typeof updateItem>[2]) {
        if (!ref) return;
        editor.apply(updateItem(editor.build, ref, value), `item:${ref.category}:${ref.index}:${field}`);
    }

    function setCount(field: "sell" | "flex", text: string) {
        if (field === "sell") sellText = text;
        else flexText = text;
        const value = parseCount(text);
        if (value === undefined) return;
        patch(field, field === "sell" ? { sellPriority: value } : { requiredFlexSlots: value });
    }

    function remove() {
        editor.apply(removeItems(editor.build, selection));
        editor.select([], "replace");
    }

    function moveTo(category: number) {
        const length = categories[category]?.mods.length ?? 0;
        editor.apply(moveItems(editor.build, selection, { category, index: length }, false));
        editor.select([], "replace");
    }

    function duplicate() {
        const { build, copies } = duplicateItems(editor.build, selection);
        editor.apply(build);
        editor.select(copies, "replace");
    }

    function swap(next: ShopItem) {
        const at = ref;
        if (!at) return;
        editor.apply(swapItem(editor.build, at, next));
        editor.select([at], "replace");
    }
</script>

{#snippet swapChoice(next: ShopItem)}
    <DropdownMenu.Item onSelect={() => swap(next)}>
        {#if next.art}
            <img src={next.art} alt="" class="size-5 shrink-0 rounded-sm object-cover" />
        {/if}
        <span class="truncate">{next.name}</span>
    </DropdownMenu.Item>
{/snippet}

{#snippet actions(single: ItemRef | null)}
    <div
        class="flex items-center gap-1 border-t border-border pt-3"
        role="toolbar"
        aria-label={t("builds.editor.inspector.item")}
    >
        <IconButton
            label={t("builds.editor.menu.duplicate")}
            tooltip
            class="h-8 w-8"
            data-testid="item-duplicate"
            onclick={duplicate}
        >
            <Copy aria-hidden="true" />
        </IconButton>
        <MenuAction label={t("builds.editor.menu.move_to")} testid="item-move">
            {#snippet icon()}<FolderInput aria-hidden="true" />{/snippet}
            {#each categories as category, i (i)}
                <DropdownMenu.Item disabled={single !== null && i === single.category} onSelect={() => moveTo(i)}>
                    <span class="truncate">{category.name || t("builds.editor.menu.unnamed")}</span>
                </DropdownMenu.Item>
            {/each}
        </MenuAction>
        {#if single}
            <MenuAction
                label={t("builds.editor.menu.swap_with")}
                disabled={swaps.upgrades.length === 0 && swaps.components.length === 0}
                testid="item-swap"
            >
                {#snippet icon()}<ArrowLeftRight aria-hidden="true" />{/snippet}
                {#if swaps.upgrades.length > 0}
                    <DropdownMenu.Group>
                        <DropdownMenu.GroupHeading>{t("builds.editor.menu.upgrades")}</DropdownMenu.GroupHeading>
                        {#each swaps.upgrades as next (next.id)}
                            {@render swapChoice(next)}
                        {/each}
                    </DropdownMenu.Group>
                {/if}
                {#if swaps.components.length > 0}
                    <DropdownMenu.Group>
                        <DropdownMenu.GroupHeading>{t("builds.editor.menu.components")}</DropdownMenu.GroupHeading>
                        {#each swaps.components as next (next.id)}
                            {@render swapChoice(next)}
                        {/each}
                    </DropdownMenu.Group>
                {/if}
            </MenuAction>
        {/if}
        <IconButton
            label={t("builds.editor.menu.remove")}
            tooltip
            class="ml-auto h-8 w-8 text-destructive hover:text-destructive"
            data-testid="item-remove"
            onclick={remove}
        >
            <Trash2 aria-hidden="true" />
        </IconButton>
    </div>
{/snippet}

<section class="flex flex-col gap-3" aria-labelledby="{id}-title" data-testid="inspector-item">
    <h2 id="{id}-title" class="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {t("builds.editor.inspector.item")}
    </h2>

    {#if selection.length === 0}
        <p class="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            {t("builds.editor.inspector.select_item")}
        </p>
    {:else if ref && entry}
        <div class="flex items-center gap-3">
            <span class="size-12 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                {#if item?.art}
                    <img src={item.art} alt="" class="size-full object-cover" />
                {/if}
            </span>
            <div class="min-w-0">
                <p class="truncate text-sm font-semibold" data-testid="inspector-item-name">
                    {item?.name ?? t("builds.editor.menu.item_title")}
                </p>
                {#if item}
                    <p class="text-xs text-muted-foreground tabular-nums">
                        {t("builds.editor.picker.tier", { tier: item.tier })} · {formatNumber(item.cost)}
                    </p>
                {/if}
            </div>
        </div>

        <div class="flex flex-col gap-1">
            <label for={itemFieldId("note")} class="text-xs font-medium">{t("builds.editor.menu.note_label")}</label>
            <Input
                id={itemFieldId("note")}
                value={entry.annotation ?? ""}
                autocomplete="off"
                oninput={(e) => patch("note", { annotation: e.currentTarget.value || null })}
            />
        </div>

        {#if item?.imbue}
            <div class="flex flex-col gap-1">
                <span id="{id}-imbue" class="text-xs font-medium">{t("builds.editor.menu.imbue_label")}</span>
                <SelectMenu
                    id={itemFieldId("imbue")}
                    size="sm"
                    aria-labelledby="{id}-imbue"
                    items={targets}
                    value={entry.imbueTargetAbilityId?.toString() ?? NONE}
                    onValueChange={(value) =>
                        patch("imbue", { imbueTargetAbilityId: value === NONE ? null : Number(value) })}
                >
                    {#snippet leading(target)}
                        {#if target.art}
                            <img src={target.art} alt="" />
                        {/if}
                    {/snippet}
                </SelectMenu>
            </div>
        {/if}

        <div class="grid grid-cols-2 gap-2">
            <div class="flex flex-col gap-1">
                <label for={itemFieldId("sell")} class="text-xs font-medium">
                    {t("builds.editor.menu.sell_label")}
                </label>
                <Input
                    id={itemFieldId("sell")}
                    inputmode="numeric"
                    autocomplete="off"
                    value={sellText}
                    aria-invalid={sell === undefined}
                    oninput={(e) => setCount("sell", e.currentTarget.value)}
                />
            </div>
            <div class="flex flex-col gap-1">
                <label for={itemFieldId("flex")} class="text-xs font-medium">
                    {t("builds.editor.menu.flex_label")}
                </label>
                <Input
                    id={itemFieldId("flex")}
                    inputmode="numeric"
                    autocomplete="off"
                    value={flexText}
                    aria-invalid={flex === undefined}
                    oninput={(e) => setCount("flex", e.currentTarget.value)}
                />
            </div>
        </div>
        {#if sell === undefined || flex === undefined}
            <p role="alert" class="text-xs text-destructive">{t("builds.editor.menu.whole_number")}</p>
        {/if}

        {@render actions(ref)}
    {:else}
        <p class="text-sm font-semibold" data-testid="inspector-item-count">
            {tn("builds.editor.inspector.items_selected", selection.length, { count: selection.length })}
        </p>
        {@render actions(null)}
    {/if}
</section>
