import { describe, expect, it } from "vitest";
import { parseApiDetail } from "./api-detail";
import type { MatchDetail } from "./detail";
import { WORLD_RADIUS, decodePaths, positionsAt, worldToMap, type DecodedPaths, type PathSample } from "./paths";
import fixture from "./fixtures/api-paths.json";

type Json = Record<string, any>;

function detailOf(edit?: (info: Json) => void): MatchDetail {
    const root = structuredClone(fixture) as Json;
    edit?.(root.match_info);
    const detail = parseApiDetail(root);
    if (!detail) throw new Error("fixture did not parse");
    return detail;
}

const rawPath = (slot: number) => fixture.match_info.match_paths.paths.find((p) => p.player_slot === slot)!;

describe("parser", () => {
    it("carries the recorded paths", () => {
        const d = detailOf();
        expect(d.matchPaths?.intervalS).toBe(1);
        expect(d.matchPaths?.paths.map((p) => p.slot).sort()).toEqual([2, 6]);
        expect(d.matchPaths?.paths[0].xPos.length).toBe(175);
    });

    it("is null when the body has no paths", () => {
        expect(detailOf((i) => delete i.match_paths).matchPaths).toBeNull();
        expect(detailOf((i) => (i.match_paths = null)).matchPaths).toBeNull();
        expect(detailOf((i) => (i.match_paths = { paths: [] })).matchPaths).toBeNull();
    });

    it("is null for a provisional capture", () => {
        const root = structuredClone(fixture) as Json;
        root.match_info.match_paths = null;
        expect(parseApiDetail(root, { source: "provisional" })?.matchPaths).toBeNull();
    });

    it("is null with a non-positive resolution", () => {
        expect(detailOf((i) => (i.match_paths.x_resolution = 0)).matchPaths).toBeNull();
    });
});

describe("decodePaths", () => {
    it("returns null without paths", () => {
        expect(decodePaths(detailOf((i) => (i.match_paths = null)))).toBeNull();
    });

    it("decodes samples into world space using the per-player bounds", () => {
        const decoded = decodePaths(detailOf())!;
        const raw = rawPath(2);
        const s = decoded.series.find((x) => x.slot === 2)!;
        const expectedX = raw.x_min + (raw.x_pos[3] / 16383) * (raw.x_max - raw.x_min);
        const expectedY = raw.y_min + (raw.y_pos[3] / 16383) * (raw.y_max - raw.y_min);
        expect(s.samples[3].t).toBe(3);
        expect(s.samples[3].x).toBeCloseTo(expectedX, 6);
        expect(s.samples[3].y).toBeCloseTo(expectedY, 6);
        expect(s.samples[3].alive).toBe(true);
        expect(s.samples[3].health).toBe(raw.health[3]);
    });

    it("joins teams from the player row, not path order", () => {
        const decoded = decodePaths(detailOf())!;
        expect(decoded.series.find((s) => s.slot === 2)!.team).toBe("hidden-king");
        expect(decoded.series.find((s) => s.slot === 6)!.team).toBe("archmother");
    });

    it("marks zero-health samples dead and keeps the last live position", () => {
        const s = decodePaths(detailOf())!.series.find((x) => x.slot === 2)!;
        expect(rawPath(2).health[150]).toBe(0);
        expect(s.samples[150].alive).toBe(false);
        expect(s.samples[150].health).toBe(0);
        expect(s.samples[150].x).toBe(s.samples[144].x);
        expect(s.samples[150].y).toBe(s.samples[144].y);
    });

    it("never emits the (x_min, y_min) sentinel", () => {
        const raw = rawPath(2);
        const s = decodePaths(detailOf())!.series.find((x) => x.slot === 2)!;
        expect(s.samples.some((p) => p.x === raw.x_min && p.y === raw.y_min)).toBe(false);
    });

    it("reports the duration as the last sample time", () => {
        expect(decodePaths(detailOf())!.durationS).toBe(174);
    });

    it("trims ragged arrays to the shortest coordinate array", () => {
        const decoded = decodePaths(
            detailOf((i) => {
                i.match_paths.paths[0].y_pos = i.match_paths.paths[0].y_pos.slice(0, 10);
            }),
        )!;
        const lengths = decoded.series.map((s) => s.samples.length).sort((a, b) => a - b);
        expect(lengths).toEqual([10, 175]);
    });

    it("treats missing health as alive", () => {
        const decoded = decodePaths(
            detailOf((i) => {
                delete i.match_paths.paths[0].health;
            }),
        )!;
        const s = decoded.series.find((x) => x.slot === fixture.match_info.match_paths.paths[0].player_slot)!;
        expect(s.samples.every((p) => p.alive)).toBe(true);
    });

    it("drops paths whose slot has no player", () => {
        const decoded = decodePaths(
            detailOf((i) => {
                i.match_paths.paths[0].player_slot = 99;
            }),
        )!;
        expect(decoded.series.map((s) => s.slot)).toEqual([6]);
    });
});

describe("positionsAt", () => {
    const decoded = decodePaths(detailOf())!;

    const sample = (t: number, x: number, y: number, alive = true): PathSample => ({
        t,
        x,
        y,
        alive,
        combatType: 0,
        moveType: 0,
    });
    const synthetic = (intervalS: number, samples: PathSample[]): DecodedPaths => ({
        intervalS,
        durationS: samples.at(-1)!.t,
        series: [{ slot: 1, team: "archmother", samples }],
    });
    const one = (d: DecodedPaths, t: number) => positionsAt(d, t)[0];

    it("returns the sample itself on a sample time", () => {
        const at = positionsAt(decoded, 3).find((p) => p.slot === 2)!;
        const s = decoded.series.find((x) => x.slot === 2)!;
        expect(at.x).toBe(s.samples[3].x);
        expect(at.y).toBe(s.samples[3].y);
        expect(at.alive).toBe(true);
    });

    it("lerps between the surrounding samples", () => {
        const d = synthetic(1, [sample(0, 0, 0), sample(1, 100, -200), sample(2, 100, -200)]);
        expect(one(d, 0.5)).toMatchObject({ x: 50, y: -100, alive: true });
        expect(one(d, 0.25)).toMatchObject({ x: 25, y: -50 });
    });

    it("lerps at any interval", () => {
        const d = synthetic(5, [sample(0, 0, 0), sample(5, 100, 0), sample(10, 100, 100)]);
        expect(one(d, 2.5).x).toBeCloseTo(50, 9);
        expect(one(d, 7.5)).toMatchObject({ x: 100, y: 50 });
    });

    it("holds the earlier sample when the next one is dead", () => {
        const d = synthetic(1, [sample(0, 0, 0), sample(1, 100, 100, false), sample(2, 100, 100, false)]);
        expect(one(d, 0.5)).toMatchObject({ x: 0, y: 0, alive: true });
    });

    it("does not slide from a death spot to the respawn", () => {
        const d = synthetic(1, [sample(0, 0, 0, false), sample(1, 5000, 5000), sample(2, 5000, 5000)]);
        expect(one(d, 0.9)).toMatchObject({ x: 0, y: 0, alive: false });
        expect(one(d, 1)).toMatchObject({ x: 5000, y: 5000, alive: true });
    });

    it("clamps at the last sample", () => {
        const d = synthetic(1, [sample(0, 0, 0), sample(1, 100, 0)]);
        expect(one(d, 1)).toMatchObject({ x: 100 });
        expect(one(d, 50)).toMatchObject({ x: 100 });
        expect(one(d, -3)).toMatchObject({ x: 0 });
    });

    it("clamps before the start and past the end", () => {
        const s = decoded.series.find((x) => x.slot === 6)!;
        expect(positionsAt(decoded, -5).find((p) => p.slot === 6)!.x).toBe(s.samples[0].x);
        expect(positionsAt(decoded, 9999).find((p) => p.slot === 6)!.x).toBe(s.samples.at(-1)!.x);
    });

    it("reports dead players as not alive", () => {
        expect(positionsAt(decoded, 150).find((p) => p.slot === 2)!.alive).toBe(false);
    });

    it("skips a series with no samples", () => {
        const empty = { ...decoded, series: [{ slot: 1, team: "archmother" as const, samples: [] }] };
        expect(positionsAt(empty, 1)).toEqual([]);
    });
});

describe("worldToMap", () => {
    it("places the world centre in the middle of the image", () => {
        expect(worldToMap(0, 0, 1000)).toEqual({ x: 500, y: 500 });
    });

    it("maps the world corners, flipping y", () => {
        expect(worldToMap(-WORLD_RADIUS, -WORLD_RADIUS, 1000)).toEqual({ x: 0, y: 1000 });
        expect(worldToMap(WORLD_RADIUS, WORLD_RADIUS, 1000)).toEqual({ x: 1000, y: 0 });
    });

    it("scales with the requested size", () => {
        expect(worldToMap(WORLD_RADIUS / 2, 0, 200)).toEqual({ x: 150, y: 100 });
    });
});
