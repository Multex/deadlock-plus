<script lang="ts">
    import { pushState } from "$app/navigation";
    import { page } from "$app/state";
    import { MediaQuery } from "svelte/reactivity";

    import * as Dialog from "@deadlock-plus/ui/dialog";
    import { cn } from "@deadlock-plus/ui/utils";

    import ShotViewer from "./shot-viewer.svelte";

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

    const src = $derived(`/screenshots/${name}.webp`);
    const detailSrc = $derived(detail ? `/screenshots/${detail}.webp` : undefined);

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
            <source media={PHONE} srcset={detailSrc} width="4" height="5" />
        {/if}
        <img
            {src}
            alt={closeUp ? `${label}, close-up, shown with sample data` : `${label}, shown with sample data`}
            width="1480"
            height="900"
            loading={eager ? "eager" : "lazy"}
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

<Dialog.Root bind:open={() => open, setOpen}>
    <!-- Edge to edge on a phone. `touch-none` on the whole viewer keeps the browser's own pinch zoom out of it. -->
    <Dialog.Content
        class="inset-0 h-auto max-h-none w-auto max-w-none translate-x-0 translate-y-0 touch-none gap-0 overflow-hidden rounded-none border-0 bg-chrome p-0 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] outline-none select-none lg:inset-8 lg:rounded-lg lg:border"
        onCloseAutoFocus={refocusTrigger}
    >
        <ShotViewer {src} {detailSrc} startOnDetail={closeUp} {label} onclose={() => setOpen(false)} />
    </Dialog.Content>
</Dialog.Root>
