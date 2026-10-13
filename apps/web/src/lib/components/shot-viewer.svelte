<script lang="ts" module>
    import type { Point } from "./zoom";

    let hintSeen = false;

    const TAP_SLOP = 10;
    const TAP_MS = 300;
    const DOUBLE_TAP_MS = 350;
    const DOUBLE_TAP_SLOP = 40;
    // An arrow key moves the view that way, so the picture slides the other way.
    const KEY_PANS: Record<string, Point | undefined> = {
        ArrowLeft: { x: 80, y: 0 },
        ArrowRight: { x: -80, y: 0 },
        ArrowUp: { x: 0, y: 80 },
        ArrowDown: { x: 0, y: -80 },
    };
    const HINT_MS = 3200;
    // A close-up is captured at three times the app's size. Drawn at half its pixels it still fills a phone's width when
    // fitted, and a double tap doubles it instead of quadrupling it.
    const DETAIL_DENSITY = 2;
</script>

<script lang="ts">
    import { RotateCcw, X, ZoomIn, ZoomOut } from "@lucide/svelte";
    import { onMount, untrack } from "svelte";

    import * as Dialog from "@deadlock-plus/ui/dialog";
    import Button from "@deadlock-plus/ui/button.svelte";
    import IconButton from "@deadlock-plus/ui/icon-button.svelte";
    import { cn } from "@deadlock-plus/ui/utils";

    import {
        clampView,
        fitView,
        isZoomed,
        maxScale,
        panBy,
        pinch,
        toggleZoom,
        zoomAbout,
        zoomStep,
        type Fingers,
        type Frame,
        type Size,
        type View,
    } from "./zoom";

    type Props = {
        src: string;
        /** A portrait close-up of the same screenshot. With one, the viewer offers a switch between the two. */
        detailSrc?: string;
        startOnDetail?: boolean;
        label: string;
        onclose: () => void;
    };

    let { src, detailSrc, startOnDetail = false, label, onclose }: Props = $props();

    let wantsDetail = $state(untrack(() => startOnDetail));
    const showingDetail = $derived(wantsDetail && detailSrc !== undefined);
    const shownSrc = $derived(showingDetail && detailSrc ? detailSrc : src);

    let stage = $state<HTMLDivElement | null>(null);
    let picture = $state<HTMLImageElement | null>(null);
    let stageWidth = $state(0);
    let stageHeight = $state(0);
    let image = $state<Size | null>(null);
    let view = $state<View>({ scale: 1, x: 0, y: 0 });
    // Only steps made with a button, a key or a double tap glide; a drag or a pinch must follow the fingers at once.
    let gliding = $state(false);
    let dragging = $state(false);
    let hint = $state<"shown" | "fading" | null>(null);

    // A view that has not been zoomed keeps fitting when the stage changes size, as on a phone that is turned.
    let fitted = true;

    const frame = $derived<Frame | null>(
        image && stageWidth > 0 && stageHeight > 0
            ? { image, stage: { width: stageWidth, height: stageHeight } }
            : null,
    );
    const zoomed = $derived(frame !== null && isZoomed(view, frame));
    const atMax = $derived(frame !== null && view.scale >= maxScale(frame));

    $effect(() => {
        const next = frame;
        if (!next) return;
        untrack(() => {
            gliding = false;
            view = fitted ? fitView(next) : clampView(view, next);
        });
    });

    $effect(() => {
        if (picture?.complete && picture.naturalWidth > 0) measure();
    });

    onMount(() => {
        if (hintSeen || !window.matchMedia("(pointer: coarse)").matches) return;
        hintSeen = true;
        hint = "shown";
        const timer = setTimeout(() => (hint = "fading"), HINT_MS);
        return () => clearTimeout(timer);
    });

    function measure() {
        if (!picture) return;
        const density = showingDetail ? DETAIL_DENSITY : 1;
        image = { width: picture.naturalWidth / density, height: picture.naturalHeight / density };
    }

    function choose(detail: boolean) {
        if (detail === wantsDetail) return;
        wantsDetail = detail;
        image = null;
        fitted = true;
        gliding = false;
    }

    function show(next: View, glide: boolean) {
        if (!frame) return;
        gliding = glide;
        view = next;
        fitted = !isZoomed(next, frame);
    }

    function step(direction: 1 | -1) {
        if (frame) show(zoomStep(view, direction, frame), true);
    }

    function reset() {
        if (frame) show(fitView(frame), true);
    }

    function onkeydown(e: KeyboardEvent) {
        if (!frame || e.ctrlKey || e.metaKey || e.altKey) return;
        const pan = KEY_PANS[e.key];
        if (e.key === "+" || e.key === "=") step(1);
        else if (e.key === "-" || e.key === "_") step(-1);
        else if (e.key === "0") reset();
        else if (pan) show(panBy(view, pan.x, pan.y, frame), true);
        else return;
        e.preventDefault();
    }

    function gestures(node: HTMLDivElement) {
        const pointers = new Map<number, Point>();
        let pinchStart: { view: View; fingers: Fingers } | null = null;
        let press: { at: Point; time: number } | null = null;
        let lastTap: { at: Point; time: number } | null = null;

        function local(e: PointerEvent | WheelEvent): Point {
            const box = node.getBoundingClientRect();
            return { x: e.clientX - box.left, y: e.clientY - box.top };
        }

        function fingers(): Fingers | null {
            const [a, b] = [...pointers.values()];
            return a && b ? { a, b } : null;
        }

        function down(e: PointerEvent) {
            if (e.pointerType === "mouse" && e.button !== 0) return;
            e.preventDefault();
            node.setPointerCapture(e.pointerId);
            const at = local(e);
            pointers.set(e.pointerId, at);
            if (hint === "shown") hint = "fading";
            if (pointers.size === 1) {
                press = { at, time: e.timeStamp };
                dragging = true;
            } else {
                press = null;
                const held = fingers();
                if (pointers.size === 2 && held) pinchStart = { view, fingers: held };
            }
        }

        function move(e: PointerEvent) {
            const before = pointers.get(e.pointerId);
            if (!before || !frame) return;
            const at = local(e);
            pointers.set(e.pointerId, at);
            if (press && Math.hypot(at.x - press.at.x, at.y - press.at.y) > TAP_SLOP) press = null;
            const held = fingers();
            if (pinchStart && held) show(pinch(pinchStart.view, pinchStart.fingers, held, frame), false);
            else if (pointers.size === 1) show(panBy(view, at.x - before.x, at.y - before.y, frame), false);
        }

        function up(e: PointerEvent) {
            if (!pointers.delete(e.pointerId)) return;
            pinchStart = null;
            if (pointers.size > 0) return;
            dragging = false;
            const tapped = e.type === "pointerup" && press !== null && e.timeStamp - press.time < TAP_MS;
            const at = press?.at;
            press = null;
            if (!tapped || !at || !frame) return;
            const second =
                lastTap !== null &&
                e.timeStamp - lastTap.time < DOUBLE_TAP_MS &&
                Math.hypot(at.x - lastTap.at.x, at.y - lastTap.at.y) < DOUBLE_TAP_SLOP;
            lastTap = second ? null : { at, time: e.timeStamp };
            if (second) show(toggleZoom(view, at, frame), true);
        }

        function wheel(e: WheelEvent) {
            if (!frame) return;
            e.preventDefault();
            const lines = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
            // A trackpad pinch arrives as a wheel event with the control key set and small deltas.
            const factor = Math.exp(-e.deltaY * lines * (e.ctrlKey ? 0.01 : 0.0015));
            show(zoomAbout(view, local(e), view.scale * factor, frame), false);
        }

        function cancel(e: Event) {
            e.preventDefault();
        }

        node.addEventListener("pointerdown", down);
        node.addEventListener("pointermove", move);
        node.addEventListener("pointerup", up);
        node.addEventListener("pointercancel", up);
        node.addEventListener("wheel", wheel, { passive: false });
        // Without this a quick flick leaves the browser waiting to stop a scroll that never ran, and it swallows the
        // next tap on a button. It also stops the page zoom on a browser that ignores `touch-action`.
        node.addEventListener("touchmove", cancel, { passive: false });
        return () => {
            node.removeEventListener("pointerdown", down);
            node.removeEventListener("pointermove", move);
            node.removeEventListener("pointerup", up);
            node.removeEventListener("pointercancel", up);
            node.removeEventListener("wheel", wheel);
            node.removeEventListener("touchmove", cancel);
        };
    }
</script>

<svelte:window {onkeydown} />

<div class="flex items-center gap-3 py-2 pr-2 pl-4">
    <Dialog.Title class="min-w-0 flex-1 truncate text-sm font-semibold">{label}</Dialog.Title>
    <IconButton label="Close screenshot" variant="outline" class="size-12 [&_svg]:size-5" onclick={onclose}>
        <X aria-hidden="true" />
    </IconButton>
</div>

<div
    bind:this={stage}
    bind:clientWidth={stageWidth}
    bind:clientHeight={stageHeight}
    {@attach gestures}
    class={cn(
        "relative min-h-0 flex-1 touch-none overflow-hidden",
        dragging && zoomed ? "cursor-grabbing" : zoomed ? "cursor-grab" : "cursor-zoom-in",
    )}
>
    <!-- A new element for each picture, so the size of the one before is never read as the size of the one loading. -->
    {#key shownSrc}
        <img
            bind:this={picture}
            src={shownSrc}
            alt={showingDetail ? `${label}, close-up, shown with sample data` : `${label}, shown with sample data`}
            decoding="async"
            draggable="false"
            onload={measure}
            class={cn(
                "absolute top-0 left-0 max-w-none origin-top-left select-none",
                gliding && "transition-transform duration-200 ease-out motion-reduce:transition-none",
                !frame && "invisible",
            )}
            style:width={image ? `${image.width}px` : undefined}
            style:height={image ? `${image.height}px` : undefined}
            style:transform="translate3d({view.x}px, {view.y}px, 0) scale({view.scale})"
        />
    {/key}
    {#if hint}
        <p
            class={cn(
                "pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-border bg-card/95 px-3.5 py-2 text-xs font-medium whitespace-nowrap text-foreground shadow-lg transition-opacity duration-500 motion-reduce:transition-none",
                hint === "fading" && "opacity-0",
            )}
        >
            Pinch or double-tap to zoom
        </p>
    {/if}
</div>

<div class="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 px-2 py-2">
    {#if detailSrc}
        <div role="group" aria-label="Which picture to show" class="flex">
            <Button
                variant="toggle"
                class="h-12 rounded-r-none px-4"
                aria-pressed={showingDetail}
                onclick={() => choose(true)}
            >
                Detail<span class="sr-only">, a close-up of the same screenshot</span>
            </Button>
            <Button
                variant="toggle"
                class="-ml-px h-12 rounded-l-none px-4"
                aria-pressed={!showingDetail}
                onclick={() => choose(false)}
            >
                Full window<span class="sr-only">, the whole screenshot</span>
            </Button>
        </div>
    {/if}
    <div class="flex items-center gap-2">
        <IconButton
            label="Zoom out"
            variant="outline"
            class="size-12 aria-disabled:opacity-50 [&_svg]:size-5"
            aria-disabled={!zoomed}
            onclick={() => step(-1)}
        >
            <ZoomOut aria-hidden="true" />
        </IconButton>
        <span class="w-14 text-center text-sm text-muted-foreground tabular-nums" aria-live="polite">
            {Math.round(view.scale * 100)}%
        </span>
        <IconButton
            label="Zoom in"
            variant="outline"
            class="size-12 aria-disabled:opacity-50 [&_svg]:size-5"
            aria-disabled={atMax}
            onclick={() => step(1)}
        >
            <ZoomIn aria-hidden="true" />
        </IconButton>
        <IconButton
            label="Reset zoom"
            variant="outline"
            class="size-12 aria-disabled:opacity-50 [&_svg]:size-5"
            aria-disabled={!zoomed}
            onclick={reset}
        >
            <RotateCcw aria-hidden="true" />
        </IconButton>
    </div>
</div>
