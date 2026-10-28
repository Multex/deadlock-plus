<script lang="ts">
    import { pushState } from "$app/navigation";
    import { page } from "$app/state";
    import type { Component, ComponentProps } from "svelte";
    import { MediaQuery } from "svelte/reactivity";

    import { cn } from "@deadlock-plus/ui/utils";

    import { shotUrl, smallShotUrl } from "$lib/content/shots";
    import type ShotDialog from "./shot-dialog.svelte";

    type Props = {
        name: string;
        label: string;
        /** File name, without extension, of a portrait close-up of the same screenshot, shown in its place on a phone. */
        detail?: string;
        /** The first image on a page loads at once; the rest wait until they are scrolled near. */
        eager?: boolean;
        framed?: boolean;
        class?: string;
    };

    let { name, label, detail, eager = false, framed = true, class: className }: Props = $props();

    const id = $props.id();

    // The open viewer is a history entry of its own, so the Back gesture on a phone closes it and stays on the page.
    const open = $derived((page.state as { shot?: string }).shot === id);
    let leaving = false;
    let trigger = $state<HTMLButtonElement | null>(null);

    const src = $derived(shotUrl(name));
    const detailSrc = $derived(detail ? shotUrl(detail) : undefined);
    const smallDetailSrc = $derived(detail ? smallShotUrl(detail) : undefined);

    // The viewer and its dialog load on the first open, so they stay out of the page's first download.
    let Viewer = $state<Component<ComponentProps<typeof ShotDialog>> | null>(null);
    $effect(() => {
        if (open && !Viewer) import("./shot-dialog.svelte").then((module) => (Viewer = module.default));
    });

    // The same width as the `sm` breakpoint, so the script and the styles agree on what a phone is.
    const PHONE = "(width < 40rem)";
    const phone = new MediaQuery(PHONE, false);
    const closeUp = $derived(detailSrc !== undefined && phone.current);

    $effect(() => {
        if (!open) leaving = false;
    });

    function setOpen(next: boolean) {
        if (next === open) return;
        if (next) {
            pushState("", { ...page.state, shot: id });
        } else if (!leaving) {
            // Going back is not instant; a second request before it lands would leave the page.
            leaving = true;
            history.back();
        }
    }

    function refocusTrigger(e: Event) {
        e.preventDefault();
        trigger?.focus();
    }
</script>

<!-- The outline is drawn inside the shot, so a card that clips its overflow cannot cut it off. -->
<button
    bind:this={trigger}
    type="button"
    aria-label="Expand screenshot: {label}"
    aria-haspopup="dialog"
    class={cn("block w-full cursor-zoom-in -outline-offset-2", framed && "rounded-lg")}
    onclick={() => setOpen(true)}
>
    <!-- Every shot is cropped to the app's window shape from the top, so a taller capture shows its upper part. -->
    <picture>
        {#if detailSrc}
            <source media={PHONE} srcset={smallDetailSrc} width="4" height="5" />
        {/if}
        <img
            {src}
            alt={closeUp ? `${label}, close-up, shown with sample data` : `${label}, shown with sample data`}
            width="1480"
            height="900"
            loading={eager ? "eager" : "lazy"}
            fetchpriority={eager ? "high" : undefined}
            decoding="async"
            class={cn(
                "w-full bg-chrome object-cover object-top",
                detailSrc ? "aspect-[4/5] sm:aspect-[1480/900]" : "aspect-[1480/900]",
                framed && "rounded-lg border border-border",
                className,
            )}
        />
    </picture>
</button>

{#if Viewer}
    <Viewer
        {open}
        onOpenChange={setOpen}
        {src}
        {detailSrc}
        startOnDetail={closeUp}
        {label}
        onCloseAutoFocus={refocusTrigger}
    />
{/if}
