import { describe, expect, it } from "vitest";

import { musicTrack } from "./music";
import { AUDIO_SAMPLE_RATE, FADE_IN_SECONDS, PEAK_CEILING, audioPlan, capPeak, silence } from "./audio";
import { videoTimeline } from "./timeline";

const planFor = (id: Parameters<typeof musicTrack>[0]) => {
    const track = musicTrack(id);
    return audioPlan(track, videoTimeline(track));
};

describe("Dispatch video audio plan", () => {
    it("mixes stereo at 48 kHz, the rate Opus needs", () => {
        expect(AUDIO_SAMPLE_RATE).toBe(48_000);
        expect(planFor("postgame")).toMatchObject({ sampleRate: 48_000, channels: 2 });
    });

    it("is exactly as long as the video, in sample frames", () => {
        const plan = planFor("postgame");
        expect(plan.seconds).toBeCloseTo(26.3333, 4);
        expect(plan.length).toBe(1_264_000);
        expect(planFor("koth").length).toBe(1_440_000);
    });

    it("starts each track at its offset on the source and plays no further than its loud section", () => {
        for (const id of ["postgame", "title", "menu"] as const) {
            const track = musicTrack(id);
            const plan = planFor(id);
            expect(plan.offsetSeconds).toBe(track.offsetSeconds);
            expect(plan.loop).toBeNull();
            expect(plan.offsetSeconds + plan.seconds).toBeLessThanOrEqual(track.offsetSeconds + track.maxSeconds!);
        }
        expect(planFor("title").offsetSeconds).toBe(43.695);
    });

    it("loops a looping track over its own length from the offset", () => {
        expect(planFor("koth")).toMatchObject({ offsetSeconds: 0, loop: { start: 0, end: 24 } });
    });

    it("fades in at the start and out over the last bar", () => {
        const plan = planFor("postgame");
        expect(plan.fadeIn).toEqual({ from: 0, to: FADE_IN_SECONDS });
        expect(FADE_IN_SECONDS).toBeGreaterThan(0);
        expect(plan.fadeOut.to).toBe(plan.seconds);
        expect(plan.fadeOut.from).toBeCloseTo(plan.seconds - 240 / 155, 9);
        expect(planFor("koth").fadeOut).toEqual({ from: 28.5, to: 30 });
    });

    it("keeps each layer's gain", () => {
        expect(planFor("koth").layerGains).toEqual([0.5, 0.5, 0.5]);
        expect(planFor("title").layerGains).toEqual([1, 1]);
    });

    it("gives silence as zeroed planes of the plan's length", () => {
        const audio = silence(planFor("koth"));
        expect(audio.sampleRate).toBe(48_000);
        expect(audio.planes.map((p) => p.length)).toEqual([1_440_000, 1_440_000]);
        expect(audio.planes.every((p) => p.every((v) => v === 0))).toBe(true);
    });

    it("scales a mix that peaks past -1 dBFS down to it, keeping the balance", () => {
        expect(PEAK_CEILING).toBeCloseTo(10 ** (-1 / 20), 9);
        const planes = [new Float32Array([0.5, -1.5, 0.25]), new Float32Array([0.75, 0, -0.3])];
        capPeak(planes);
        const k = PEAK_CEILING / 1.5;
        expect([...planes[0]]).toEqual([0.5 * k, -PEAK_CEILING, 0.25 * k].map(Math.fround));
        expect([...planes[1]]).toEqual([0.75 * k, 0, -0.3 * k].map(Math.fround));
    });

    it("leaves a mix under the ceiling as it is", () => {
        const planes = [new Float32Array([0.5, -0.8]), new Float32Array([0.1, 0.2])];
        capPeak(planes);
        expect([...planes[0]]).toEqual([0.5, -0.8].map(Math.fround));
        expect([...planes[1]]).toEqual([0.1, 0.2].map(Math.fround));
    });
});
