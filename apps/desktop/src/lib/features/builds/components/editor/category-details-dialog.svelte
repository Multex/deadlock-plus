<script lang="ts">
    import { untrack } from "svelte";
    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import * as Dialog from "@deadlock-plus/ui/dialog";
    import Input from "@deadlock-plus/ui/input.svelte";
    import Textarea from "@deadlock-plus/ui/textarea.svelte";
    import { updateCategory } from "$lib/features/builds/editor/document";
    import type { BuildEditor } from "$lib/features/builds/editor/editor.svelte";

    let {
        editor,
        index,
        open = $bindable(false),
        focus = "name",
    }: {
        editor: BuildEditor;
        index: number;
        open?: boolean;
        focus?: "name" | "description";
    } = $props();

    const id = $props.id();
    let name = $state("");
    let description = $state("");

    // Loads once per opening, so an autosave or undo elsewhere does not wipe what is being typed.
    $effect.pre(() => {
        if (!open) return;
        untrack(() => {
            const category = editor.build.modCategories[index];
            name = category?.name ?? "";
            description = category?.description ?? "";
        });
    });

    function save(event: SubmitEvent) {
        event.preventDefault();
        editor.apply(updateCategory(editor.build, index, { name: name.trim(), description: description.trim() }));
        open = false;
    }

    function focusField(event: Event) {
        event.preventDefault();
        document.getElementById(`${id}-${focus}`)?.focus();
    }
</script>

<Dialog.Root bind:open>
    <Dialog.Content class="max-w-md" onOpenAutoFocus={focusField}>
        <Dialog.Title>{t("builds.editor.menu.details_title")}</Dialog.Title>
        <form class="flex flex-col gap-4" onsubmit={save}>
            <div class="flex flex-col gap-1.5">
                <label for="{id}-name" class="text-sm font-medium">{t("builds.editor.menu.name")}</label>
                <Input id="{id}-name" bind:value={name} autocomplete="off" />
            </div>
            <div class="flex flex-col gap-1.5">
                <label for="{id}-description" class="text-sm font-medium">
                    {t("builds.editor.menu.description_label")}
                </label>
                <Textarea id="{id}-description" rows={4} bind:value={description} />
            </div>
            <div class="flex justify-end gap-2">
                <Button variant="outline" type="button" onclick={() => (open = false)}>
                    {t("builds.editor.menu.cancel")}
                </Button>
                <Button type="submit">{t("builds.editor.menu.save")}</Button>
            </div>
        </form>
    </Dialog.Content>
</Dialog.Root>
