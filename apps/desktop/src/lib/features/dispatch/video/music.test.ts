import { beforeEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({
    command: vi.fn<(name: string, args?: Record<string, unknown>) => Promise<unknown>>(),
}));
vi.mock("$lib/core/tauri", () => tauri);

import { MUSIC_TRACKS, loadTrack, musicTrack, type MusicTrackId } from "./music";

const bytes = (...values: number[]) => new Uint8Array(values).buffer;

describe("Dispatch video music", () => {
    beforeEach(() => {
        tauri.command.mockReset();
    });

    it("lists the four picked tracks with their measured grids and loops", () => {
        expect(MUSIC_TRACKS.map((t) => [t.id, t.bpm, t.offsetSeconds, t.loop, t.layerGains.length])).toEqual([
            ["postgame", 155, 0, { start: 18.5806, end: 24.7742 }, 1],
            ["title", 155, 43.695, { start: 60.7331, end: 68.4776 }, 2],
            ["koth", 160, 0, { start: 0, end: 24 }, 3],
            ["menu", 172, 23.83, { start: 41.9655, end: 48.9422 }, 1],
        ]);
        expect(musicTrack("koth").layerGains).toEqual([0.5, 0.5, 0.5]);
        expect(MUSIC_TRACKS.map((t) => t.labelKey)).toEqual([
            "dispatch.video.music.postgame",
            "dispatch.video.music.title",
            "dispatch.video.music.koth",
            "dispatch.video.music.menu",
        ]);
    });

    it("loops a whole number of bars inside each track's loud section, past where playback starts", () => {
        for (const t of MUSIC_TRACKS) {
            const bars = (t.loop.end - t.loop.start) / (240 / t.bpm);
            expect(Math.abs(bars - Math.round(bars)) * (240 / t.bpm)).toBeLessThan(0.005);
            expect(t.loop.start).toBeGreaterThanOrEqual(t.offsetSeconds);
        }
    });

    it("asks for every layer of a track by id and index, and returns them in order", async () => {
        tauri.command.mockImplementation(async (_name, args) => bytes(Number(args?.layer) + 1));
        const layers = await loadTrack("koth");
        expect(tauri.command.mock.calls).toEqual([
            ["dispatch_music_track", { id: "koth", layer: 0 }],
            ["dispatch_music_track", { id: "koth", layer: 1 }],
            ["dispatch_music_track", { id: "koth", layer: 2 }],
        ]);
        expect(layers?.map((b) => [...new Uint8Array(b)])).toEqual([[1], [2], [3]]);
    });

    it("is null when the game or any layer is missing", async () => {
        tauri.command.mockImplementation(async (_name, args) => (args?.layer === 1 ? bytes() : bytes(9)));
        expect(await loadTrack("title")).toBeNull();
    });

    it("is null when the backend refuses", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        tauri.command.mockImplementation(async () => {
            throw "unknown music track";
        });
        expect(await loadTrack("menu" as MusicTrackId)).toBeNull();
    });
});
