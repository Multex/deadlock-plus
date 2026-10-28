import type { CardAspect } from "../edition-view";
import type { MusicTrack } from "./music";

export const VIDEO_FPS = 30;
/** About 40 s: long enough to read each story, short enough to keep. Every track loops, so any tempo fills it. */
export const VIDEO_SECONDS = 41;

/** Every size here encoded in Edge with H.264 in hardware at 30 fps; 1440x1440 at 60 fps did not. */
export const VIDEO_SIZES: Record<CardAspect, { width: number; height: number }> = {
    "9:16": { width: 1080, height: 1920 },
    "1:1": { width: 1440, height: 1440 },
    "16:9": { width: 1920, height: 1080 },
};

export interface VideoTimeline {
    fps: number;
    bars: number;
    barSeconds: number;
    frames: number;
    /** `frames / fps`: the audio is cut to this too, so both tracks end together. */
    seconds: number;
}

/** A bar is four beats; every picked track is in 4/4. */
export function barSeconds(bpm: number): number {
    return 240 / bpm;
}

/** Track offsets sit on bar lines, so a whole number of bars from there ends the video on one too. */
export function videoTimeline(track: Pick<MusicTrack, "bpm">, fps = VIDEO_FPS): VideoTimeline {
    const bar = barSeconds(track.bpm);
    // A length of exactly N bars can come out a hair under N in floating point.
    const bars = Math.floor(VIDEO_SECONDS / bar + 1e-9);
    const frames = Math.round(bars * bar * fps);
    return { fps, bars, barSeconds: bar, frames, seconds: frames / fps };
}

export function frameTime(index: number, fps: number): number {
    return index / fps;
}
