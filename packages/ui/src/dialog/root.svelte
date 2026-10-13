<script lang="ts">
    import { Dialog } from "bits-ui";
    import { getOverlayHost } from "../overlay-host";

    let { open = $bindable(false), onOpenChange, ...rest }: Dialog.RootProps = $props();

    const host = getOverlayHost();

    $effect(() => {
        if (!open || !host) return;
        return host.track(() => {
            open = false;
            onOpenChange?.(false);
        });
    });
</script>

<Dialog.Root bind:open {onOpenChange} {...rest} />
