import { describe, expect, it, vi } from "vitest";

import { DEFAULT_TRACKS, pickSupport, probeVideoSupport, videoFileName, type EncodeProbe } from "./export-video";
import { isVideoKind } from "./scene";
import { VIDEO_SIZES } from "./timeline";

describe("Dispatch video support", () => {
    it("takes AAC when the system has H.264 and AAC", () => {
        expect(pickSupport({ avc: true, aac: true, opus: true })).toEqual({ audioCodec: "aac" });
        expect(pickSupport({ avc: true, aac: true, opus: false })).toEqual({ audioCodec: "aac" });
    });

    it("falls back to Opus without AAC", () => {
        expect(pickSupport({ avc: true, aac: false, opus: true })).toEqual({ audioCodec: "opus" });
    });

    it("is unsupported without H.264, or without any audio codec", () => {
        expect(pickSupport({ avc: false, aac: true, opus: true })).toBeNull();
        expect(pickSupport({ avc: true, aac: false, opus: false })).toBeNull();
    });

    const probe = (over: Partial<EncodeProbe> = {}): EncodeProbe => ({
        canEncodeVideo: vi.fn(async () => true),
        canEncodeAudio: vi.fn(async () => true),
        ...over,
    });

    it("asks for H.264 at every export size and audio at 48 kHz stereo", async () => {
        const deps = probe();
        expect(await probeVideoSupport(deps)).toEqual({ audioCodec: "aac" });
        expect(vi.mocked(deps.canEncodeVideo).mock.calls.map(([codec, o]) => [codec, o.width, o.height])).toEqual(
            Object.values(VIDEO_SIZES).map(({ width, height }) => ["avc", width, height]),
        );
        expect(vi.mocked(deps.canEncodeAudio).mock.calls[0]).toEqual([
            "aac",
            expect.objectContaining({ sampleRate: 48_000, numberOfChannels: 2 }),
        ]);
    });

    it("is unsupported when one export size cannot encode", async () => {
        const deps = probe({ canEncodeVideo: vi.fn(async (_c, o) => o.width !== 1440) });
        expect(await probeVideoSupport(deps)).toBeNull();
    });

    it("falls back to Opus through the probe", async () => {
        const deps = probe({ canEncodeAudio: vi.fn(async (codec) => codec === "opus") });
        expect(await probeVideoSupport(deps)).toEqual({ audioCodec: "opus" });
    });

    it("is unsupported when the probe itself throws", async () => {
        const deps = probe({
            canEncodeVideo: vi.fn(async () => {
                throw new ReferenceError("VideoEncoder is not defined");
            }),
        });
        expect(await probeVideoSupport(deps)).toBeNull();
    });
});

describe("Dispatch video file name", () => {
    it("names the kind, the edition and the shape, without repeating the kind", () => {
        expect(videoFileName("collectors-season_1", "collectors", "9:16")).toBe(
            "deadlock-plus-collectors-copy-season-1-9x16.mp4",
        );
        expect(videoFileName("year_end-2026", "year_end", "16:9")).toBe("deadlock-plus-year-end-special-2026-16x9.mp4");
        expect(videoFileName("monthly-2026-09", "monthly", "9:16")).toBe("deadlock-plus-monthly-2026-09-9x16.mp4");
    });

    it("keeps an id that does not start with its kind whole", () => {
        expect(videoFileName("Season 2 (Beta)", "collectors", "1:1")).toBe(
            "deadlock-plus-collectors-copy-season-2-beta-1x1.mp4",
        );
    });

    it("stays within the 100 characters a save name may have", () => {
        const name = videoFileName(`collectors-${"x".repeat(200)}`, "collectors", "1:1");
        expect(name.length).toBeLessThanOrEqual(100);
        expect(name).toMatch(/^deadlock-plus-collectors-copy-x+-1x1\.mp4$/);
    });
});

describe("Dispatch video music default", () => {
    it("opens on a hit for a Collector's Copy, on the menu build for a Year-End Special, on the title theme for a Monthly", () => {
        expect(DEFAULT_TRACKS).toEqual({ monthly: "title", collectors: "postgame", year_end: "menu" });
    });
});

describe("Dispatch video kinds", () => {
    it("makes a video for the Monthly, the Collector's Copy and the Year-End Special, never the Weekly", () => {
        expect(isVideoKind("monthly")).toBe(true);
        expect(isVideoKind("collectors")).toBe(true);
        expect(isVideoKind("year_end")).toBe(true);
        expect(isVideoKind("weekly")).toBe(false);
    });
});
