<script lang="ts">
    import { onDestroy, onMount, untrack } from "svelte";
    import { toast } from "svelte-sonner";
    import { Check, Download, RotateCcw, TriangleAlert, X } from "@lucide/svelte";

    import { failureText } from "$lib/core/errors";
    import { t } from "$lib/core/i18n.svelte";
    import Button from "@deadlock-plus/ui/button.svelte";
    import type { CardAspect, EditionView } from "../edition-view";
    import { afterVideoExport, type VideoStatus } from "../components/share-sheet";
    import { exportVideo, videoSupport, type VideoSupport } from "./export-video";
    import type { MusicTrackId } from "./music";
    import type { VideoKind } from "./scene";
    import { VIDEO_SIZES } from "./timeline";

    /** The video's actions: save, its progress, cancel, and how it ended. `status` drives the sheet's preview. */
    let {
        view,
        kind,
        aspect,
        track,
        fileName,
        seconds,
        status = $bindable({ state: "idle" }),
    }: {
        view: EditionView;
        kind: VideoKind;
        aspect: CardAspect;
        track: MusicTrackId;
        fileName: string;
        seconds: number;
        status?: VideoStatus;
    } = $props();

    /** `undefined` while the probe runs. */
    let support = $state<VideoSupport | undefined>(undefined);
    let controller: AbortController | null = null;

    const size = $derived(VIDEO_SIZES[aspect]);

    onMount(() => {
        void videoSupport().then((found) => (support = found));
    });
    onDestroy(() => controller?.abort());

    // A finished or failed save belongs to the shape and track it was made with.
    $effect(() => {
        void [aspect, track];
        untrack(() => {
            if (status.state === "done" || status.state === "error") status = { state: "idle" };
        });
    });

    async function save() {
        if (!support || status.state === "encoding") return;
        const own = new AbortController();
        controller = own;
        const name = fileName;
        status = { state: "encoding", progress: 0 };
        const result = await exportVideo({
            view,
            kind,
            aspect,
            track,
            audioCodec: support.audioCodec,
            signal: own.signal,
            onProgress: (done) => {
                if (controller === own) status = { state: "encoding", progress: done };
            },
        });
        if (controller !== own) return;
        controller = null;
        status = afterVideoExport(result, name);
        if (result.status === "saved")
            toast.success(t(result.silent ? "dispatch.video.saved_silent" : "dispatch.video.saved"));
    }
</script>

<div class="video-actions" data-video-state={support === null ? "unsupported" : status.state}>
    {#if support === null}
        <p class="note" role="status">{t("dispatch.video.unsupported")}</p>
    {:else if status.state === "encoding"}
        <div class="busy" role="status">
            <span class="pct tabular-nums">{Math.round(status.progress * 100)}%</span>
            <div class="grow">
                <span class="what">{t("dispatch.video.progress")}</span>
                <span
                    class="meter"
                    role="progressbar"
                    aria-label={t("dispatch.video.progress")}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(status.progress * 100)}
                    ><i style="width: {status.progress * 100}%"></i></span
                >
            </div>
            <Button variant="outline" size="lg" onclick={() => controller?.abort()}>
                <X aria-hidden="true" />
                {t("dispatch.video.cancel")}
            </Button>
        </div>
    {:else if status.state === "error"}
        <div class="end err" role="alert">
            <span class="badge"><TriangleAlert aria-hidden="true" /></span>
            <span class="grow what">{failureText(status.error, t("dispatch.share.video_failed"))}</span>
            <Button size="lg" onclick={save}>
                <RotateCcw aria-hidden="true" />
                {t("dispatch.share.retry")}
            </Button>
        </div>
    {:else}
        <Button size="lg" class="big" onclick={save} disabled={support === undefined}>
            {#if status.state === "done"}<Check aria-hidden="true" />{:else}<Download aria-hidden="true" />{/if}
            {t("dispatch.video.save")}
        </Button>
        {#if status.state === "done"}
            <p class="slug" role="status">
                <span class="saved">{t("dispatch.share.video_saved")}</span>
                <span class="file">{status.fileName}</span>
            </p>
        {:else}
            <p class="slug">
                <span class="file">{fileName}</span>
                <span class="meta tabular-nums"
                    >{t("dispatch.share.video_meta", {
                        width: size.width,
                        height: size.height,
                        seconds: Math.round(seconds),
                    })}</span
                >
            </p>
        {/if}
    {/if}
</div>

<style>
    .video-actions {
        display: flex;
        flex: 1;
        align-items: center;
        gap: 16px;
        min-height: 56px;
    }

    .video-actions :global(.big) {
        height: 52px;
        padding: 0 28px;
        font-size: 16px;
    }

    .video-actions :global(.big svg) {
        width: 20px;
        height: 20px;
    }

    .busy,
    .end {
        display: flex;
        flex: 1;
        align-items: center;
        gap: 16px;
    }

    .grow {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
    }

    .pct {
        min-width: 3.2em;
        font:
            400 34px/1.25 "Retail Demo",
            sans-serif;
    }

    .what {
        font-size: 14px;
        font-weight: 600;
    }

    .meter {
        display: block;
        height: 6px;
        border-radius: 3px;
        background: var(--muted);
        overflow: hidden;
    }

    .meter i {
        display: block;
        height: 100%;
        background: var(--primary);
        transition: width 200ms;
    }

    .badge {
        display: grid;
        flex: none;
        place-items: center;
        width: 40px;
        height: 40px;
        border-radius: 10px;
        color: var(--destructive);
        background: color-mix(in oklch, var(--destructive) 14%, transparent);
    }

    .badge :global(svg) {
        width: 20px;
    }

    .err .what {
        color: var(--destructive);
    }

    .slug {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
    }

    .saved {
        font-size: 14px;
        font-weight: 700;
        color: var(--success);
    }

    .file,
    .meta {
        font-size: 12px;
        color: var(--muted-foreground);
        overflow-wrap: anywhere;
    }

    .note {
        font-size: 14px;
        color: var(--muted-foreground);
    }
</style>
