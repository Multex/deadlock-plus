import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditionView } from "../edition-view";
import { musicTrack } from "./music";
import { videoTimeline } from "./timeline";

const inputs = vi.hoisted(() => ({
    sceneInputs: vi.fn(async (view: unknown) => ({
        view: { ...(view as object), plain: true },
        prep: { data: { beats: 3 }, images: {} },
        images: { brand: { tag: "bitmap" } },
    })),
}));

vi.mock("./export-video", () => ({ sceneInputs: inputs.sceneInputs }));
vi.mock("./scene", () => ({
    SCENE_FONTS: { display: "Retail Demo", body: "Valve Oracle", pulp: "Valve Pulp" },
    SCENES: {},
}));

const { PREVIEW_START, previewAssets, previewTime, sceneTiming } = await import("./preview");

const view = (id: string) => ({ id, heroes: [] }) as unknown as EditionView;

afterEach(() => inputs.sceneInputs.mockClear());

describe("video preview assets", () => {
    it("loads the scene through the same inputs the encode worker gets", async () => {
        const v = view("monthly-2026-11");
        const assets = await previewAssets(v, "monthly", "title");
        expect(inputs.sceneInputs).toHaveBeenCalledWith(v, "monthly");
        expect(assets.images).toEqual({ brand: { tag: "bitmap" } });
        expect(assets.data).toEqual({ beats: 3 });
        expect(assets.view).toMatchObject({ id: "monthly-2026-11", plain: true });
    });

    it("times the preview on the export's own timeline for the picked track", async () => {
        const assets = await previewAssets(view("monthly-2026-10"), "monthly", "menu");
        const tl = videoTimeline(musicTrack("menu"));
        expect(assets.timing).toEqual({ seconds: tl.seconds, fps: tl.fps, bars: tl.bars, barSeconds: tl.barSeconds });
        expect(sceneTiming("menu")).toEqual(assets.timing);
    });

    it("loads a view once, whatever the track", async () => {
        const v = view("collectors-season_1");
        await previewAssets(v, "collectors", "title");
        await previewAssets(v, "collectors", "koth");
        expect(inputs.sceneInputs).toHaveBeenCalledTimes(1);
    });

    it("does not load again for the same view rebuilt as a new object", async () => {
        await previewAssets(view("year_end-2026"), "year_end", "menu");
        await previewAssets(view("year_end-2026"), "year_end", "menu");
        expect(inputs.sceneInputs).toHaveBeenCalledTimes(1);
    });

    it("loads again when the view's words change", async () => {
        await previewAssets(view("year_end-2025"), "year_end", "menu");
        await previewAssets({ ...view("year_end-2025"), label: "new words" }, "year_end", "menu");
        expect(inputs.sceneInputs).toHaveBeenCalledTimes(2);
    });
});

describe("video preview frame", () => {
    const seconds = 40;

    it("plays from just past the opening while idle", () => {
        expect(previewTime({ state: "idle" }, seconds)).toEqual({ t: PREVIEW_START * seconds, playing: true });
    });

    it("plays from a picked scene while idle", () => {
        expect(previewTime({ state: "idle" }, seconds, 0.5)).toEqual({ t: 20, playing: true });
        expect(previewTime({ state: "encoding", progress: 0.25 }, seconds, 0.5)).toEqual({ t: 10, playing: false });
    });

    it("holds on the frame being encoded", () => {
        expect(previewTime({ state: "encoding", progress: 0.5 }, seconds)).toEqual({ t: 20, playing: false });
        expect(previewTime({ state: "encoding", progress: 1 }, seconds).t).toBeLessThan(seconds);
    });

    it("holds on the end card once saved", () => {
        const done = previewTime({ state: "done" }, seconds);
        expect(done.playing).toBe(false);
        expect(done.t).toBeGreaterThan(seconds * 0.9);
        expect(done.t).toBeLessThan(seconds);
    });

    it("holds on the opening after a failure", () => {
        expect(previewTime({ state: "error" }, seconds)).toEqual({ t: PREVIEW_START * seconds, playing: false });
    });
});
