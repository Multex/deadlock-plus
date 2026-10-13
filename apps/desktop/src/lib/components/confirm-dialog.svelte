<script lang="ts">
    import type { ComponentProps } from "svelte";
    import ConfirmDialog from "@deadlock-plus/ui/confirm-dialog.svelte";
    import { t } from "$lib/core/i18n.svelte";

    type Props = Omit<ComponentProps<typeof ConfirmDialog>, "confirmLabel" | "cancelLabel"> & {
        confirmLabel?: string;
        cancelLabel?: string;
    };

    let { open = $bindable(false), confirmLabel, cancelLabel, ...rest }: Props = $props();
</script>

<ConfirmDialog
    bind:open
    confirmLabel={confirmLabel ?? t("common.confirm")}
    cancelLabel={cancelLabel ?? t("common.cancel")}
    {...rest}
/>
