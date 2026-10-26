import { command } from "$lib/core/tauri";
import type { VideoKind } from "./scene";
import crowdUrl from "./sfx-assets/crowd.mp3?url";

export type SfxCueId =
    | "shutter"
    | "flash"
    | "grease_pencil"
    | "page"
    | "type_tick"
    | "slam"
    | "stand_drop"
    | "foil_glint"
    | "foil_rip"
    | "card_deal"
    | "card_flip"
    | "chase_build"
    | "holo_reveal"
    | "slab_click"
    | "marquee_bulb"
    | "confetti"
    | "envelope_tear"
    | "spotlight"
    | "winner_sting"
    | "crowd";

/** Where a cue's bytes come from: the user's own install, or a file bundled with the app. */
export type SfxSource = { kind: "game" } | { kind: "asset"; url: string };

/**
 * How a cue plays: the stretch of its file, the level it was picked at by ear, and where it sits in the mix.
 * `startSeconds` skips the file's lead-in, so the sound's first sample lands on the cue's time.
 */
export interface SfxCueDef {
    source: SfxSource;
    startSeconds: number;
    lengthSeconds: number;
    /** Brings the loudest 100 ms of the stretch to -14 dBFS RMS, the level the picks were heard at. */
    levelDb: number;
    /** The cue's loudest 50 ms over the music around it, both as RMS, per profile. */
    mixDb: Readonly<Record<SfxProfile, number>>;
}

/**
 * How a video's cues sit over its music. `featured` lifts each cue clearly over the music, its own peaks held
 * under -1 dBFS; `gentle` seasons the music, each cue just audible and never peaking over the music's own peaks.
 * Neither dips the music.
 */
export type SfxProfile = "featured" | "gentle";

export interface SfxProfileDef {
    /** Over a near-silent stretch (an intro, the fade-out) a cue is placed as if over this, so it never vanishes. */
    floorDb: number;
    /** What a placed cue's own limiter holds its peaks under: -1 dBFS, or the music's own peaks around it. */
    holdUnder: "full_scale" | "music";
}

export const SFX_PROFILES: Readonly<Record<SfxProfile, SfxProfileDef>> = {
    featured: { floorDb: -24, holdUnder: "full_scale" },
    gentle: { floorDb: -30, holdUnder: "music" },
};

/** The Collector's Copy's pack and cards were approved featured; the other videos keep their cues gentle. */
export const VIDEO_SFX_PROFILE: Readonly<Record<VideoKind, SfxProfile>> = {
    collectors: "featured",
    monthly: "gentle",
    year_end: "gentle",
};

/** One sound a scene plays: `gain` is linear on top of the cue's level, 1 when left out. */
export interface SfxCue<K extends string = SfxCueId> {
    cue: K;
    atSeconds: number;
    gain?: number;
}

const game = (
    startSeconds: number,
    lengthSeconds: number,
    levelDb: number,
    gentle: number,
    featured: number,
): SfxCueDef => ({
    source: { kind: "game" },
    startSeconds,
    lengthSeconds,
    levelDb,
    mixDb: { gentle, featured },
});

const asset = (url: string, lengthSeconds: number, gentle: number, featured: number): SfxCueDef => ({
    source: { kind: "asset", url },
    startSeconds: 0,
    lengthSeconds,
    levelDb: 0,
    mixDb: { gentle, featured },
});

// Each stretch and level is the preview the user picked by ear: from just before the sound's onset through its
// ring-out, with the loudest 100 ms brought to -14 dBFS RMS. The game music runs at -8 to -12 dBFS RMS, so at
// that level a cue sits under it. The last two columns place each cue over the music it lands on instead, in dB:
// gentle (ticks and clicks level with the music, the four big moments 3 dB over it), then featured.
export const SFX_CUES: Readonly<Record<SfxCueId, SfxCueDef>> = {
    shutter: game(0, 0.3, 7.8, 1, 6),
    flash: game(0, 0.72, -0.3, 1, 4),
    grease_pencil: game(0, 0.9, 0.4, 1, 5),
    page: game(0, 0.82, -4, 1, 5),
    type_tick: game(0, 0.18, 1.5, 0, 4),
    slam: game(0.005, 1, -12, 3, 7),
    stand_drop: game(0, 1.44, -6.8, 3, 7),
    foil_glint: game(0.005, 1.37, 5.3, 1, 5),
    foil_rip: game(0, 0.81, -2, 2, 6),
    card_deal: game(0, 1.14, -5.2, 1, 5),
    card_flip: game(0.02, 0.63, 9, 0, 5),
    chase_build: game(0.105, 5.43, -10.9, 1, 4),
    holo_reveal: game(0, 3.42, -11.6, 3, 7),
    slab_click: game(0, 0.94, -6.7, 0, 6),
    marquee_bulb: game(0, 0.66, 0, 0, 4),
    confetti: game(0, 1.57, -8.6, 2, 5),
    envelope_tear: game(0, 0.82, -6.3, 2, 6),
    spotlight: game(0, 1.49, -10.1, 2, 5),
    winner_sting: game(0, 4.12, -11.5, 3, 7),
    // The file is the approved preview itself: already at -14 dBFS RMS with its fades baked in.
    crowd: asset(crowdUrl, 5, 0, 4),
};

/** The previews faded out over this long, or a quarter of a shorter stretch, so a cut tail never clicks. */
const FADE_OUT_SECONDS = 0.15;
/** A cue is placed over the music's RMS from this long before it to this long after. */
export const BED_SECONDS = 0.25;
/** A cue's loudness is its loudest window of this long: the transient a listener hears. */
export const CUE_WINDOW_SECONDS = 0.05;
/** -1 dBFS: a featured cue's peaks are limited to this on their own before it is mixed. */
export const CUE_CEILING = 10 ** (-1 / 20);
/** A quiet stretch's peaks sit about this far over its RMS: a gentle cue there may peak this far over the floor. */
export const QUIET_CREST_DB = 12;
/** The most a gentle cue is turned up to make good what holding its spikes under the music took off it. */
export const GENTLE_MAKEUP_DB = 12;
/**
 * A cue's own limiter recovers this fast, so it shaves a click's few loudest milliseconds and keeps its body: a
 * game sound's peak runs 10 to 19 dB over its RMS, and over the music the whole cue would otherwise be held down.
 */
export const CUE_LIMIT_RELEASE_SECONDS = 0.02;
/** How far ahead of a peak a limiter starts turning down, so the gain ramps instead of stepping. */
export const LIMIT_LOOKAHEAD_SECONDS = 0.005;

/** `dispatch_sfx`'s body: per asked cue, a little-endian u32 length then its bytes. Zero length is a missing cue. */
export function parseSfxBody<K extends string>(body: ArrayBuffer, ids: readonly K[]): Map<K, ArrayBuffer> {
    const cues = new Map<K, ArrayBuffer>();
    const view = new DataView(body);
    let at = 0;
    for (const id of ids) {
        if (at + 4 > body.byteLength) break;
        const length = view.getUint32(at, true);
        at += 4;
        if (at + length > body.byteLength) break;
        if (length > 0) cues.set(id, body.slice(at, at + length));
        at += length;
    }
    return cues;
}

async function loadGame<K extends string>(ids: K[]): Promise<Map<K, ArrayBuffer>> {
    if (ids.length === 0) return new Map();
    try {
        return parseSfxBody(await command<ArrayBuffer>("dispatch_sfx", { cues: ids }), ids);
    } catch (e) {
        console.warn("[dispatch] game sound cues unavailable:", e);
        return new Map();
    }
}

async function loadAsset(url: string): Promise<ArrayBuffer | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.arrayBuffer();
    } catch (e) {
        console.warn(`[dispatch] sound cue ${url} unavailable:`, e);
        return null;
    }
}

/** Each cue's encoded bytes. A cue that cannot be read is left out, so it plays as silence. Never throws. */
export async function loadSfx<K extends string = SfxCueId>(
    ids: readonly K[],
    defs: Readonly<Record<K, SfxCueDef>> = SFX_CUES as Readonly<Record<K, SfxCueDef>>,
): Promise<Map<K, ArrayBuffer>> {
    const unique = [...new Set(ids)];
    const fromGame = unique.filter((id) => defs[id].source.kind === "game");
    const assets = unique.flatMap((id) => {
        const source = defs[id].source;
        return source.kind === "asset" ? [{ id, url: source.url }] : [];
    });
    const [cues, loaded] = await Promise.all([
        loadGame(fromGame),
        Promise.all(assets.map(async ({ id, url }) => [id, await loadAsset(url)] as const)),
    ]);
    for (const [id, bytes] of loaded) if (bytes && bytes.byteLength > 0) cues.set(id, bytes);
    return cues;
}

/** The cue's stretch out of its decoded file, at its level and faded out. */
export function cueClip(def: SfxCueDef, planes: Float32Array[], sampleRate: number): Float32Array[] {
    const from = Math.round(def.startSeconds * sampleRate);
    const available = Math.max(0, (planes[0]?.length ?? 0) - from);
    const length = Math.min(Math.round(def.lengthSeconds * sampleRate), available);
    const fade = Math.min(Math.round(Math.min(FADE_OUT_SECONDS, def.lengthSeconds / 4) * sampleRate), length);
    const level = 10 ** (def.levelDb / 20);
    const clip = planes.map((plane) => {
        const out = plane.slice(from, from + length);
        for (let i = 0; i < length; i++) {
            const tail = length - i;
            out[i]! *= tail < fade ? (level * tail) / fade : level;
        }
        return out;
    });
    return clip;
}

const toDb = (meanSquare: number) => 10 * Math.log10(Math.max(meanSquare, 1e-20));

/** RMS in dBFS over samples `[from, to)` of every plane, clamped to the planes. */
function rmsDb(planes: readonly Float32Array[], from: number, to: number): number {
    let sum = 0;
    let n = 0;
    for (const plane of planes) {
        const start = Math.max(0, from);
        const end = Math.min(to, plane.length);
        for (let i = start; i < end; i++) sum += plane[i]! ** 2;
        n += Math.max(0, end - start);
    }
    return toDb(n > 0 ? sum / n : 0);
}

/** The RMS of the clip's loudest `CUE_WINDOW_SECONDS`, in dBFS. */
export function cueLoudnessDb(clip: readonly Float32Array[], sampleRate: number): number {
    const length = clip[0]?.length ?? 0;
    const window = Math.min(length, Math.max(1, Math.round(CUE_WINDOW_SECONDS * sampleRate)));
    const energy = new Float64Array(length);
    for (const plane of clip) for (let i = 0; i < length; i++) energy[i]! += plane[i]! ** 2;
    let sum = 0;
    let loudest = 0;
    for (let i = 0; i < length; i++) {
        sum += energy[i]!;
        if (i >= window) sum -= energy[i - window]!;
        loudest = Math.max(loudest, sum);
    }
    return toDb(loudest / (Math.max(1, window) * Math.max(1, clip.length)));
}

/** Holds every sample under `ceiling`, in place, dipping the gain just ahead of each peak and recovering after. */
export function limit(planes: Float32Array[], sampleRate: number, ceiling: number, releaseSeconds: number): void {
    const length = planes[0]?.length ?? 0;
    const ahead = Math.max(1, Math.round(LIMIT_LOOKAHEAD_SECONDS * sampleRate));
    const step = 1 / Math.max(1, Math.round(releaseSeconds * sampleRate));
    let gain: Float64Array | null = null;
    for (let j = 0; j < length; j++) {
        let peak = 0;
        for (const plane of planes) peak = Math.max(peak, Math.abs(plane[j]!));
        if (peak <= ceiling) continue;
        gain ??= new Float64Array(length).fill(1);
        const need = ceiling / peak;
        for (let i = Math.max(0, j - ahead); i <= j; i++) {
            gain[i] = Math.min(gain[i]!, need + ((1 - need) * (j - i)) / ahead);
        }
    }
    if (!gain) return;
    for (let i = 1; i < length; i++) gain[i] = Math.min(gain[i]!, gain[i - 1]! + step);
    for (const plane of planes) for (let i = 0; i < length; i++) plane[i] = Math.fround(plane[i]! * gain[i]!);
}

/** The largest sample in `[from, to)` of every plane, clamped to the planes. */
function peakIn(planes: readonly Float32Array[], from: number, to: number): number {
    let peak = 0;
    for (const plane of planes) {
        for (let i = Math.max(0, from); i < Math.min(to, plane.length); i++) peak = Math.max(peak, Math.abs(plane[i]!));
    }
    return peak;
}

/**
 * Lays each cue over the music, in place, leaving the music itself untouched: its first sample on the sample
 * nearest `atSeconds`, its loudest 50 ms the profile's `mixDb` over the music around it (never over less than the
 * profile's floor), its peaks held as the profile says, times the cue's `gain`. A cue without a clip plays
 * nothing; a clip past either end of the video is cut there. A mono clip plays on every channel.
 */
export function mixCues<K extends string>(
    music: Float32Array[],
    sampleRate: number,
    cues: readonly SfxCue<K>[],
    clips: ReadonlyMap<K, Float32Array[]>,
    defs: Readonly<Record<K, SfxCueDef>>,
    profile: SfxProfile,
): void {
    const { floorDb, holdUnder } = SFX_PROFILES[profile];
    const length = music[0]?.length ?? 0;
    const bed = Math.round(BED_SECONDS * sampleRate);
    const loudness = new Map([...clips].map(([id, clip]) => [id, cueLoudnessDb(clip, sampleRate)]));
    const placed = cues.map(({ cue, atSeconds }) => {
        const clip = clips.get(cue);
        if (!clip || clip.length === 0) return null;
        const at = Math.round(atSeconds * sampleRate);
        const over = Math.max(rmsDb(music, at - bed, at + bed), floorDb);
        const ceiling =
            holdUnder === "full_scale"
                ? CUE_CEILING
                : Math.max(peakIn(music, at - bed, at + bed), 10 ** ((floorDb + QUIET_CREST_DB) / 20));
        const target = over + defs[cue].mixDb[profile];
        let level = 10 ** ((target - (loudness.get(cue) ?? 0)) / 20);
        const place = () => {
            const out = clip.map((plane) => plane.map((v) => v * level));
            limit(out, sampleRate, ceiling, CUE_LIMIT_RELEASE_SECONDS);
            return out;
        };
        if (holdUnder === "full_scale") return place();
        // Holding a click's spikes under the music's peaks takes its body down with them; make that up, so the
        // cue still reaches its level, at most `GENTLE_MAKEUP_DB` past where it started.
        const start = level;
        let out = place();
        for (let pass = 0; pass < 6; pass++) {
            const short = target - cueLoudnessDb(out, sampleRate);
            if (short < 0.1) break;
            level = Math.min(level * 10 ** (short / 20), start * 10 ** (GENTLE_MAKEUP_DB / 20));
            out = place();
        }
        return out;
    });
    cues.forEach(({ atSeconds, gain = 1 }, k) => {
        const clip = placed[k];
        if (!clip) return;
        const start = Math.round(atSeconds * sampleRate);
        music.forEach((plane, c) => {
            const source = clip[c % clip.length]!;
            const to = Math.min(source.length, length - start);
            for (let i = Math.max(0, -start); i < to; i++) plane[start + i]! += source[i]! * gain;
        });
    });
}

/** Decodes each cue at the mix's rate and cuts it to its clip. A cue that will not decode is left out. */
export async function decodeCues<K extends string>(
    bytes: ReadonlyMap<K, ArrayBuffer>,
    sampleRate: number,
    defs: Readonly<Record<K, SfxCueDef>>,
): Promise<Map<K, Float32Array[]>> {
    const ctx = new OfflineAudioContext(1, 1, sampleRate);
    const decoded = await Promise.all(
        [...bytes].map(async ([id, data]) => {
            try {
                const buffer = await ctx.decodeAudioData(data);
                const planes = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
                return [[id, cueClip(defs[id], planes, buffer.sampleRate)] as const];
            } catch (e) {
                console.warn(`[dispatch] sound cue ${id} could not be decoded:`, e);
                return [];
            }
        }),
    );
    return new Map(decoded.flat());
}
