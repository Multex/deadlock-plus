import type { EditionKind } from "@deadlock-plus/stats/dispatch/types";
import type { EditionView } from "../edition-view";
import { placeholderScene } from "./scenes/placeholder";

/** The editions that export a video. */
export type VideoKind = Extract<EditionKind, "collectors" | "year_end">;

export const VIDEO_KINDS: readonly VideoKind[] = ["collectors", "year_end"];

export function isVideoKind(kind: EditionKind): kind is VideoKind {
    return (VIDEO_KINDS as readonly EditionKind[]).includes(kind);
}

/** Family names the worker registers the bundled fonts under; the same names as the app's CSS. */
export const SCENE_FONTS = {
    display: "Retail Demo",
    body: "Valve Oracle",
    pulp: "Valve Pulp",
} as const;

export interface SceneSize {
    w: number;
    h: number;
}

export interface SceneTiming {
    seconds: number;
    fps: number;
    bars: number;
    /** Choreography that lands on `n * barSeconds` hits the music's bar lines. */
    barSeconds: number;
}

/**
 * Everything a scene may draw from. The worker has no DOM, i18n or network: text comes already translated in
 * `view`, art comes decoded. `images` keys: `brand` (the Deadlock+ mark), `photo` (the edition photo) and
 * `hero:<heroId>` for the heroes in `view.heroes`; any of them may be missing, so a scene draws a fallback.
 */
export interface SceneAssets {
    view: EditionView;
    images: Partial<Record<string, ImageBitmap>>;
    fonts: typeof SCENE_FONTS;
    timing: SceneTiming;
}

/**
 * Paints the whole frame at `t` seconds. Must be pure in `t`: frames are drawn once each, in order, but a retry
 * draws them all again, so no state may carry from one call to the next.
 */
export type Scene = (ctx: OffscreenCanvasRenderingContext2D, t: number, size: SceneSize, assets: SceneAssets) => void;

export const SCENES: Record<VideoKind, Scene> = {
    collectors: placeholderScene({ ground: "#0e2a2c", accent: "#c9a227" }),
    year_end: placeholderScene({ ground: "#2a0e14", accent: "#e8d9b5" }),
};
