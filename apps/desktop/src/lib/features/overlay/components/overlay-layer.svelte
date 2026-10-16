<script lang="ts">
    import { onMount } from "svelte";
    import type { OverlayPosition } from "@deadlock-plus/ipc-types/OverlayPosition";
    import { announceReady, onOverlayPosition, onOverlayToast } from "../api";
    import { NO_TOASTS, cornerPosition, createToastQueue, stackOrder, type OverlayToasts } from "../toasts";
    import OverlayCard from "./overlay-card.svelte";

    // Every position sits at the screen edge, and the center slot at the screen center; a toast covers whatever HUD
    // is there while it shows.
    const STACK: Record<OverlayPosition, string> = {
        topLeft: "top-[1.5em] left-[1.5em] items-start",
        topCenter: "top-[1.5em] left-1/2 -translate-x-1/2 items-center",
        topRight: "top-[1.5em] right-[1.5em] items-end",
        left: "top-1/2 left-[1.5em] -translate-y-1/2 items-start",
        right: "top-1/2 right-[1.5em] -translate-y-1/2 items-end",
        bottomLeft: "bottom-[1.5em] left-[1.5em] items-start",
        bottomCenter: "bottom-[1.5em] left-1/2 -translate-x-1/2 items-center",
        bottomRight: "bottom-[1.5em] right-[1.5em] items-end",
    };

    let toasts = $state.raw<OverlayToasts>(NO_TOASTS);

    const position = $derived(cornerPosition(toasts));
    const cards = $derived(stackOrder(toasts));

    onMount(() => {
        const queue = createToastQueue(
            {
                now: () => Date.now(),
                setTimeout: (cb, ms) => setTimeout(cb, ms),
                clearTimeout: (h) => clearTimeout(h as number),
            },
            (next) => (toasts = next),
        );
        let stopped = false;
        let unlisten: (() => void) | undefined;
        let unlistenPosition: (() => void) | undefined;

        void onOverlayPosition((position) => queue.reposition(position))
            .then((stop) => (stopped ? stop() : (unlistenPosition = stop)))
            .catch((e) => console.error("overlay listen failed:", e));

        // Rust queues toasts until it hears ready, so the listener must be in place first.
        void onOverlayToast((toast) => queue.push(toast))
            .then((stop) => {
                if (stopped) return stop();
                unlisten = stop;
                return announceReady();
            })
            .catch((e) => console.error("overlay listen failed:", e));

        return () => {
            stopped = true;
            unlisten?.();
            unlistenPosition?.();
            queue.dispose();
        };
    });
</script>

<main class="pointer-events-none fixed inset-0 overflow-hidden text-[length:max(14px,calc(100vh/90))] select-none">
    <div class="absolute flex flex-col gap-[0.75em] {STACK[position]}" data-position={position} aria-live="polite">
        {#each cards as shown (shown.toast.id)}
            <div data-toast-id={shown.toast.id}>
                <OverlayCard toast={shown.toast} size="corner" />
            </div>
        {/each}
    </div>

    <div class="absolute top-1/2 left-1/2" aria-live="polite">
        {#each toasts.center ? [toasts.center] : [] as shown (shown.toast.id)}
            <div class="absolute top-0 -translate-x-1/2 -translate-y-1/2" data-toast-id={shown.toast.id}>
                <OverlayCard toast={shown.toast} size="center" />
            </div>
        {/each}
    </div>
</main>
