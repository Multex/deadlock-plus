import { command } from "$lib/core/tauri";

export type MusicTrackId = "postgame" | "title" | "koth" | "menu";

/**
 * A game music track the Dispatch video can play, read from the user's own install at export time. Times are in
 * seconds of the source file: playback starts at `offsetSeconds`, runs to the loop's end, then repeats the loop
 * until the video ends. Each loop spans whole bars where the track repeats itself, inside its loud section; the
 * spans were picked by measuring how closely the bar after the loop's end matches the bar at its start. Layers
 * play together at their gains.
 */
export interface MusicTrack {
    id: MusicTrackId;
    labelKey: string;
    bpm: number;
    offsetSeconds: number;
    loop: { start: number; end: number };
    layerGains: readonly number[];
}

export const MUSIC_TRACKS: readonly MusicTrack[] = [
    {
        id: "postgame",
        labelKey: "dispatch.video.music.postgame",
        bpm: 155,
        offsetSeconds: 0,
        // Bars 12-16 of 17 loud ones; nothing in this track repeats exactly, and these four sit closest.
        loop: { start: 18.5806, end: 24.7742 },
        layerGains: [1],
    },
    {
        id: "title",
        labelKey: "dispatch.video.music.title",
        bpm: 155,
        offsetSeconds: 43.695,
        // The section repeats every five bars; bars 39-44 on the file's own 154.95 BPM grid.
        loop: { start: 60.7331, end: 68.4776 },
        layerGains: [1, 1],
    },
    {
        id: "koth",
        labelKey: "dispatch.video.music.koth",
        bpm: 160,
        offsetSeconds: 0,
        loop: { start: 0, end: 24 },
        layerGains: [0.5, 0.5, 0.5],
    },
    {
        id: "menu",
        labelKey: "dispatch.video.music.menu",
        bpm: 172,
        offsetSeconds: 23.83,
        // The full section after the build repeats every five bars; bars 30-35, before it cuts out at bar 38.
        loop: { start: 41.9655, end: 48.9422 },
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
