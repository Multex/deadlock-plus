<script lang="ts">
    import { onMount } from "svelte";
    import type { OverlayPosition } from "@deadlock-plus/ipc-types/OverlayPosition";
    import { error } from "$lib/core/log";
    import { announceReady, onOverlayPosition, onOverlayToast } from "../api";
    import { NO_TOASTS, cornerPosition, createToastQueue, parseToast, stackOrder, type OverlayToasts } from "../toasts";
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

    let { initial = NO_TOASTS }: { initial?: OverlayToasts } = $props();

    // svelte-ignore state_referenced_locally
    let toasts = $state.raw<OverlayToasts>(initial);
    let queue: ReturnType<typeof createToastQueue> | undefined;

    function cardFailed(e: unknown, id: string) {
        void error(`overlay toast ${id} failed to render: ${e instanceof Error ? e.message : String(e)}`);
        queue?.remove(id);
    }

    const position = $derived(cornerPosition(toasts));
    const cards = $derived(stackOrder(toasts));

    onMount(() => {
        queue = createToastQueue(
            {
                now: () => Date.now(),
                setTimeout: (cb, ms) => setTimeout(cb, ms),
                clearTimeout: (h) => clearTimeout(h as number),
            },
            (next) => (toasts = next),
        );
        const live = queue;
        let stopped = false;
        let unlisten: (() => void) | undefined;
        let unlistenPosition: (() => void) | undefined;

        void onOverlayPosition((position) => live.reposition(position))
            .then((stop) => (stopped ? stop() : (unlistenPosition = stop)))
            .catch((e) => console.error("overlay listen failed:", e));

        // Rust queues toasts until it hears ready, so the listener must be in place first.
        void onOverlayToast((payload) => {
            const toast = parseToast(payload);
            if (toast) live.push(toast);
            else void error("overlay dropped a malformed toast payload");
        })
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
            live.dispose();
            queue = undefined;
        };
    });
</script>

<main class="pointer-events-none fixed inset-0 overflow-hidden text-[length:max(14px,calc(100vh/90))] select-none">
    <div class="absolute flex flex-col gap-[0.75em] {STACK[position]}" data-position={position} aria-live="polite">
        {#each cards as shown (shown.toast.id)}
            <div data-toast-id={shown.toast.id}>
                <svelte:boundary onerror={(e) => cardFailed(e, shown.toast.id)}>
                    <OverlayCard toast={shown.toast} size="corner" />
                    {#snippet failed()}{/snippet}
                </svelte:boundary>
            </div>
        {/each}
    </div>

    <div class="absolute top-1/2 left-1/2" aria-live="polite">
        {#each toasts.center ? [toasts.center] : [] as shown (shown.toast.id)}
            <div class="absolute top-0 -translate-x-1/2 -translate-y-1/2" data-toast-id={shown.toast.id}>
                <svelte:boundary onerror={(e) => cardFailed(e, shown.toast.id)}>
                    <OverlayCard toast={shown.toast} size="center" />
                    {#snippet failed()}{/snippet}
                </svelte:boundary>
            </div>
        {/each}
    </div>
</main>
