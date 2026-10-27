<script lang="ts">
    import { untrack } from "svelte";
    import { prefersReducedMotion } from "$lib/core/reduced-motion";
    import type { EditionView } from "../edition-view";
    import type { MusicTrackId } from "../video/music";
    import { paintFrame, previewAssets, previewTime, type PreviewState } from "../video/preview";
    import type { SceneAssets, VideoKind } from "../video/scene";

    /**
     * A real frame of the edition's video, drawn by the same scene the encoder runs. `at` (0 to 1 of the length)
     * holds one still; otherwise `status` picks the moment, and an idle preview plays. `w` x `h` is the box in CSS
     * pixels; `time` reports the moment shown, in seconds.
     */
    let {
        view,
        kind,
        track,
        w,
        h,
        at,
        start,
        status = { state: "idle" },
        time = $bindable(0),
        duration = $bindable(0),
    }: {
        view: EditionView;
        kind: VideoKind;
        track: MusicTrackId;
        w: number;
        h: number;
        at?: number;
        /** Where an idle preview plays from, as a share of the length. */
        start?: number;
        status?: PreviewState;
        time?: number;
        duration?: number;
    } = $props();

    /** A preview at a quarter of the export's rate keeps the dialog light; the saved file runs at the full rate. */
    const FRAME_MS = 66;

    let canvas = $state<HTMLCanvasElement | null>(null);
    let assets = $state.raw<SceneAssets | null>(null);
    let failed = $state(false);

    $effect(() => {
        let live = true;
        const [v, k, tr] = [view, kind, track];
        failed = false;
        // A scene's prepare step reads the Dispatch store; those reads must not restart this load.
        untrack(() => previewAssets(v, k, tr)).then(
            (a) => {
                if (!live) return;
                assets = a;
                duration = a.timing.seconds;
            },
            () => live && (failed = true),
        );
        return () => (live = false);
    });

    const dpr = typeof devicePixelRatio === "number" ? Math.min(2, devicePixelRatio) : 1;

    $effect(() => {
        const c = canvas;
        const a = assets;
        if (!c || !a) return;
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
        const seconds = a.timing.seconds;
        const moment =
            at !== undefined
                ? { t: at * seconds, playing: false }
                : previewTime(status, seconds, start, prefersReducedMotion());
        if (!moment.playing) {
            paintFrame(c, kind, moment.t, a);
            time = moment.t;
            return;
        }
        const t0 = performance.now();
        let raf = 0;
        let last = -Infinity;
        const loop = (now: number) => {
            if (now - last > FRAME_MS) {
                last = now;
                const t = (moment.t + (now - t0) / 1000) % seconds;
                paintFrame(c, kind, t, a);
                time = t;
            }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    });
</script>

<canvas
    bind:this={canvas}
    class="block"
    style="width: {w}px; height: {h}px;"
    data-frame={failed ? "failed" : assets ? "ready" : "loading"}
    aria-hidden="true"
></canvas>
