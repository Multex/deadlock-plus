<script module lang="ts">
    export type ItemField = "note" | "sell" | "imbue" | "flex";

    export interface EditorAbility {
        id: number;
        name: string;
        art?: string;
    }

    const UINT32_MAX = 4294967295;

    /** Blank clears the field; anything but a whole number the file's uint32 holds is invalid. */
    function count(text: string): number | null | undefined {
        const trimmed = text.trim();
        if (trimmed === "") return null;
        if (!/^\d+$/.test(trimmed)) return undefined;
        const value = Number(trimmed);
        return value <= UINT32_MAX ? value : undefined;
    }
</script>

<script lang="ts">
    import { untrack } from "svelte";
    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import * as Dialog from "@deadlock-plus/ui/dialog";
    import Input from "@deadlock-plus/ui/input.svelte";
    import SelectMenu from "@deadlock-plus/ui/select-menu.svelte";
    import type { ShopItem } from "$lib/features/builds/catalog";
    import { updateItem, type ItemRef } from "$lib/features/builds/editor/document";
    import type { BuildEditor } from "$lib/features/builds/editor/editor.svelte";

    let {
        editor,
        ref,
        byId,
        abilities,
        open = $bindable(false),
        focus = "note",
    }: {
        editor: BuildEditor;
        ref: ItemRef;
        byId: ReadonlyMap<number, ShopItem>;
        abilities: readonly EditorAbility[];
        open?: boolean;
        focus?: ItemField;
    } = $props();

    const id = $props.id();
    const NONE = "none";

    let note = $state("");
    let sell = $state("");
    let flex = $state("");
    let imbue = $state(NONE);

    const entry = $derived(editor.build.modCategories[ref.category]?.mods[ref.index]);
    const item = $derived(entry ? byId.get(entry.abilityId) : undefined);
    const imbues = $derived(item?.imbue === true);

    const sellValue = $derived(count(sell));
    const flexValue = $derived(count(flex));
    const valid = $derived(sellValue !== undefined && flexValue !== undefined);

    const targets = $derived<{ value: string; label: string; art?: string }[]>([
        { value: NONE, label: t("builds.editor.menu.imbue_none") },
        ...abilities.map((a) => ({ value: String(a.id), label: a.name, art: a.art })),
    ]);

    // Loads once per opening, so an autosave or undo elsewhere does not wipe what is being typed.
    $effect.pre(() => {
        if (!open) return;
        untrack(() => {
            note = entry?.annotation ?? "";
            sell = entry?.sellPriority?.toString() ?? "";
            flex = entry?.requiredFlexSlots?.toString() ?? "";
            imbue = entry?.imbueTargetAbilityId?.toString() ?? NONE;
        });
    });

    function save(event: SubmitEvent) {
        event.preventDefault();
        if (!entry || sellValue === undefined || flexValue === undefined) return;
        editor.apply(
            updateItem(editor.build, ref, {
                annotation: note.trim() || null,
                sellPriority: sellValue,
                requiredFlexSlots: flexValue,
                imbueTargetAbilityId: imbues ? (imbue === NONE ? null : Number(imbue)) : entry.imbueTargetAbilityId,
            }),
        );
        open = false;
    }

    function focusField(event: Event) {
        event.preventDefault();
        const field = focus === "imbue" && !imbues ? "note" : focus;
        document.getElementById(`${id}-${field}`)?.focus();
    }
</script>

<Dialog.Root bind:open>
    <Dialog.Content class="max-w-md" onOpenAutoFocus={focusField}>
        <Dialog.Title>{item?.name ?? t("builds.editor.menu.item_title")}</Dialog.Title>
        <form class="flex flex-col gap-4" onsubmit={save}>
            <div class="flex flex-col gap-1.5">
                <label for="{id}-note" class="text-sm font-medium">{t("builds.editor.menu.note_label")}</label>
                <Input id="{id}-note" bind:value={note} autocomplete="off" />
            </div>
            {#if imbues}
                <div class="flex flex-col gap-1.5">
                    <span id="{id}-imbue-label" class="text-sm font-medium">
                        {t("builds.editor.menu.imbue_label")}
                    </span>
                    <SelectMenu id="{id}-imbue" aria-labelledby="{id}-imbue-label" items={targets} bind:value={imbue}>
                        {#snippet leading(target)}
                            {#if target.art}
                                <img src={target.art} alt="" />
                            {/if}
                        {/snippet}
                    </SelectMenu>
                </div>
            {/if}
            <div class="grid grid-cols-2 gap-3">
                <div class="flex flex-col gap-1.5">
                    <label for="{id}-sell" class="text-sm font-medium">{t("builds.editor.menu.sell_label")}</label>
                    <Input
                        id="{id}-sell"
                        inputmode="numeric"
                        bind:value={sell}
                        aria-invalid={sellValue === undefined}
                        autocomplete="off"
                    />
                </div>
                <div class="flex flex-col gap-1.5">
                    <label for="{id}-flex" class="text-sm font-medium">{t("builds.editor.menu.flex_label")}</label>
                    <Input
                        id="{id}-flex"
                        inputmode="numeric"
                        bind:value={flex}
                        aria-invalid={flexValue === undefined}
                        autocomplete="off"
                    />
                </div>
            </div>
            {#if !valid}
                <p role="alert" class="text-sm text-destructive">{t("builds.editor.menu.whole_number")}</p>
            {/if}
            <div class="flex justify-end gap-2">
                <Button variant="outline" type="button" onclick={() => (open = false)}>
                    {t("builds.editor.menu.cancel")}
                </Button>
                <Button type="submit" disabled={!valid || !entry}>{t("builds.editor.menu.save")}</Button>
            </div>
        </form>
    </Dialog.Content>
</Dialog.Root>
