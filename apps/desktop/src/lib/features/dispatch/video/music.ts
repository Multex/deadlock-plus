import { command } from "$lib/core/tauri";

export type MusicTrackId = "postgame" | "title" | "koth" | "menu";

/**
 * A game music track the Dispatch video can play, read from the user's own install at export time. Times are in
 * seconds of the source file: playback starts at `offsetSeconds` and stays on the loud section for at most
 * `maxSeconds`; a track with `loopSeconds` repeats seamlessly at that length instead. Layers play together at
 * their gains.
 */
export interface MusicTrack {
    id: MusicTrackId;
    labelKey: string;
    bpm: number;
    offsetSeconds: number;
    maxSeconds: number | null;
    loopSeconds: number | null;
    layerGains: readonly number[];
}

export const MUSIC_TRACKS: readonly MusicTrack[] = [
    {
        id: "postgame",
        labelKey: "dispatch.video.music.postgame",
        bpm: 155,
        offsetSeconds: 0,
        maxSeconds: 26.4,
        loopSeconds: null,
        layerGains: [1],
    },
    {
        id: "title",
        labelKey: "dispatch.video.music.title",
        bpm: 155,
        offsetSeconds: 43.695,
        maxSeconds: 27.88,
        loopSeconds: null,
        layerGains: [1, 1],
    },
    {
        id: "koth",
        labelKey: "dispatch.video.music.koth",
        bpm: 160,
        offsetSeconds: 0,
        maxSeconds: null,
        loopSeconds: 24,
        layerGains: [0.5, 0.5, 0.5],
    },
    {
        id: "menu",
        labelKey: "dispatch.video.music.menu",
        bpm: 172,
        offsetSeconds: 23.83,
        maxSeconds: 28.2,
        loopSeconds: null,
        layerGains: [1],
    },
];

export function musicTrack(id: MusicTrackId): MusicTrack {
    const track = MUSIC_TRACKS.find((t) => t.id === id);
    if (!track) throw new Error(`no music track "${id}"`);
    return track;
}

/** Each layer's MP3 bytes in layer order, or null when the game or any layer is missing: the export goes silent. */
export async function loadTrack(id: MusicTrackId): Promise<ArrayBuffer[] | null> {
    try {
        const layers = await Promise.all(
            musicTrack(id).layerGains.map((_, layer) => command<ArrayBuffer>("dispatch_music_track", { id, layer })),
        );
        return layers.every((bytes) => bytes.byteLength > 0) ? layers : null;
    } catch (e) {
        console.warn(`[dispatch] music track ${id} unavailable:`, e);
        return null;
    }
}
