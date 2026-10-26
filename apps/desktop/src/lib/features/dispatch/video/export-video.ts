import { saveBinaryFile } from "$lib/core/files";
import { heroPortrait } from "../art";
import type { CardAspect, EditionView } from "../edition-view";
import { AUDIO_SAMPLE_RATE, audioPlan, renderMusic, type VideoAudio } from "./audio";
import type { EncodeJob, EncodeReply, EncodeRequest, WorkerFont } from "./encode.worker";
import { musicTrack, type MusicTrackId } from "./music";
import { SCENE_FONTS, type ScenePrep, type VideoKind } from "./scene";
import { VIDEO_FPS, VIDEO_SIZES, videoTimeline } from "./timeline";

import brandMark from "../../../../../../../packages/ui/src/brand-mark.png";
import retailDemoRegular from "../../../../../../../packages/ui/src/fonts/retaildemo-regular.otf?url";
import retailDemoBold from "../../../../../../../packages/ui/src/fonts/retaildemo-bold.otf?url";
import valveOracleMedium from "../../../../../../../packages/ui/src/fonts/valveoracle-medium.ttf?url";
import valveOracleSemibold from "../../../../../../../packages/ui/src/fonts/valveoracle-semibold.ttf?url";
import valvePulpBold from "../../../../../../../packages/ui/src/fonts/valvepulp-bold.ttf?url";

/** About 40 s at this rate came to 21-38 MB in Edge, under the 64 MB a save may carry. */
export const VIDEO_BITRATE = 8_000_000;
export const AUDIO_BITRATE = 128_000;
/** The backend refuses a save name longer than this. */
const MAX_FILE_NAME = 100;
/** Hero portraits handed to the scene, most played first. */
const SCENE_HEROES = 8;

export const DEFAULT_TRACKS: Record<VideoKind, MusicTrackId> = { collectors: "postgame", year_end: "menu" };

type Prepare = (view: EditionView) => Promise<ScenePrep>;
/** Loaded on export only: a prepare step reaches into the archive, rank tiers and heroes. */
const SCENE_PREP: Partial<Record<VideoKind, () => Promise<{ prepareScene: Prepare }>>> = {
    collectors: () => import("./scenes/collectors/prepare"),
    year_end: () => import("./scenes/year_end/prepare"),
};

const FONT_FILES: { family: string; url: string; weight: string }[] = [
    { family: SCENE_FONTS.display, url: retailDemoRegular, weight: "400" },
    { family: SCENE_FONTS.display, url: retailDemoBold, weight: "700" },
    { family: SCENE_FONTS.body, url: valveOracleMedium, weight: "500" },
    { family: SCENE_FONTS.body, url: valveOracleSemibold, weight: "600" },
    { family: SCENE_FONTS.pulp, url: valvePulpBold, weight: "700" },
];

export type VideoSupport = { audioCodec: "aac" | "opus" } | null;

export interface EncodeProbe {
    canEncodeVideo: (
        codec: "avc",
        options: { width: number; height: number; frameRate: number; bitrate: number },
    ) => Promise<boolean>;
    canEncodeAudio: (
        codec: "aac" | "opus",
        options: { numberOfChannels: number; sampleRate: number; bitrate: number },
    ) => Promise<boolean>;
}

/** No H.264 means no video; AAC is what every platform takes, Opus in MP4 the fallback some players read. */
export function pickSupport(found: { avc: boolean; aac: boolean; opus: boolean }): VideoSupport {
    if (!found.avc) return null;
    if (found.aac) return { audioCodec: "aac" };
    if (found.opus) return { audioCodec: "opus" };
    return null;
}

async function mediabunnyProbe(): Promise<EncodeProbe> {
    const { Quality, canEncodeAudio, canEncodeVideo } = await import("mediabunny");
    return {
        canEncodeVideo: (codec, { bitrate, ...options }) =>
            canEncodeVideo(codec, { ...options, quality: new Quality({ bitrate }) }),
        canEncodeAudio: (codec, { bitrate, ...options }) =>
            canEncodeAudio(codec, { ...options, quality: new Quality({ bitrate }) }),
    };
}

export async function probeVideoSupport(deps?: EncodeProbe): Promise<VideoSupport> {
    try {
        const probe = deps ?? (await mediabunnyProbe());
        const sizes = await Promise.all(
            Object.values(VIDEO_SIZES).map(({ width, height }) =>
                probe.canEncodeVideo("avc", { width, height, frameRate: VIDEO_FPS, bitrate: VIDEO_BITRATE }),
            ),
        );
        const audio = { numberOfChannels: 2, sampleRate: AUDIO_SAMPLE_RATE, bitrate: AUDIO_BITRATE };
        const aac = await probe.canEncodeAudio("aac", audio);
        const opus = !aac && (await probe.canEncodeAudio("opus", audio));
        return pickSupport({ avc: sizes.every(Boolean), aac, opus });
    } catch (e) {
        console.warn("[dispatch] video encoding probe failed:", e);
        return null;
    }
}

let probed: Promise<VideoSupport> | null = null;

/** Probed once per app run: the answer is the system's and does not change. */
export function videoSupport(): Promise<VideoSupport> {
    probed ??= probeVideoSupport();
    return probed;
}

const slug = (text: string) =>
    text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

const KIND_NAMES: Record<VideoKind, string> = { collectors: "collectors-copy", year_end: "year-end-special" };

export function videoFileName(editionId: string, kind: VideoKind, aspect: CardAspect): string {
    const id = editionId.startsWith(`${kind}-`) ? editionId.slice(kind.length + 1) : editionId;
    const head = `deadlock-plus-${KIND_NAMES[kind]}-`;
    const tail = `-${aspect.replace(":", "x")}.mp4`;
    return (
        head +
        slug(id)
            .slice(0, MAX_FILE_NAME - head.length - tail.length)
            .replace(/-+$/, "") +
        tail
    );
}

async function loadFonts(): Promise<WorkerFont[]> {
    return Promise.all(
        FONT_FILES.map(async ({ family, url, weight }) => {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`font ${url}: HTTP ${res.status}`);
            return { family, data: await res.arrayBuffer(), descriptors: { weight } };
        }),
    );
}

/** `asset:` art is not reachable by `fetch` under the app's CSP, but `<img>` loads it with CORS headers. */
async function bitmap(src: string | null): Promise<ImageBitmap | null> {
    if (!src) return null;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    try {
        await img.decode();
        return await createImageBitmap(img);
    } catch {
        return null;
    }
}

async function loadImages(view: EditionView, extra: ScenePrep["images"]): Promise<Record<string, ImageBitmap>> {
    const heroes = view.heroes.slice(0, SCENE_HEROES);
    const sources: [string, Promise<string | null>][] = [
        ["brand", Promise.resolve(brandMark)],
        ["photo", Promise.resolve(view.photo?.src ?? null)],
        ...heroes.map((h): [string, Promise<string | null>] => [`hero:${h.id}`, heroPortrait(h.id)]),
        ...Object.entries(extra).map(([key, src]): [string, Promise<string | null>] => [key, Promise.resolve(src)]),
    ];
    const loaded = await Promise.all(sources.map(async ([key, src]) => [key, await bitmap(await src)] as const));
    return Object.fromEntries(loaded.filter((entry): entry is [string, ImageBitmap] => entry[1] !== null));
}

function encodeInWorker(
    job: EncodeJob,
    signal: AbortSignal,
    onProgress: (done: number) => void,
): Promise<ArrayBuffer | null> {
    const worker = new Worker(new URL("./encode.worker.ts", import.meta.url), { type: "module" });
    const send = (request: EncodeRequest, transfer: Transferable[] = []) => worker.postMessage(request, transfer);
    const cancel = () => send({ type: "cancel" });
    return new Promise<ArrayBuffer | null>((resolve, reject) => {
        signal.addEventListener("abort", cancel, { once: true });
        const settle = () => {
            signal.removeEventListener("abort", cancel);
            worker.terminate();
        };
        worker.onmessage = ({ data }: MessageEvent<EncodeReply>) => {
            if (data.type === "progress") return onProgress(data.done);
            settle();
            if (data.type === "done") resolve(data.bytes);
            else if (data.type === "cancelled") resolve(null);
            else reject(new Error(data.message));
        };
        worker.onerror = (e) => {
            settle();
            reject(new Error(e.message || "the video worker did not start"));
        };
        send({ type: "start", job }, [...job.fonts.map((f) => f.data), ...Object.values(job.images)]);
    });
}

export type VideoExportResult =
    | { status: "saved"; silent: boolean }
    | { status: "dismissed" }
    | { status: "cancelled" }
    | { status: "failed"; error: unknown };

export interface VideoExportRequest {
    view: EditionView;
    kind: VideoKind;
    aspect: CardAspect;
    track: MusicTrackId;
    audioCodec: "aac" | "opus";
    signal: AbortSignal;
    onProgress: (done: number) => void;
}

/** Mixes the music, draws and encodes in a worker, then asks where to save. Never throws. */
export async function exportVideo(request: VideoExportRequest): Promise<VideoExportResult> {
    const { kind, aspect, signal } = request;
    try {
        const track = musicTrack(request.track);
        const timeline = videoTimeline(track);
        const plan = audioPlan(track, timeline);
        // The worker cannot clone Svelte's state proxies.
        const view: EditionView = JSON.parse(JSON.stringify(request.view));
        const prepare = SCENE_PREP[kind];
        const prep = prepare ? await (await prepare()).prepareScene(view) : null;
        const [audio, fonts, images] = await Promise.all([
            renderMusic(request.track, timeline),
            loadFonts(),
            loadImages(view, prep?.images ?? {}),
        ]);
        if (signal.aborted) {
            Object.values(images).forEach((image) => image.close());
            return { status: "cancelled" };
        }
        const { width, height } = VIDEO_SIZES[aspect];
        const job: EncodeJob = {
            kind,
            width,
            height,
            timing: {
                seconds: timeline.seconds,
                fps: timeline.fps,
                bars: timeline.bars,
                barSeconds: timeline.barSeconds,
            },
            frames: timeline.frames,
            videoBitrate: VIDEO_BITRATE,
            audioCodec: request.audioCodec,
            audioBitrate: AUDIO_BITRATE,
            audio: audio satisfies VideoAudio | null,
            audioLength: plan.length,
            audioSampleRate: plan.sampleRate,
            fonts,
            images,
            view,
            data: prep?.data,
        };
        const bytes = await encodeInWorker(job, signal, request.onProgress);
        if (!bytes) return { status: "cancelled" };
        const saved = await saveBinaryFile(
            { defaultName: videoFileName(view.id, kind, aspect), extension: "mp4" },
            new Uint8Array(bytes),
        );
        return saved ? { status: "saved", silent: audio === null } : { status: "dismissed" };
    } catch (error) {
        return { status: "failed", error };
    }
}
