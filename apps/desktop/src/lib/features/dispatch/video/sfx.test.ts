import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({
    command: vi.fn<(name: string, args?: Record<string, unknown>) => Promise<unknown>>(),
}));
vi.mock("$lib/core/tauri", () => tauri);

import { AUDIO_SAMPLE_RATE } from "./audio";
import { musicTrack } from "./music";
import {
    CUE_PEAK,
    DUCK_ATTACK_SECONDS,
    DUCK_GAIN,
    DUCK_RELEASE_SECONDS,
    SFX_CUES,
    cueClip,
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

const def = (over: Partial<SfxCueDef> = {}): SfxCueDef => ({
    source: { kind: "game" },
    startSeconds: 0,
    lengthSeconds: 1,
    levelDb: 0,
    ducks: false,
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

    it("keeps a loud clip's peak under -1 dBFS instead of clipping", () => {
        const clip = cueClip(def({ levelDb: 12 }), [flat(1000, 0.5), flat(1000, -0.8)], 1000);
        const peak = Math.max(...clip.flatMap((p) => [...p].map(Math.abs)));
        expect(peak).toBeCloseTo(CUE_PEAK, 5);
        expect(clip[0]![0]! / clip[1]![0]!).toBeCloseTo(-0.5 / 0.8, 5);
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
            expect([...plane.subarray(at, at + 3)]).toEqual([0.5, 0.25, 0.125]);
            expect(plane[at + 3]).toBe(0);
        }
    });

    it("lands every cue of a scene's list on its beat", () => {
        const timeline = videoTimeline(musicTrack("postgame"));
        const beat = timeline.barSeconds / 4;
        const scene: SfxCue[] = [
            { cue: "shutter", atSeconds: timeline.barSeconds },
            { cue: "flash", atSeconds: timeline.barSeconds + beat },
            { cue: "type_tick", atSeconds: 2 * timeline.barSeconds + 3 * beat, gain: 0.5 },
        ];
        const music = stereo(Math.round(timeline.seconds * RATE));
        const clips = new Map(scene.map(({ cue }) => [cue, [Float32Array.of(1)]]));
        mixCues(music, RATE, scene, clips, SFX_CUES);
        const hits = [...music[0]!.keys()].filter((i) => music[0]![i] !== 0);
        expect(hits).toEqual(scene.map((c) => Math.round(c.atSeconds * RATE)));
        expect(music[0]![hits[2]!]).toBe(0.5);
    });

    it("plays a mono clip on both channels at the cue's gain, and adds it over the music", () => {
        const music = [flat(10, 0.1), flat(10, -0.1)];
        mixCues(
            music,
            10,
            [{ cue: "page", atSeconds: 0.2, gain: 0.5 }],
            new Map<SfxCueId, Float32Array[]>([["page", [flat(2, 0.4)]]]),
            SFX_CUES,
        );
        expect(music[0]![2]).toBeCloseTo(0.3, 6);
        expect(music[1]![3]).toBeCloseTo(0.1, 6);
        expect(music[0]![4]).toBeCloseTo(0.1, 6);
    });

    it("cuts a cue that runs past the video's end, or starts before it", () => {
        const music = stereo(10);
        const clips = new Map<SfxCueId, Float32Array[]>([["page", [flat(4, 1)]]]);
        mixCues(
            music,
            10,
            [
                { cue: "page", atSeconds: 0.8 },
                { cue: "page", atSeconds: -0.2 },
            ],
            clips,
            SFX_CUES,
        );
        expect([...music[0]!]).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 1, 1]);
    });

    it("plays nothing for a cue that did not load", () => {
        const music = [flat(10, 0.1), flat(10, 0.1)];
        mixCues(music, 10, [{ cue: "slam", atSeconds: 0.1 }], new Map<SfxCueId, Float32Array[]>(), SFX_CUES);
        expect([...music[0]!].every((v) => Math.abs(v - 0.1) < 1e-7)).toBe(true);
    });

    it("dips the music under a ducking cue and brings it back after", () => {
        const rate = 1000;
        const defs = { sting: def({ ducks: true }), tick: def() };
        const music = [flat(3000, 1), flat(3000, 1)];
        mixCues(music, rate, [{ cue: "sting", atSeconds: 1 }], new Map([["sting", [flat(500, 0)]]]), defs);
        const attack = DUCK_ATTACK_SECONDS * rate;
        const release = DUCK_RELEASE_SECONDS * rate;
        expect(music[0]![1000 - attack - 1]).toBe(1);
        expect(music[0]![1000]).toBeCloseTo(DUCK_GAIN, 6);
        expect(music[1]![1499]).toBeCloseTo(DUCK_GAIN, 6);
        expect(music[0]![1500 + release + 1]).toBe(1);

        const plain = [flat(3000, 1), flat(3000, 1)];
        mixCues(plain, rate, [{ cue: "tick", atSeconds: 1 }], new Map([["tick", [flat(500, 0)]]]), defs);
        expect(plain[0]!.every((v) => v === 1)).toBe(true);
    });
});
