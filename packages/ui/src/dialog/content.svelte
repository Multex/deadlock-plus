<script lang="ts">
    import { Dialog } from "bits-ui";
    import { cn } from "../utils";
    import { getOverlayHost, overlayPlacement } from "../overlay-host";

    let { class: className, ...rest }: Dialog.ContentProps = $props();

    const host = getOverlayHost();
    const placement = $derived(overlayPlacement(host));
    // Inside a host the rest of the app stays usable. Without one the dialog covers the page, so it sits above the
    // page content and holds the focus and the scroll.
    const position = $derived(placement?.contained ? "absolute" : "fixed z-(--z-content-overlay)");

    // A click on the app around the host is not "outside" the dialog: that part stays live.
    function keepChromeOpen(e: PointerEvent) {
        const el = host?.el;
        if (el && e.target instanceof Node && !el.contains(e.target)) e.preventDefault();
    }
</script>

{#if placement}
    <Dialog.Portal to={placement.to}>
        <Dialog.Overlay
            class={cn(
                position,
                "inset-0 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            )}
        />
        <Dialog.Content
            trapFocus={!placement.contained}
            preventScroll={!placement.contained}
            interactOutsideBehavior="close"
            onInteractOutside={keepChromeOpen}
            class={cn(
                position,
                "left-1/2 top-1/2 flex max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-lg duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
                className,
            )}
            {...rest}
        />
    </Dialog.Portal>
{/if}
