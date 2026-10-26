import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({
    command: vi.fn<(name: string, args?: Record<string, unknown>) => Promise<unknown>>(),
}));
vi.mock("$lib/core/tauri", () => tauri);

import { AUDIO_SAMPLE_RATE, capPeak, limitPeaks } from "./audio";
import { musicTrack } from "./music";
import {
    BED_FLOOR_DB,
    CUE_CEILING,
    DUCK_ATTACK_SECONDS,
    DUCK_RELEASE_SECONDS,
    SFX_CUES,
    cueClip,
    cueLoudnessDb,
    loadSfx,
    mixCues,
    parseSfxBody,
    type SfxCue,
    type SfxCueDef,
    type SfxCueId,
} from "./sfx";
import { videoTimeline } from "./timeline";

const RATE = AUDIO_SAMPLE_RATE;

/** Length-prefixed frames, as `dispatch_sfx` answers. */
function body(...cues: number[][]): ArrayBuffer {
    const out: number[] = [];
    for (const cue of cues) {
        const n = cue.length;
        out.push(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff, ...cue);
    }
    return new Uint8Array(out).buffer;
}

const bytesOf = (buffer: ArrayBuffer | undefined) => (buffer ? [...new Uint8Array(buffer)] : undefined);
const stereo = (length: number) => [new Float32Array(length), new Float32Array(length)];
const flat = (length: number, value: number) => new Float32Array(length).fill(value);

/** Deterministic white noise in [-1, 1), uncorrelated across seeds (mulberry32). */
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

const rmsDb = (planes: Float32Array[], from: number, length: number) => {
    let sum = 0;
    for (const p of planes) for (let i = from; i < from + length; i++) sum += p[i]! ** 2;
    return 10 * Math.log10(sum / (length * planes.length));
};

/** A stereo music bed of noise at `db` dBFS RMS. Renders measure -14 to -16 around a cue; noise has less crest than music, so it is the harder case for the limiter. */
function bed(length: number, db: number): Float32Array[] {
    const k = 10 ** (db / 20) * Math.sqrt(3);
    return [noise(length, 1), noise(length, 2)].map((p) => p.map((v) => v * k));
}

/** A struck sound that rings out, its loudest 100 ms at -14 dBFS RMS: a pick after its `levelDb`. */
function strike(length: number, rate: number): Float32Array[] {
    const plane = noise(length, 7).map((v, i) => v * Math.exp(-i / (0.06 * rate)));
    const first = Math.round(0.1 * rate);
    const k = 10 ** (-14 / 20) / 10 ** (rmsDb([plane], 0, first) / 20);
    return [plane.map((v) => v * k)];
}

const def = (over: Partial<SfxCueDef> = {}): SfxCueDef => ({
    source: { kind: "game" },
    startSeconds: 0,
    lengthSeconds: 1,
    levelDb: 0,
    mixDb: 0,
    duckDb: 0,
    ...over,
});

describe("Dispatch video sound cues", () => {
    beforeEach(() => {
        tauri.command.mockReset();
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("lists the 19 game sounds and the bundled crowd sound the user picked by ear, each at the stretch and level it was heard at", () => {
        expect(Object.keys(SFX_CUES)).toEqual([
            "shutter",
            "flash",
            "grease_pencil",
            "page",
            "type_tick",
            "slam",
            "stand_drop",
            "foil_glint",
            "foil_rip",
            "card_deal",
            "card_flip",
            "chase_build",
            "holo_reveal",
            "slab_click",
            "marquee_bulb",
            "confetti",
            "envelope_tear",
            "spotlight",
            "winner_sting",
            "crowd",
        ]);
        for (const [id, cue] of Object.entries(SFX_CUES)) {
            if (id !== "crowd") expect(cue.source).toEqual({ kind: "game" });
            expect(cue.lengthSeconds).toBeGreaterThan(0);
            expect(cue.startSeconds).toBeGreaterThanOrEqual(0);
        }
        expect(SFX_CUES.shutter).toMatchObject({ startSeconds: 0, lengthSeconds: 0.3, levelDb: 7.8 });
        expect(SFX_CUES.chase_build).toMatchObject({ startSeconds: 0.105, lengthSeconds: 5.43, levelDb: -10.9 });
    });

    it("bundles the crowd cue as an app asset whose URL resolves", () => {
        const source = SFX_CUES.crowd.source;
        expect(source.kind).toBe("asset");
        if (source.kind !== "asset") return;
        expect(source.url).toMatch(/crowd.*\.mp3$/);
        expect(SFX_CUES.crowd).toMatchObject({ startSeconds: 0, levelDb: 0 });
        expect(SFX_CUES.crowd.lengthSeconds).toBeCloseTo(5, 0);
    });

    it("reads each cue's bytes out of the framed body, in the asked order", () => {
        const cues = parseSfxBody(body([1, 2, 3], [], [9]), ["shutter", "flash", "page"]);
        expect([...cues.keys()]).toEqual(["shutter", "page"]);
        expect(bytesOf(cues.get("shutter"))).toEqual([1, 2, 3]);
        expect(bytesOf(cues.get("page"))).toEqual([9]);
    });

    it("reads an empty body as every cue missing, and stops at a frame cut short", () => {
        expect(parseSfxBody(new ArrayBuffer(0), ["shutter", "flash"]).size).toBe(0);
        const cut = body([1, 2], [3, 4, 5]).slice(0, 9);
        expect([...parseSfxBody(cut, ["shutter", "flash"]).keys()]).toEqual(["shutter"]);
    });

    it("asks the game for every game cue in one call, and asks nothing for no cues", async () => {
        tauri.command.mockResolvedValue(body([7], [8]));
        const cues = await loadSfx(["slam", "confetti"]);
        expect(tauri.command.mock.calls).toEqual([["dispatch_sfx", { cues: ["slam", "confetti"] }]]);
        expect(bytesOf(cues.get("confetti"))).toEqual([8]);
        tauri.command.mockClear();
        expect((await loadSfx([])).size).toBe(0);
        expect(tauri.command).not.toHaveBeenCalled();
    });

    it("loads a bundled-asset cue from the app instead of the game", async () => {
        const defs = { slam: def(), crowd: def({ source: { kind: "asset", url: "/sfx/crowd.ogg" } }) };
        const fetch = vi.fn(async () => new Response(new Uint8Array([4, 2])));
        vi.stubGlobal("fetch", fetch);
        tauri.command.mockResolvedValue(body([7]));
        const cues = await loadSfx(["slam", "crowd"], defs);
        expect(tauri.command.mock.calls).toEqual([["dispatch_sfx", { cues: ["slam"] }]]);
        expect(fetch).toHaveBeenCalledWith("/sfx/crowd.ogg");
        expect(bytesOf(cues.get("crowd"))).toEqual([4, 2]);
        expect(bytesOf(cues.get("slam"))).toEqual([7]);
    });

    it("drops only the cues that fail to load, never throwing", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const defs = { slam: def(), crowd: def({ source: { kind: "asset", url: "/sfx/crowd.ogg" } }) };
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(new Uint8Array([4, 2]))),
        );
        tauri.command.mockRejectedValue("unknown sound cue");
        expect([...(await loadSfx(["slam", "crowd"], defs)).keys()]).toEqual(["crowd"]);
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(null, { status: 404 })),
        );
        tauri.command.mockResolvedValue(body([7]));
        expect([...(await loadSfx(["slam", "crowd"], defs)).keys()]).toEqual(["slam"]);
    });

    it("cuts a clip to the picked stretch, at its level, fading out its end", () => {
        const source = [flat(1000, 0.05)];
        source[0]!.fill(0.9, 0, 100);
        const clip = cueClip(def({ startSeconds: 0.1, lengthSeconds: 0.5, levelDb: 20 }), source, 1000);
        expect(clip).toHaveLength(1);
        expect(clip[0]).toHaveLength(500);
        expect(clip[0]![0]).toBeCloseTo(0.5, 5);
        // The last 0.125 s (a quarter of the length, under the 0.15 s cap) fades to nothing.
        expect(clip[0]![374]).toBeCloseTo(0.5, 5);
        expect(clip[0]![499]).toBeLessThan(0.01);
    });

    it("lifts the mix at least 4 dB in the 50 ms after every cue, over a bed as loud as the game music around a cue", () => {
        const length = 2 * RATE;
        const at = 0.5;
        const from = Math.round(at * RATE);
        const window = Math.round(0.05 * RATE);
        for (const id of Object.keys(SFX_CUES) as SfxCueId[]) {
            const defs = { ...SFX_CUES, [id]: { ...SFX_CUES[id], levelDb: 0 } };
            const clip = cueClip(defs[id], strike(Math.round(SFX_CUES[id].lengthSeconds * RATE), RATE), RATE);
            const without = bed(length, -14);
            capPeak(without);
            limitPeaks(without, RATE);
            const mixed = bed(length, -14);
            capPeak(mixed);
            mixCues(mixed, RATE, [{ cue: id, atSeconds: at }], new Map([[id, clip]]), defs);
            limitPeaks(mixed, RATE);
            expect({ id, rise: rmsDb(mixed, from, window) - rmsDb(without, from, window) }).toEqual({
                id,
                rise: expect.toSatisfy((rise: number) => rise >= 4),
            });
        }
    });

    it("places a cue's loudest 50 ms its mixDb over the music around it", () => {
        const defs = { hit: def({ mixDb: 6 }) };
        const clip = strike(RATE / 2, RATE);
        const music = bed(2 * RATE, -20);
        const before = music.map((p) => p.slice());
        mixCues(music, RATE, [{ cue: "hit", atSeconds: 1 }], new Map([["hit", clip]]), defs);
        const cue = music.map((p, c) => p.map((v, i) => v - before[c]![i]!));
        expect(cueLoudnessDb(cue, RATE)).toBeCloseTo(-14, 1);
    });

    it("holds a cue placed over loud music under -1 dBFS on its own, keeping most of its body", () => {
        const defs = { hit: def({ mixDb: 6 }) };
        const music = stereo(2 * RATE);
        music.forEach((p) => p.fill(0.25));
        mixCues(music, RATE, [{ cue: "hit", atSeconds: 1 }], new Map([["hit", strike(RATE / 2, RATE)]]), defs);
        const cue = music.map((p) => p.map((v) => v - 0.25));
        const peak = cue.reduce((m, p) => p.reduce((n, v) => Math.max(n, Math.abs(v)), m), 0);
        expect(peak).toBeLessThanOrEqual(CUE_CEILING + 1e-6);
        expect(cueLoudnessDb(cue, RATE)).toBeGreaterThan(-12 + 6 - 3);
    });

    it("places a cue over a silent stretch as if over the bed floor, so it never vanishes", () => {
        const defs = { hit: def({ mixDb: 6 }) };
        const music = stereo(2 * RATE);
        mixCues(music, RATE, [{ cue: "hit", atSeconds: 1 }], new Map([["hit", strike(RATE / 2, RATE)]]), defs);
        expect(cueLoudnessDb(music, RATE)).toBeCloseTo(BED_FLOOR_DB + 6, 1);
    });

    it("lands a cue's first sample exactly on its time", () => {
        const music = stereo(RATE * 3);
        const clip = [Float32Array.of(0.5, 0.25, 0.125)];
        mixCues(
            music,
            RATE,
            [{ cue: "shutter", atSeconds: 1.25 }],
            new Map<SfxCueId, Float32Array[]>([["shutter", clip]]),
            SFX_CUES,
        );
        const at = 60_000;
        for (const plane of music) {
            expect(plane[at - 1]).toBe(0);
            expect(plane[at]).toBeGreaterThan(0);
            expect(plane[at + 1]! / plane[at]!).toBeCloseTo(0.5, 6);
            expect(plane[at + 2]! / plane[at]!).toBeCloseTo(0.25, 6);
            expect(plane[at + 3]).toBe(0);
        }
    });

    it("lands every cue of a scene's list on its beat", () => {
        const timeline = videoTimeline(musicTrack("postgame"));
        const beat = timeline.barSeconds / 4;
        const scene: SfxCue[] = [
            { cue: "shutter", atSeconds: timeline.barSeconds },
            { cue: "flash", atSeconds: timeline.barSeconds + beat },
            { cue: "type_tick", atSeconds: 2 * timeline.barSeconds + 3 * beat },
        ];
        const music = stereo(Math.round(timeline.seconds * RATE));
        const clips = new Map(scene.map(({ cue }) => [cue, [Float32Array.of(1)]]));
        mixCues(music, RATE, scene, clips, SFX_CUES);
        const hits = [...music[0]!.keys()].filter((i) => music[0]![i] !== 0);
        expect(hits).toEqual(scene.map((c) => Math.round(c.atSeconds * RATE)));
    });

    it("plays a mono clip on both channels, scaled by the cue's gain", () => {
        const defs = { tap: def() };
        const play = (gain: number) => {
            const music = stereo(RATE);
            mixCues(music, RATE, [{ cue: "tap", atSeconds: 0.5, gain }], new Map([["tap", [flat(10, 0.4)]]]), defs);
            return music;
        };
        const full = play(1);
        const half = play(0.5);
        expect(full[0]![RATE / 2]).toBeGreaterThan(0);
        expect(full[1]![RATE / 2 + 9]).toBe(full[0]![RATE / 2]);
        expect(half[0]![RATE / 2]).toBeCloseTo(full[0]![RATE / 2]! / 2, 6);
    });

    it("cuts a cue that runs past the video's end, or starts before it", () => {
        const music = stereo(10);
        const clips = new Map([["tap", [flat(4, 1)]]]);
        mixCues(
            music,
            10,
            [
                { cue: "tap", atSeconds: 0.8 },
                { cue: "tap", atSeconds: -0.2 },
            ],
            clips,
            { tap: def() },
        );
        expect([...music[0]!].map((v) => v !== 0)).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 1, 1].map(Boolean));
    });

    it("plays nothing for a cue that did not load", () => {
        const music = [flat(10, 0.1), flat(10, 0.1)];
        mixCues(music, 10, [{ cue: "slam", atSeconds: 0.1 }], new Map<SfxCueId, Float32Array[]>(), SFX_CUES);
        expect([...music[0]!].every((v) => Math.abs(v - 0.1) < 1e-7)).toBe(true);
    });

    it("dips the music by the cue's duckDb while it plays and brings it back after", () => {
        const rate = 1000;
        const defs = { sting: def({ duckDb: 9 }), tick: def() };
        const silent = [flat(500, 0)];
        const music = [flat(3000, 1), flat(3000, 1)];
        mixCues(music, rate, [{ cue: "sting", atSeconds: 1 }], new Map([["sting", silent]]), defs);
        const attack = DUCK_ATTACK_SECONDS * rate;
        const release = DUCK_RELEASE_SECONDS * rate;
        expect(music[0]![1000 - attack - 1]).toBe(1);
        expect(music[0]![1000]).toBeCloseTo(10 ** (-9 / 20), 6);
        expect(music[1]![1499]).toBeCloseTo(10 ** (-9 / 20), 6);
        expect(music[0]![1500 + release + 1]).toBe(1);

        const plain = [flat(3000, 1), flat(3000, 1)];
        mixCues(plain, rate, [{ cue: "tick", atSeconds: 1 }], new Map([["tick", silent]]), defs);
        expect(plain[0]!.every((v) => v === 1)).toBe(true);
    });

    it("dips the music under every game cue and the crowd, hardest under the big moments", () => {
        for (const cue of Object.values(SFX_CUES)) expect(cue.duckDb).toBeGreaterThan(0);
        expect(SFX_CUES.winner_sting.duckDb).toBeGreaterThan(SFX_CUES.type_tick.duckDb);
        expect(SFX_CUES.holo_reveal.duckDb).toBeGreaterThan(SFX_CUES.card_flip.duckDb);
    });
});
