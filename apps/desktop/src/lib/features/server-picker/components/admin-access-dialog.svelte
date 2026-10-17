<script lang="ts">
    import * as AlertDialog from "@deadlock-plus/ui/alert-dialog";
    import Button from "@deadlock-plus/ui/button.svelte";
    import { t } from "$lib/core/i18n.svelte";
    import { adminAccess } from "$lib/features/admin-access/admin-access.svelte";
    import type { AdminPrompt } from "../admin-prompt.svelte";

    let { prompt }: { prompt: AdminPrompt } = $props();

    let open = $state(false);
    let title = $state("");

    // Kept after the prompt clears so the title does not blank out while the dialog closes.
    $effect.pre(() => {
        open = prompt.pending !== null;
        if (prompt.pending) title = prompt.pending.title;
    });

    const buttons = $derived(adminAccess.buttons.kind === "prompt" ? adminAccess.buttons : null);
    const disabled = $derived(adminAccess.busy || buttons?.disabled != null);

    function onOpenChange(next: boolean) {
        if (!next) prompt.dismiss();
    }
</script>

<AlertDialog.Root bind:open {onOpenChange}>
    <AlertDialog.Content class="max-w-md">
        <div class="flex flex-col gap-1.5">
            <AlertDialog.Title>{title}</AlertDialog.Title>
            <AlertDialog.Description>{t("server_picker.admin_needed.description")}</AlertDialog.Description>
        </div>
        <AlertDialog.Footer class="sm:items-center">
            {#if buttons?.disabled === "after_match"}
                <span class="text-xs text-muted-foreground sm:mr-auto">{t("admin_access.after_match")}</span>
            {/if}
            <AlertDialog.Cancel disabled={adminAccess.busy}>{t("common.cancel")}</AlertDialog.Cancel>
            {#if buttons?.allow}
                <Button variant="outline" {disabled} onclick={() => prompt.allow(false)}>
                    {t("admin_access.allow")}
                </Button>
            {/if}
            <Button {disabled} onclick={() => prompt.allow(true)}>{t("admin_access.always_allow")}</Button>
        </AlertDialog.Footer>
    </AlertDialog.Content>
</AlertDialog.Root>
