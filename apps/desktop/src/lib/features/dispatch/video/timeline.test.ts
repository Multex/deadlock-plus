import { describe, expect, it } from "vitest";

import { MUSIC_TRACKS, musicTrack } from "./music";
import { VIDEO_FPS, VIDEO_SECONDS, VIDEO_SIZES, barSeconds, frameTime, videoTimeline } from "./timeline";

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

    it("runs each track for the most whole bars that fit in 41 s, about 40 s", () => {
        expect(
            MUSIC_TRACKS.map((track) => {
                const { bars, frames, seconds } = videoTimeline(track);
                return [track.id, bars, frames, +seconds.toFixed(4)];
            }),
        ).toEqual([
            ["postgame", 26, 1208, 40.2667],
            ["title", 26, 1208, 40.2667],
            ["koth", 27, 1215, 40.5],
            ["menu", 29, 1214, 40.4667],
        ]);
    });

    it("keeps every cut within a frame of its bar line and inside 39-41 s", () => {
        for (const track of MUSIC_TRACKS) {
            const timeline = videoTimeline(track);
            expect(timeline.seconds).toBeGreaterThanOrEqual(39);
            expect(timeline.seconds).toBeLessThanOrEqual(VIDEO_SECONDS);
            expect(Math.abs(timeline.seconds - timeline.bars * timeline.barSeconds)).toBeLessThanOrEqual(
                0.5 / timeline.fps,
            );
        }
    });

    it("takes a length that lands exactly on 41 s as that many bars", () => {
        expect(videoTimeline({ bpm: 240 }).bars).toBe(41);
        expect(videoTimeline({ bpm: (240 * 20) / 41 }).bars).toBe(20);
    });

    it("scales the frame count with the frame rate", () => {
        expect(videoTimeline(musicTrack("koth"), 60).frames).toBe(2430);
    });

    it("times frame i at i / fps, without drift", () => {
        expect(frameTime(0, 30)).toBe(0);
        expect(frameTime(30, 30)).toBe(1);
        expect(frameTime(899, 30)).toBeCloseTo(29.9667, 4);
        expect(frameTime(899, 30)).toBe(899 / 30);
    });
});
