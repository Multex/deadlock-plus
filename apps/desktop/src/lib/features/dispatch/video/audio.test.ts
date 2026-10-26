import { describe, expect, it } from "vitest";

import { musicTrack } from "./music";
import {
    AUDIO_SAMPLE_RATE,
    FADE_IN_SECONDS,
    LIMIT_CEILING,
    LIMIT_RELEASE_SECONDS,
    LOUDNESS_TARGET_LUFS,
    PEAK_CEILING,
    SEAM_SECONDS,
    audioPlan,
    capPeak,
    finishMix,
    limitPeaks,
    loudnessLufs,
    silence,
} from "./audio";
import { LIMIT_LOOKAHEAD_SECONDS } from "./sfx";
import { videoTimeline } from "./timeline";

/** Stereo, the same on both channels. */
const both = (plane: Float32Array) => [plane, plane.slice()];

function sine(seconds: number, hz: number, amplitude: number): Float32Array {
    return Float32Array.from(
        { length: seconds * AUDIO_SAMPLE_RATE },
        (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / AUDIO_SAMPLE_RATE),
    );
}

/** Deterministic white noise in [-1, 1) (mulberry32). */
function noise(length: number, seed: number): Float32Array {
    const out = new Float32Array(length);
    let s = seed >>> 0;
    for (let i = 0; i < length; i++) {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), s | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        out[i] = ((t ^ (t >>> 14)) >>> 0) / 2 ** 31 - 1;
    }
    return out;
}

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

    it("limits a cue's peak to -2 dBFS, so the encoded true peak stays under -1 dBTP, without turning the rest of the mix down", () => {
        const rate = 1000;
        const planes = [new Float32Array(1000).fill(0.3), new Float32Array(1000).fill(-0.3)];
        planes[0]![500] = 2;
        planes[1]![501] = -1.5;
        limitPeaks(planes, rate);
        const peak = Math.max(...planes.flatMap((p) => [...p].map(Math.abs)));
        expect(peak).toBeLessThanOrEqual(LIMIT_CEILING + 1e-6);
        expect(planes[0]![500]).toBeCloseTo(LIMIT_CEILING, 5);
        const ahead = LIMIT_LOOKAHEAD_SECONDS * rate;
        const release = LIMIT_RELEASE_SECONDS * rate;
        expect(planes[0]![500 - ahead - 1]).toBeCloseTo(0.3, 6);
        expect(planes[1]![501 + release + 1]).toBeCloseTo(-0.3, 6);
        // The gain ramps down into the peak, so the dip never steps.
        expect(planes[0]![498]!).toBeLessThan(0.3);
        expect(planes[0]![498]!).toBeGreaterThan(planes[0]![499]!);
    });

    it("leaves a limited mix under the ceiling as it is", () => {
        const planes = [new Float32Array([0.5, -0.79, 0.7]), new Float32Array([0.1, 0.2, -0.3])];
        limitPeaks(planes, 1000);
        expect([...planes[0]!]).toEqual([0.5, -0.79, 0.7].map(Math.fround));
        expect([...planes[1]!]).toEqual([0.1, 0.2, -0.3].map(Math.fround));
    });

    it("measures loudness as ITU-R BS.1770 does: a 997 Hz sine at -23 dBFS on both channels reads -23 LUFS", () => {
        expect(loudnessLufs(both(sine(10, 997, 10 ** (-23 / 20))), AUDIO_SAMPLE_RATE)).toBeCloseTo(-23, 1);
        expect(loudnessLufs(both(sine(10, 997, 10 ** (-33 / 20))), AUDIO_SAMPLE_RATE)).toBeCloseTo(-33, 1);
    });

    it("gates out silence, so a quiet start does not drag the reading down", () => {
        const tone = sine(10, 997, 10 ** (-23 / 20));
        const padded = new Float32Array(20 * AUDIO_SAMPLE_RATE);
        padded.set(tone, 10 * AUDIO_SAMPLE_RATE);
        expect(Math.abs(loudnessLufs(both(padded), AUDIO_SAMPLE_RATE) + 23)).toBeLessThan(0.1);
    });

    it("brings a finished mix to -14 LUFS with one gain, its peaks still under the limiter ceiling", () => {
        expect(LOUDNESS_TARGET_LUFS).toBe(-14);
        expect(LIMIT_CEILING).toBeCloseTo(10 ** (-2 / 20), 9);
        for (const db of [-6, -20]) {
            const k = 10 ** (db / 20) * Math.sqrt(3);
            const planes = [noise(10 * AUDIO_SAMPLE_RATE, 1), noise(10 * AUDIO_SAMPLE_RATE, 2)].map((p) =>
                p.map((v) => v * k),
            );
            const ratio = planes[0]![1000]! / planes[1]![2000]!;
            finishMix(planes, AUDIO_SAMPLE_RATE);
            expect(loudnessLufs(planes, AUDIO_SAMPLE_RATE)).toBeCloseTo(-14, 0);
            expect(Math.abs(loudnessLufs(planes, AUDIO_SAMPLE_RATE) + 14)).toBeLessThan(0.3);
            expect(planes.every((p) => p.every((v) => Math.abs(v) <= LIMIT_CEILING + 1e-6))).toBe(true);
            expect(planes[0]![1000]! / planes[1]![2000]!).toBeCloseTo(ratio, 4);
        }
    });
});
