<script lang="ts">
    import { AlertDialog } from "bits-ui";
    import { holdFocusOrigin } from "../focus-return";
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

    $effect.pre(() => {
        if (open) return holdFocusOrigin();
    });
</script>

<AlertDialog.Root bind:open {onOpenChange} {...rest} />
