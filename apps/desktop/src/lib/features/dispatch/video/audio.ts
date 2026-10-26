import { loadTrack, musicTrack, type MusicTrack, type MusicTrackId } from "./music";
import { SFX_CUES, decodeCues, loadSfx, mixCues, type SfxCue } from "./sfx";
import type { VideoTimeline } from "./timeline";

/** Opus encodes only at 48 kHz; AAC takes it too, so one rate serves both. */
export const AUDIO_SAMPLE_RATE = 48_000;
/** The same fade the user heard the tracks with when picking them. */
export const FADE_IN_SECONDS = 0.3;
/**
 * Each loop seam crossfades over this long, centred on the cut. A hard jump between two waveforms clicks; a
 * longer blend would smear the downbeat the loop lands on.
 */
export const SEAM_SECONDS = 0.01;

/** A stretch of the source played straight through: `seconds` long from `from`, at `at` in the video. */
export interface AudioPiece {
    at: number;
    from: number;
    seconds: number;
}

export interface AudioPlan {
    sampleRate: number;
    channels: number;
    seconds: number;
    /** Sample frames per channel. */
    length: number;
    /** Back to back from 0 to `seconds`: the offset to the loop's end, then the loop over and over. */
    pieces: AudioPiece[];
    fadeIn: { from: number; to: number };
    fadeOut: { from: number; to: number };
    layerGains: readonly number[];
}

/** Planar Float32, one array per channel. */
export interface VideoAudio {
    sampleRate: number;
    planes: Float32Array[];
}

export function audioPieces(track: MusicTrack, seconds: number): AudioPiece[] {
    const pieces: AudioPiece[] = [];
    let at = 0;
    let from = track.offsetSeconds;
    while (at < seconds) {
        const length = Math.min(track.loop.end - from, seconds - at);
        pieces.push({ at, from, seconds: length });
        at += length;
        from = track.loop.start;
    }
    return pieces;
}

export function audioPlan(track: MusicTrack, timeline: VideoTimeline, sampleRate = AUDIO_SAMPLE_RATE): AudioPlan {
    const { seconds } = timeline;
    return {
        sampleRate,
        channels: 2,
        seconds,
        length: Math.round(seconds * sampleRate),
        pieces: audioPieces(track, seconds),
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

/**
 * Decodes and sums the layers through one fade envelope. `layers` are MP3 bytes in the track's layer order. The
 * mix is not peak-capped yet: cues go on top first.
 */
export async function mixAudio(plan: AudioPlan, layers: ArrayBuffer[]): Promise<VideoAudio> {
    const ctx = new OfflineAudioContext(plan.channels, plan.length, plan.sampleRate);
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, plan.fadeIn.from);
    master.gain.linearRampToValueAtTime(1, plan.fadeIn.to);
    master.gain.setValueAtTime(1, plan.fadeOut.from);
    master.gain.linearRampToValueAtTime(0, plan.fadeOut.to);
    master.connect(ctx.destination);

    const buffers = await Promise.all(layers.map((bytes) => ctx.decodeAudioData(bytes)));
    const half = SEAM_SECONDS / 2;
    buffers.forEach((buffer, i) => {
        const layer = ctx.createGain();
        layer.gain.value = plan.layerGains[i] ?? 1;
        layer.connect(master);
        plan.pieces.forEach((piece, k) => {
            const first = k === 0;
            const last = k === plan.pieces.length - 1;
            // Past a seam the outgoing piece plays on into what the file holds next while the loop fades in; a
            // piece starting at the file's head has nothing before it, so it starts on the cut.
            const lead = first ? 0 : Math.min(half, piece.from);
            const start = piece.at - lead;
            const end = piece.at + piece.seconds + (last ? 0 : half);
            const gain = ctx.createGain();
            if (!first) {
                gain.gain.setValueAtTime(0, piece.at - half);
                gain.gain.linearRampToValueAtTime(1, piece.at + half);
            }
            if (!last) {
                gain.gain.setValueAtTime(1, end - SEAM_SECONDS);
                gain.gain.linearRampToValueAtTime(0, end);
            }
            gain.connect(layer);
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(gain);
            source.start(start, piece.from - lead, end - start);
        });
    });

    const rendered = await ctx.startRendering();
    const planes = Array.from({ length: rendered.numberOfChannels }, (_, c) => rendered.getChannelData(c));
    return { sampleRate: rendered.sampleRate, planes };
}

/**
 * The track's mix for this video with the sound cues laid over it, or null when the game music cannot be read or
 * decoded: the video goes silent. A cue that cannot be read or decoded plays as silence.
 */
export async function renderMusic(
    id: MusicTrackId,
    timeline: VideoTimeline,
    cues: readonly SfxCue[] = [],
): Promise<VideoAudio | null> {
    const [layers, sfx] = await Promise.all([loadTrack(id), loadSfx(cues.map((c) => c.cue))]);
    if (!layers) return null;
    try {
        const audio = await mixAudio(audioPlan(musicTrack(id), timeline), layers);
        const clips = sfx.size > 0 ? await decodeCues(sfx, audio.sampleRate, SFX_CUES) : new Map();
        mixCues(audio.planes, audio.sampleRate, cues, clips, SFX_CUES);
        capPeak(audio.planes);
        return audio;
    } catch (e) {
        console.warn(`[dispatch] music track ${id} could not be mixed:`, e);
        return null;
    }
}
