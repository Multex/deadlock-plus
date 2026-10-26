import { describe, expect, it } from "vitest";

import { MUSIC_TRACKS, musicTrack } from "./music";
import { VIDEO_FPS, VIDEO_SIZES, barSeconds, frameTime, videoTimeline } from "./timeline";

describe("Dispatch video timeline", () => {
    it("runs at 30 fps in the three export shapes, all even-sized for H.264", () => {
        expect(VIDEO_FPS).toBe(30);
        expect(VIDEO_SIZES).toEqual({
            "9:16": { width: 1080, height: 1920 },
            "1:1": { width: 1440, height: 1440 },
            "16:9": { width: 1920, height: 1080 },
        });
    });

    it("measures a bar as four beats", () => {
        expect(barSeconds(160)).toBe(1.5);
        expect(barSeconds(155)).toBeCloseTo(1.548387, 6);
        expect(barSeconds(172)).toBeCloseTo(1.395349, 6);
    });

    it("cuts each track on the last whole bar its loud section allows, capped at 30 s", () => {
        expect(
            MUSIC_TRACKS.map((track) => {
                const { bars, frames, seconds } = videoTimeline(track);
                return [track.id, bars, frames, +seconds.toFixed(4)];
            }),
        ).toEqual([
            ["postgame", 17, 790, 26.3333],
            ["title", 18, 836, 27.8667],
            ["koth", 20, 900, 30],
            ["menu", 20, 837, 27.9],
        ]);
    });

    it("keeps every cut within a frame of its bar line and inside 20-30 s", () => {
        for (const track of MUSIC_TRACKS) {
            const timeline = videoTimeline(track);
            expect(timeline.seconds).toBeGreaterThanOrEqual(20);
            expect(timeline.seconds).toBeLessThanOrEqual(30);
            expect(Math.abs(timeline.seconds - timeline.bars * timeline.barSeconds)).toBeLessThanOrEqual(
                0.5 / timeline.fps,
            );
        }
    });

    it("takes a limit that lands exactly on a bar line as that bar", () => {
        expect(videoTimeline({ bpm: 160, maxSeconds: 24 }).bars).toBe(16);
        expect(videoTimeline({ bpm: 155, maxSeconds: 16 * barSeconds(155) }).bars).toBe(16);
    });

    it("scales the frame count with the frame rate", () => {
        expect(videoTimeline(musicTrack("koth"), 60).frames).toBe(1800);
    });

    it("refuses a track too short for a 20 s video", () => {
        expect(() => videoTimeline({ bpm: 120, maxSeconds: 19 })).toThrow(/20 s/);
    });

    it("times frame i at i / fps, without drift", () => {
        expect(frameTime(0, 30)).toBe(0);
        expect(frameTime(30, 30)).toBe(1);
        expect(frameTime(899, 30)).toBeCloseTo(29.9667, 4);
        expect(frameTime(899, 30)).toBe(899 / 30);
    });
});
