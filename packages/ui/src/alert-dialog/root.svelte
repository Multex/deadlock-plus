<script lang="ts">
    import { AlertDialog } from "bits-ui";
    import { getOverlayHost } from "../overlay-host";

    let { open = $bindable(false), onOpenChange, ...rest }: AlertDialog.RootProps = $props();

    const host = getOverlayHost();

    $effect(() => {
        if (!open || !host) return;
        return host.track(() => {
            open = false;
            onOpenChange?.(false);
        });
    });
</script>

<AlertDialog.Root bind:open {onOpenChange} {...rest} />
