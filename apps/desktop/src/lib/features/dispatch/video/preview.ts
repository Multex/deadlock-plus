import type { EditionView } from "../edition-view";
import { sceneInputs, type SceneInputs } from "./export-video";
import { musicTrack, type MusicTrackId } from "./music";
import { SCENE_FONTS, SCENES, type SceneAssets, type SceneTiming, type VideoKind } from "./scene";
import { videoTimeline } from "./timeline";

/** Where an idle preview starts, as a share of the video: the first frames are still fading in. */
export const PREVIEW_START = 0.08;
/** The moments the sheet's storyboard shows, as shares of the video. */
export const STORYBOARD: readonly number[] = [PREVIEW_START, 0.22, 0.38, 0.54, 0.7, 0.86];
/** The end card, where a saved video's preview rests. */
const PREVIEW_END = 0.97;

export function sceneTiming(track: MusicTrackId): SceneTiming {
    const tl = videoTimeline(musicTrack(track));
    return { seconds: tl.seconds, fps: tl.fps, bars: tl.bars, barSeconds: tl.barSeconds };
}

/**
 * One load per edition and kind, kept while the view's words stay the same: the page rebuilds its view as a new
 * object whenever the store moves, and each load decodes every picture again.
 */
const loaded = new Map<string, { json: string; inputs: Promise<SceneInputs> }>();

async function documentFonts(): Promise<void> {
    if (typeof document === "undefined") return;
    const faces = [`400 20px '${SCENE_FONTS.display}'`, `700 20px '${SCENE_FONTS.display}'`];
    faces.push(`500 20px '${SCENE_FONTS.body}'`, `600 20px '${SCENE_FONTS.body}'`, `700 20px '${SCENE_FONTS.pulp}'`);
    await Promise.all(faces.map((f) => document.fonts.load(f).catch(() => [])));
}

/** The assets the encode worker gets for this export, built on the main thread so the sheet can draw real frames. */
export async function previewAssets(view: EditionView, kind: VideoKind, track: MusicTrackId): Promise<SceneAssets> {
    const key = `${kind}:${view.id}`;
    const json = JSON.stringify(view);
    let found = loaded.get(key);
    if (!found || found.json !== json) {
        const entry = { json, inputs: sceneInputs(view, kind) };
        loaded.set(key, entry);
        entry.inputs.catch(() => loaded.get(key) === entry && loaded.delete(key));
        found = entry;
    }
    const [inputs] = await Promise.all([found.inputs, documentFonts()]);
    return {
        view: inputs.view,
        images: inputs.images,
        fonts: SCENE_FONTS,
        timing: sceneTiming(track),
        data: inputs.prep?.data,
    };
}

export type PreviewState =
    { state: "idle" } | { state: "encoding"; progress: number } | { state: "done" } | { state: "error" };

/**
 * Which moment of the video the preview shows, and whether it runs from there. `start` is a share of the length;
 * `still` holds an idle preview on it instead of playing, for reduced motion.
 */
export function previewTime(
    status: PreviewState,
    seconds: number,
    start = PREVIEW_START,
    still = false,
): { t: number; playing: boolean } {
    switch (status.state) {
        case "idle":
            return { t: start * seconds, playing: !still };
        case "encoding":
            // The last frame index is one frame short of the length.
            return { t: Math.min(status.progress, PREVIEW_END) * seconds, playing: false };
        case "done":
            return { t: PREVIEW_END * seconds, playing: false };
        case "error":
            return { t: start * seconds, playing: false };
    }
}

/** Paints the scene at `t` seconds into `canvas`, whose pixel size is the frame size. */
export function paintFrame(canvas: HTMLCanvasElement, kind: VideoKind, t: number, assets: SceneAssets): boolean {
    const { width: w, height: h } = canvas;
    if (w === 0 || h === 0) return false;
    // Scenes draw on an offscreen context, as in the worker.
    const off = new OffscreenCanvas(w, h);
    const ctx = off.getContext("2d");
    if (!ctx) return false;
    try {
        SCENES[kind](ctx, t, { w, h }, assets);
    } catch (e) {
        console.warn("[dispatch] video preview frame failed:", kind, t, e);
        return false;
    }
    canvas.getContext("2d")?.drawImage(off, 0, 0);
    return true;
}
