<script lang="ts">
    import { Dialog } from "bits-ui";
    import { holdFocusOrigin } from "../focus-return";
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

    $effect.pre(() => {
        if (open) return holdFocusOrigin();
    });
</script>

<Dialog.Root bind:open {onOpenChange} {...rest} />
