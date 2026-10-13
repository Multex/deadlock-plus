<script lang="ts">
    import { AlertDialog } from "bits-ui";
    import { cn } from "../utils";
    import { getOverlayHost, overlayPlacement } from "../overlay-host";

    let { class: className, ...rest }: AlertDialog.ContentProps = $props();

    const host = getOverlayHost();
    const placement = $derived(overlayPlacement(host));
    // Inside a host the rest of the app stays usable. Without one the dialog covers the page, so it sits above the
    // page content and holds the focus and the scroll.
    const position = $derived(placement?.contained ? "absolute" : "fixed z-(--z-content-overlay)");
</script>

{#if placement}
    <AlertDialog.Portal to={placement.to}>
        <AlertDialog.Overlay
            class={cn(
                position,
                "inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            )}
        />
        <AlertDialog.Content
            trapFocus={!placement.contained}
            preventScroll={!placement.contained}
            class={cn(
                position,
                "left-1/2 top-1/2 grid max-h-[calc(100%-2rem)] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-lg duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
                className,
            )}
            {...rest}
        />
    </AlertDialog.Portal>
{/if}
