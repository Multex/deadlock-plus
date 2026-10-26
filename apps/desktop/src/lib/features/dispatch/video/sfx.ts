import { command } from "$lib/core/tauri";

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
    | "winner_sting";

/** Where a cue's bytes come from: the user's own install, or a file bundled with the app. */
export type SfxSource = { kind: "game" } | { kind: "asset"; url: string };

/**
 * How a cue plays: the stretch of its file and the level it was picked at by ear. `startSeconds` skips the file's
 * lead-in, so the sound's first sample lands on the cue's time.
 */
export interface SfxCueDef {
    source: SfxSource;
    startSeconds: number;
    lengthSeconds: number;
    /** Brings the loudest 100 ms of the stretch to -14 dBFS RMS, the level the picks were heard at. */
    levelDb: number;
    /** Dips the music under the cue, for long loud stings that would otherwise fight it. */
    ducks: boolean;
}

/** One sound a scene plays: `gain` is linear on top of the cue's level, 1 when left out. */
export interface SfxCue<K extends string = SfxCueId> {
    cue: K;
    atSeconds: number;
    gain?: number;
}

const game = (startSeconds: number, lengthSeconds: number, levelDb: number, ducks = false): SfxCueDef => ({
    source: { kind: "game" },
    startSeconds,
    lengthSeconds,
    levelDb,
    ducks,
});

// Each stretch and level is the preview the user picked by ear: from just before the sound's onset through its
// ring-out, with the loudest 100 ms brought to -14 dBFS RMS.
export const SFX_CUES: Readonly<Record<SfxCueId, SfxCueDef>> = {
    shutter: game(0, 0.3, 7.8),
    flash: game(0, 0.72, -0.3),
    grease_pencil: game(0, 0.9, 0.4),
    page: game(0, 0.82, -4),
    type_tick: game(0, 0.18, 1.5),
    slam: game(0.005, 1, -12),
    stand_drop: game(0, 1.44, -6.8),
    foil_glint: game(0.005, 1.37, 5.3),
    foil_rip: game(0, 0.81, -2),
    card_deal: game(0, 1.14, -5.2),
    card_flip: game(0.02, 0.63, 9),
    chase_build: game(0.105, 5.43, -10.9, true),
    holo_reveal: game(0, 3.42, -11.6, true),
    slab_click: game(0, 0.94, -6.7),
    marquee_bulb: game(0, 0.66, 0),
    confetti: game(0, 1.57, -8.6),
    envelope_tear: game(0, 0.82, -6.3),
    spotlight: game(0, 1.49, -10.1, true),
    winner_sting: game(0, 4.12, -11.5, true),
};

/** -1 dBFS, the limiter ceiling the previews were heard through. */
export const CUE_PEAK = 10 ** (-1 / 20);
/** The previews faded out over this long, or a quarter of a shorter stretch, so a cut tail never clicks. */
const FADE_OUT_SECONDS = 0.15;
/** -6 dB: the music stays audible under a sting without fighting it. */
export const DUCK_GAIN = 0.5;
export const DUCK_ATTACK_SECONDS = 0.02;
export const DUCK_RELEASE_SECONDS = 0.2;

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

/** The cue's stretch out of its decoded file, at its level and faded out, with its peak held under -1 dBFS. */
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
    let peak = 0;
    for (const plane of clip) for (const v of plane) peak = Math.max(peak, Math.abs(v));
    if (peak > CUE_PEAK) {
        const k = CUE_PEAK / peak;
        for (const plane of clip) for (let i = 0; i < plane.length; i++) plane[i]! *= k;
    }
    return clip;
}

/** The music's gain per sample: 1, dipping to `DUCK_GAIN` around each ducking cue. Null when nothing ducks. */
function duckEnvelope<K extends string>(
    length: number,
    sampleRate: number,
    cues: readonly SfxCue<K>[],
    clips: ReadonlyMap<K, Float32Array[]>,
    defs: Readonly<Record<K, SfxCueDef>>,
): Float32Array | null {
    let envelope: Float32Array | null = null;
    const attack = Math.round(DUCK_ATTACK_SECONDS * sampleRate);
    const release = Math.round(DUCK_RELEASE_SECONDS * sampleRate);
    for (const { cue, atSeconds } of cues) {
        const clip = clips.get(cue);
        if (!clip || !defs[cue].ducks) continue;
        envelope ??= new Float32Array(length).fill(1);
        const start = Math.round(atSeconds * sampleRate);
        const end = start + (clip[0]?.length ?? 0);
        const to = Math.min(length, end + release);
        for (let i = Math.max(0, start - attack); i < to; i++) {
            const depth = i < start ? 1 - (start - i) / attack : i < end ? 1 : 1 - (i - end) / release;
            const gain = 1 - (1 - DUCK_GAIN) * depth;
            if (gain < envelope[i]!) envelope[i] = gain;
        }
    }
    return envelope;
}

/**
 * Lays each cue over the music, in place: its first sample on the sample nearest `atSeconds`, with the music
 * ducked under cues that duck. A cue without a clip plays nothing; a clip past either end of the video is cut
 * there. A mono clip plays on every channel.
 */
export function mixCues<K extends string>(
    music: Float32Array[],
    sampleRate: number,
    cues: readonly SfxCue<K>[],
    clips: ReadonlyMap<K, Float32Array[]>,
    defs: Readonly<Record<K, SfxCueDef>>,
): void {
    const length = music[0]?.length ?? 0;
    const envelope = duckEnvelope(length, sampleRate, cues, clips, defs);
    if (envelope) for (const plane of music) for (let i = 0; i < length; i++) plane[i]! *= envelope[i]!;
    for (const { cue, atSeconds, gain = 1 } of cues) {
        const clip = clips.get(cue);
        if (!clip || clip.length === 0) continue;
        const start = Math.round(atSeconds * sampleRate);
        music.forEach((plane, c) => {
            const source = clip[c % clip.length]!;
            const to = Math.min(source.length, length - start);
            for (let i = Math.max(0, -start); i < to; i++) plane[start + i]! += source[i]! * gain;
        });
    }
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
