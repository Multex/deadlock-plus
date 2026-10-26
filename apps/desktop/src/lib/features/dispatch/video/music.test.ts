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

    it("lists the four picked tracks with their measured grids", () => {
        expect(
            MUSIC_TRACKS.map((t) => [t.id, t.bpm, t.offsetSeconds, t.maxSeconds, t.loopSeconds, t.layerGains.length]),
        ).toEqual([
            ["postgame", 155, 0, 26.4, null, 1],
            ["title", 155, 43.695, 27.88, null, 2],
            ["koth", 160, 0, null, 24, 3],
            ["menu", 172, 23.83, 28.2, null, 1],
        ]);
        expect(musicTrack("koth").layerGains).toEqual([0.5, 0.5, 0.5]);
        expect(MUSIC_TRACKS.map((t) => t.labelKey)).toEqual([
            "dispatch.video.music.postgame",
            "dispatch.video.music.title",
            "dispatch.video.music.koth",
            "dispatch.video.music.menu",
        ]);
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
