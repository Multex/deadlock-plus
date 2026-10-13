<script lang="ts">
    import { t } from "$lib/core/i18n.svelte";
    import * as AlertDialog from "@deadlock-plus/ui/alert-dialog";

    type Props = {
        open: boolean;
        copy: { title: string; body: string } | null;
        clearing: boolean;
        onconfirm: () => void;
        onclose: () => void;
    };

    let { open, copy, clearing, onconfirm, onclose }: Props = $props();
</script>

<AlertDialog.Root
    {open}
    onOpenChange={(next) => {
        if (!next && !clearing) onclose();
    }}
>
    <AlertDialog.Content class="max-w-md">
        <div class="flex flex-col gap-1.5">
            <AlertDialog.Title>{copy?.title}</AlertDialog.Title>
            <AlertDialog.Description>{copy?.body}</AlertDialog.Description>
        </div>
        <AlertDialog.Footer>
            <AlertDialog.Cancel>{t("storage.dialog.cancel")}</AlertDialog.Cancel>
            <AlertDialog.Action variant="destructive" onclick={onconfirm} disabled={clearing}
                >{t("storage.dialog.clear")}</AlertDialog.Action
            >
        </AlertDialog.Footer>
    </AlertDialog.Content>
</AlertDialog.Root>
