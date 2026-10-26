import { describe, expect, it } from "vitest";

import { musicTrack } from "./music";
import { AUDIO_SAMPLE_RATE, FADE_IN_SECONDS, PEAK_CEILING, SEAM_SECONDS, audioPlan, capPeak, silence } from "./audio";
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
        expect(plan.seconds).toBeCloseTo(40.2667, 4);
        expect(plan.length).toBe(1_932_800);
        expect(planFor("koth").length).toBe(1_944_000);
    });

    it("plays from the offset to the loop's end, then the loop again until the video ends", () => {
        const track = musicTrack("postgame");
        const plan = planFor("postgame");
        const pieces = plan.pieces.map((p) => [+p.at.toFixed(4), +p.from.toFixed(4), +p.seconds.toFixed(4)]);
        expect(pieces).toEqual([
            [0, 0, 24.7742],
            [24.7742, 18.5806, 6.1936],
            [30.9678, 18.5806, 6.1936],
            [37.1614, 18.5806, 3.1053],
        ]);
        expect(plan.pieces[0].from).toBe(track.offsetSeconds);
        expect(planFor("koth").pieces).toEqual([
            { at: 0, from: 0, seconds: 24 },
            { at: 24, from: 0, seconds: 16.5 },
        ]);
    });

    it("covers the whole video without a gap, and never plays past a loop's end", () => {
        for (const id of ["postgame", "title", "koth", "menu"] as const) {
            const track = musicTrack(id);
            const plan = planFor(id);
            let at = 0;
            plan.pieces.forEach((p, i) => {
                expect(p.at).toBeCloseTo(at, 9);
                expect(p.from).toBe(i === 0 ? track.offsetSeconds : track.loop.start);
                expect(p.from + p.seconds).toBeLessThanOrEqual(track.loop.end + 1e-9);
                at += p.seconds;
            });
            expect(at).toBeCloseTo(plan.seconds, 9);
        }
    });

    it("blends each loop seam over a few milliseconds, too short to blur a downbeat", () => {
        expect(SEAM_SECONDS).toBeGreaterThan(0);
        expect(SEAM_SECONDS).toBeLessThanOrEqual(0.02);
    });

    it("fades in at the start and out over the last bar", () => {
        const plan = planFor("postgame");
        expect(plan.fadeIn).toEqual({ from: 0, to: FADE_IN_SECONDS });
        expect(FADE_IN_SECONDS).toBeGreaterThan(0);
        expect(plan.fadeOut.to).toBe(plan.seconds);
        expect(plan.fadeOut.from).toBeCloseTo(plan.seconds - 240 / 155, 9);
        expect(planFor("koth").fadeOut).toEqual({ from: 39, to: 40.5 });
    });

    it("keeps each layer's gain", () => {
        expect(planFor("koth").layerGains).toEqual([0.5, 0.5, 0.5]);
        expect(planFor("title").layerGains).toEqual([1, 1]);
    });

    it("gives silence as zeroed planes of the plan's length", () => {
        const audio = silence(planFor("koth"));
        expect(audio.sampleRate).toBe(48_000);
        expect(audio.planes.map((p) => p.length)).toEqual([1_944_000, 1_944_000]);
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
