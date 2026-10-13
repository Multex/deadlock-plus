import { describe, expect, it, vi } from "vitest";
import { loadMatchPing, MAX_PING_POINTS, matchPingFromSeries, matchWindowMs, pingSegments } from "./ping";

describe("matchWindowMs", () => {
    it("turns start time and duration in seconds into a millisecond window", () => {
        expect(matchWindowMs({ startTime: 1000, durationS: 90 })).toEqual({ startMs: 1_000_000, endMs: 1_090_000 });
    });
});

describe("pingSegments", () => {
    it("places points in seconds from the match start", () => {
        const segs = pingSegments(
            [
                { t: 10_000, raw: 20 },
                { t: 12_500, raw: 30 },
            ],
            10_000,
        );
        expect(segs).toEqual([
            [
                { t: 0, v: 20 },
                { t: 2.5, v: 30 },
            ],
        ]);
    });

    it("splits the line at dropped samples instead of drawing zero", () => {
        const segs = pingSegments(
            [
                { t: 0, raw: 20 },
                { t: 1000, raw: null },
                { t: 2000, raw: 40 },
                { t: 3000, raw: 50 },
            ],
            0,
        );
        expect(segs).toEqual([
            [{ t: 0, v: 20 }],
            [
                { t: 2, v: 40 },
                { t: 3, v: 50 },
            ],
        ]);
    });

    it("is empty without points", () => {
        expect(pingSegments([], 0)).toEqual([]);
    });
});

describe("matchPingFromSeries", () => {
    const detail = { startTime: 100, durationS: 60 };

    it("summarises and segments a recorded series from the match start", () => {
        const got = matchPingFromSeries(
            {
                source: "engine",
                partial: false,
                points: [
                    { t: 100_000, raw: 10 },
                    { t: 101_000, raw: null },
                    { t: 102_000, raw: 30 },
                ],
            },
            detail,
        );
        expect(got?.summary).toEqual({ avg: 20, worst: 30, samples: 2 });
        expect(got?.segments).toEqual([[{ t: 0, v: 10 }], [{ t: 2, v: 30 }]]);
        expect(got?.durationS).toBe(60);
        expect(got?.source).toBe("engine");
        expect(got?.partial).toBe(false);
    });

    it("carries the partial flag and relay source", () => {
        const got = matchPingFromSeries({ source: "icmp", partial: true, points: [{ t: 100_000, raw: 5 }] }, detail);
        expect(got?.source).toBe("icmp");
        expect(got?.partial).toBe(true);
    });

    it("is null when the series holds no direct ping", () => {
        expect(
            matchPingFromSeries({ source: "icmp", partial: false, points: [{ t: 0, raw: null }] }, detail),
        ).toBeNull();
    });
});

describe("loadMatchPing", () => {
    const detail = { matchId: 7, startTime: 100, durationS: 60 };
    const noSeries = async () => null;

    it("prefers the per-match recording and skips the window query", async () => {
        const summary = vi.fn();
        const points = vi.fn();
        const series = vi
            .fn()
            .mockResolvedValue({ source: "engine", partial: true, points: [{ t: 100_000, raw: 40 }] });
        const got = await loadMatchPing(detail, { summary, points, series });
        expect(series).toHaveBeenCalledWith(7, MAX_PING_POINTS);
        expect(summary).not.toHaveBeenCalled();
        expect(points).not.toHaveBeenCalled();
        expect(got?.source).toBe("engine");
        expect(got?.partial).toBe(true);
    });

    it("falls back to the window query when no recording exists", async () => {
        const summary = vi.fn().mockResolvedValue({ avg: 30, worst: 90, samples: 55 });
        const points = vi.fn().mockResolvedValue([{ t: 100_000, raw: 30 }]);
        const got = await loadMatchPing(detail, { summary, points, series: noSeries });
        expect(summary).toHaveBeenCalledWith(100_000, 160_000);
        expect(points).toHaveBeenCalledWith(100_000, 160_000, MAX_PING_POINTS);
        expect(got?.summary).toEqual({ avg: 30, worst: 90, samples: 55 });
        expect(got?.segments).toHaveLength(1);
        expect(got?.source).toBeNull();
        expect(got?.partial).toBe(false);
    });

    it("falls back when the recording holds no direct ping", async () => {
        const summary = vi.fn().mockResolvedValue({ avg: 30, worst: 90, samples: 55 });
        const points = vi.fn().mockResolvedValue([{ t: 100_000, raw: 30 }]);
        const series = async () => ({ source: "icmp" as const, partial: false, points: [{ t: 100_000, raw: null }] });
        const got = await loadMatchPing(detail, { summary, points, series });
        expect(got?.summary.samples).toBe(55);
    });

    it("is null when neither source has a direct ping", async () => {
        const got = await loadMatchPing(detail, {
            summary: async () => null,
            points: async () => [{ t: 100_000, raw: null }],
            series: noSeries,
        });
        expect(got).toBeNull();
    });
});
