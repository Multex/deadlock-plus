import { loadTrack, musicTrack, type MusicTrack, type MusicTrackId } from "./music";
import type { VideoTimeline } from "./timeline";

/** Opus encodes only at 48 kHz; AAC takes it too, so one rate serves both. */
export const AUDIO_SAMPLE_RATE = 48_000;
/** The same fade the user heard the tracks with when picking them. */
export const FADE_IN_SECONDS = 0.3;

export interface AudioPlan {
    sampleRate: number;
    channels: number;
    seconds: number;
    /** Sample frames per channel. */
    length: number;
    /** Where playback starts in the source file. */
    offsetSeconds: number;
    /** Source seconds the track repeats between, for a track that loops. */
    loop: { start: number; end: number } | null;
    fadeIn: { from: number; to: number };
    fadeOut: { from: number; to: number };
    layerGains: readonly number[];
}

/** Planar Float32, one array per channel. */
export interface VideoAudio {
    sampleRate: number;
    planes: Float32Array[];
}

export function audioPlan(track: MusicTrack, timeline: VideoTimeline, sampleRate = AUDIO_SAMPLE_RATE): AudioPlan {
    const { seconds } = timeline;
    return {
        sampleRate,
        channels: 2,
        seconds,
        length: Math.round(seconds * sampleRate),
        offsetSeconds: track.offsetSeconds,
        loop:
            track.loopSeconds === null
                ? null
                : { start: track.offsetSeconds, end: track.offsetSeconds + track.loopSeconds },
        fadeIn: { from: 0, to: FADE_IN_SECONDS },
        fadeOut: { from: seconds - timeline.barSeconds, to: seconds },
        layerGains: track.layerGains,
    };
}

/** -1 dBFS, the ceiling the picks were auditioned at. */
export const PEAK_CEILING = 10 ** (-1 / 20);

/**
 * Summed layers can peak past full scale and clip in the encoder. Scales the whole mix down instead, in place,
 * so the balance and the dynamics stay as they were.
 */
export function capPeak(planes: Float32Array[]): void {
    let peak = 0;
    for (const plane of planes) for (const v of plane) peak = Math.max(peak, Math.abs(v));
    if (peak <= PEAK_CEILING) return;
    const k = PEAK_CEILING / peak;
    for (const plane of planes) for (let i = 0; i < plane.length; i++) plane[i] *= k;
}

export function silence(plan: AudioPlan): VideoAudio {
    return {
        sampleRate: plan.sampleRate,
        planes: Array.from({ length: plan.channels }, () => new Float32Array(plan.length)),
    };
}

/** Decodes and sums the layers through one fade envelope. `layers` are MP3 bytes in the track's layer order. */
export async function mixAudio(plan: AudioPlan, layers: ArrayBuffer[]): Promise<VideoAudio> {
    const ctx = new OfflineAudioContext(plan.channels, plan.length, plan.sampleRate);
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, plan.fadeIn.from);
    master.gain.linearRampToValueAtTime(1, plan.fadeIn.to);
    master.gain.setValueAtTime(1, plan.fadeOut.from);
    master.gain.linearRampToValueAtTime(0, plan.fadeOut.to);
    master.connect(ctx.destination);

    const buffers = await Promise.all(layers.map((bytes) => ctx.decodeAudioData(bytes)));
    buffers.forEach((buffer, i) => {
        const gain = ctx.createGain();
        gain.gain.value = plan.layerGains[i] ?? 1;
        gain.connect(master);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        if (plan.loop) {
            source.loop = true;
            source.loopStart = plan.loop.start;
            source.loopEnd = plan.loop.end;
        }
        source.connect(gain);
        source.start(0, plan.offsetSeconds);
    });

    const rendered = await ctx.startRendering();
    const planes = Array.from({ length: rendered.numberOfChannels }, (_, c) => rendered.getChannelData(c));
    capPeak(planes);
    return { sampleRate: rendered.sampleRate, planes };
}

/** The track's mix for this video, or null when the game music cannot be read or decoded: the video goes silent. */
export async function renderMusic(id: MusicTrackId, timeline: VideoTimeline): Promise<VideoAudio | null> {
    const layers = await loadTrack(id);
    if (!layers) return null;
    try {
        return await mixAudio(audioPlan(musicTrack(id), timeline), layers);
    } catch (e) {
        console.warn(`[dispatch] music track ${id} could not be mixed:`, e);
        return null;
    }
}
