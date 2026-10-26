import {
    AudioSample,
    AudioSampleSource,
    BufferTarget,
    CanvasSource,
    Mp4OutputFormat,
    Output,
    Quality,
} from "mediabunny";

import { SCENES, SCENE_FONTS, type SceneAssets, type SceneTiming, type VideoKind } from "./scene";
import type { VideoAudio } from "./audio";
import { frameTime } from "./timeline";
import type { EditionView } from "../edition-view";

export interface WorkerFont {
    family: string;
    data: ArrayBuffer;
    descriptors: FontFaceDescriptors;
}

export interface EncodeJob {
    kind: VideoKind;
    width: number;
    height: number;
    timing: SceneTiming;
    frames: number;
    videoBitrate: number;
    audioCodec: "aac" | "opus";
    audioBitrate: number;
    /** Planar samples exactly as long as the video; the worker writes silence of that length when null. */
    audio: VideoAudio | null;
    audioLength: number;
    audioSampleRate: number;
    fonts: WorkerFont[];
    images: Record<string, ImageBitmap>;
    view: EditionView;
}

export type EncodeRequest = { type: "start"; job: EncodeJob } | { type: "cancel" };

export type EncodeReply =
    | { type: "progress"; done: number }
    | { type: "done"; bytes: ArrayBuffer }
    | { type: "cancelled" }
    | { type: "error"; message: string };

type Acceleration = "no-preference" | "prefer-software";

const scope = self as unknown as {
    fonts: FontFaceSet;
    onmessage: ((e: MessageEvent<EncodeRequest>) => void) | null;
    postMessage(message: EncodeReply, options?: StructuredSerializeOptions): void;
};

const controller = new AbortController();
const post = (reply: EncodeReply, transfer: Transferable[] = []) => scope.postMessage(reply, { transfer });

async function loadFonts(fonts: WorkerFont[]): Promise<void> {
    for (const { family, data, descriptors } of fonts) {
        const face = new FontFace(family, data, descriptors);
        await face.load();
        scope.fonts.add(face);
    }
}

function audioSample(job: EncodeJob): AudioSample {
    const planes = job.audio?.planes ?? Array.from({ length: 2 }, () => new Float32Array(job.audioLength));
    const frames = planes[0].length;
    const data = new Float32Array(frames * planes.length);
    planes.forEach((plane, i) => data.set(plane, i * frames));
    return new AudioSample({
        data,
        format: "f32-planar",
        numberOfChannels: planes.length,
        sampleRate: job.audio?.sampleRate ?? job.audioSampleRate,
        timestamp: 0,
    });
}

/** Null when cancelled. */
async function encode(job: EncodeJob, acceleration: Acceleration, signal: AbortSignal): Promise<ArrayBuffer | null> {
    const canvas = new OffscreenCanvas(job.width, job.height);
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("no 2D context on the OffscreenCanvas");

    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
    const video = new CanvasSource(canvas, {
        codec: "avc",
        quality: new Quality({ bitrate: job.videoBitrate }),
        keyFrameInterval: 2,
        hardwareAcceleration: acceleration,
    });
    output.addVideoTrack(video, { frameRate: job.timing.fps });
    const audio = new AudioSampleSource({ codec: job.audioCodec, quality: new Quality({ bitrate: job.audioBitrate }) });
    output.addAudioTrack(audio);

    try {
        await output.start();
        const sample = audioSample(job);
        await audio.add(sample);
        sample.close();
        audio.close();

        const scene = SCENES[job.kind];
        const size = { w: job.width, h: job.height };
        const assets: SceneAssets = { view: job.view, images: job.images, fonts: SCENE_FONTS, timing: job.timing };
        const { fps } = job.timing;
        for (let i = 0; i < job.frames; i++) {
            if (signal.aborted) {
                await output.cancel();
                return null;
            }
            ctx.save();
            scene(ctx, frameTime(i, fps), size, assets);
            ctx.restore();
            // The timestamp is the frame's slot, not the wall clock, so a slow frame never shifts the timing.
            await video.add(frameTime(i, fps), 1 / fps);
            if (i % 10 === 0) post({ type: "progress", done: i / job.frames });
        }
        video.close();
        await output.finalize();
    } catch (e) {
        if (output.state !== "canceled" && output.state !== "finalized") await output.cancel().catch(() => {});
        throw e;
    }
    if (!target.buffer) throw new Error("the muxer finished without a file");
    post({ type: "progress", done: 1 });
    return target.buffer;
}

async function run(job: EncodeJob): Promise<void> {
    await loadFonts(job.fonts);
    let bytes: ArrayBuffer | null;
    try {
        bytes = await encode(job, "no-preference", controller.signal);
    } catch (e) {
        if (controller.signal.aborted) return post({ type: "cancelled" });
        // Some hardware encoders accept the config and then fail on the first frames (1440x1440 at 60 fps in Edge).
        console.warn("[dispatch] video encoder failed, retrying in software:", e);
        bytes = await encode(job, "prefer-software", controller.signal);
    }
    if (!bytes) return post({ type: "cancelled" });
    post({ type: "done", bytes }, [bytes]);
}

scope.onmessage = ({ data }) => {
    if (data.type === "cancel") return controller.abort();
    run(data.job).catch((e: unknown) =>
        post({ type: "error", message: e instanceof Error ? `${e.name}: ${e.message}` : String(e) }),
    );
};
