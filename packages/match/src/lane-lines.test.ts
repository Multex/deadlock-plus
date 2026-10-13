import { describe, expect, it } from "vitest";
import type { LaneLine } from "@deadlock-plus/ipc-types/LaneLine";
import type { MapItem } from "@deadlock-plus/ipc-types/MapItem";
import { ENEMY_LANE_COLOR, LANE_COLORS, laneStrokes } from "./lane-lines";
import { WORLD_RADIUS } from "./paths";

type Node = [number, number, number];

const line = (over: Partial<LaneLine> = {}): LaneLine => ({
    laneNum: 4,
    laneSlot: 3,
    markerSlot: 0,
    startTeam: 0,
    midIndex: 2,
    nodes: [
        [0, -8000, 0],
        [0, -4000, 0],
        [0, 0, 0],
        [0, 4000, 0],
        [0, 8000, 0],
    ],
    ...over,
});

const item = (over: Partial<MapItem>): MapItem => ({
    kind: "guardian",
    team: 0,
    laneSlot: 3,
    objectiveId: null,
    x: 0,
    y: 0,
    z: 0,
    className: "",
    subclass: null,
    name: null,
    hasIcon: true,
    ...over,
});

const table = (lanes: LaneLine[], rows: MapItem[] = []) => ({ lanes, rows });
const R = WORLD_RADIUS;

const coords = (points: string): number[][] => points.split(" ").map((p) => p.split(",").map(Number));
const ys = (points: string): number[] => coords(points).map((p) => p[1]!);

describe("laneStrokes", () => {
    it("colours the viewer's half with the lane colour and the other half red-orange", () => {
        const strokes = laneStrokes(table([line()]), "hidden-king", R);
        expect(strokes).toHaveLength(2);
        expect(strokes.find((s) => s.team === "hidden-king")?.color).toBe(LANE_COLORS[3]);
        expect(strokes.find((s) => s.team === "archmother")?.color).toBe(ENEMY_LANE_COLOR);
        expect([LANE_COLORS[1], LANE_COLORS[3], LANE_COLORS[4]]).toEqual(["#FFDF40", "#2EC7E6", "#6BB247"]);
        expect(ENEMY_LANE_COLOR).toBe("#DC4C2F");
    });

    it("never flips the map: Hidden King is at the bottom for every viewer", () => {
        const strokes = laneStrokes(table([line()]), "archmother", R);
        const hk = strokes.find((s) => s.team === "hidden-king")!;
        const am = strokes.find((s) => s.team === "archmother")!;
        expect(Math.min(...ys(hk.points))).toBeGreaterThanOrEqual(50);
        expect(Math.max(...ys(am.points))).toBeLessThanOrEqual(50);
        expect(am.color).toBe(LANE_COLORS[3]);
        expect(hk.color).toBe(ENEMY_LANE_COLOR);
    });

    it("treats Hidden King as the viewer when the viewer is not in the match", () => {
        const strokes = laneStrokes(table([line()]), null, R);
        expect(strokes.find((s) => s.team === "hidden-king")?.color).toBe(LANE_COLORS[3]);
    });

    it("assigns halves from startTeam and midIndex", () => {
        const flipped = line({
            startTeam: 1,
            midIndex: 1,
            nodes: [
                [0, 8000, 0],
                [0, 4000, 0],
                [0, 0, 0],
                [0, -8000, 0],
            ],
        });
        const strokes = laneStrokes(table([flipped]), "hidden-king", R);
        const am = strokes.find((s) => s.team === "archmother")!;
        const hk = strokes.find((s) => s.team === "hidden-king")!;
        expect(ys(am.points)).toHaveLength(2);
        expect(Math.max(...ys(am.points))).toBeLessThanOrEqual(50);
        expect(ys(hk.points)).toHaveLength(3);
    });

    it("clips each half at the projection of its guardian, base first", () => {
        const guardian = item({ team: 0, x: 100, y: -6000 });
        const strokes = laneStrokes(table([line()], [guardian]), "hidden-king", R);
        const hk = strokes.find((s) => s.team === "hidden-king")!;
        const am = strokes.find((s) => s.team === "archmother")!;
        const pts = coords(hk.points);
        expect(pts).toHaveLength(2);
        expect(pts[0]![1]).toBeCloseTo(50 + (8000 / R) * 50);
        expect(pts[1]![0]).toBeCloseTo(50);
        expect(pts[1]![1]).toBeCloseTo(50 + (6000 / R) * 50);
        expect(ys(am.points)).toHaveLength(3);
    });

    it("keeps the whole half when its guardian is missing", () => {
        const strokes = laneStrokes(table([line()], [item({ team: 1, laneSlot: 1 })]), "hidden-king", R);
        expect(strokes.find((s) => s.team === "hidden-king")?.points.split(" ")).toHaveLength(3);
    });

    describe("base approach", () => {
        const patrons = [
            item({ kind: "patron", team: 0, laneSlot: null, x: 100, y: -8000 }),
            item({ kind: "patron", team: 1, laneSlot: null, x: 100, y: 8000 }),
        ];
        const d = 0.022 * 16000;
        const slanted = (slot: number, dx: number) =>
            line({
                laneSlot: slot,
                nodes: [
                    [dx - 2000, -7400, 0],
                    [dx - 1500, -6800, 0],
                    [dx - 3000, -4000, 0],
                    [0, 0, 0],
                    [0, 4000, 0],
                    [0, 8000, 0],
                ],
                midIndex: 3,
            });
        const lanes = [slanted(1, -2000), slanted(3, 0), slanted(4, 2000)];
        const strokes = laneStrokes(table(lanes, patrons), "hidden-king", R);
        const get = (slot: number, team: string) =>
            coords(strokes.find((s) => s.laneSlot === slot && s.team === team)!.points);
        const px = (wx: number) => 50 + (wx / R) * 50;

        it("runs each lane straight and vertical into the patron's column", () => {
            for (const team of ["hidden-king", "archmother"]) {
                for (const [slot, offset] of [
                    [1, -d],
                    [3, 0],
                    [4, d],
                ] as const) {
                    const pts = get(slot, team);
                    expect(pts[0]![0]).toBeCloseTo(px(100 + offset));
                    expect(pts[1]![0]).toBeCloseTo(px(100 + offset));
                }
            }
        });

        it("orders the columns left, centre, right", () => {
            const [l, c, r] = [1, 3, 4].map((s) => get(s, "hidden-king")[0]![0]!);
            expect(l).toBeLessThan(c);
            expect(c).toBeLessThan(r);
            expect(c).toBeCloseTo(px(100));
        });

        it("ends on the map edge past the patron, never flipped", () => {
            expect(get(3, "hidden-king")[0]![1]).toBeCloseTo(100);
            expect(get(3, "archmother")[0]![1]).toBeCloseTo(0);
            const hkColumn = get(3, "hidden-king")[1]!;
            expect(hkColumn[1]).toBeCloseTo(50 + (7040 / R) * 50);
        });

        it("does not extrapolate along the first spline segment", () => {
            const pts = get(1, "hidden-king");
            expect(pts[0]![0]).toBeCloseTo(pts[1]![0]);
            expect(pts.slice(1).every(([, y]) => y! <= 50 + (7040 / R) * 50 + 0.001)).toBe(true);
        });

        it("keeps the column when the half is clipped at its guardian", () => {
            const guardian = item({ team: 0, laneSlot: 3, x: 0, y: -2000 });
            const hk = coords(
                laneStrokes(table([slanted(3, 0)], [...patrons, guardian]), "hidden-king", R).find(
                    (s) => s.team === "hidden-king",
                )!.points,
            );
            expect(hk[0]![1]).toBeCloseTo(100);
            expect(hk[0]![0]).toBeCloseTo(px(100));
        });

        it("scales the column with the art radius", () => {
            const wide = coords(
                laneStrokes(table([slanted(3, 0)], patrons), "hidden-king", R * 2).find(
                    (s) => s.team === "hidden-king",
                )!.points,
            );
            expect(wide[0]![0]).toBeCloseTo(50 + (100 / (R * 2)) * 50);
        });
    });

    it("draws one line per lane: the marker slot closest to the lane's objectives", () => {
        const off = (dx: number, markerSlot: number) =>
            line({ markerSlot, nodes: line().nodes.map(([x, y, z]) => [x + dx, y, z] as Node) });
        const rows = [
            item({ kind: "walker", team: 0, x: 210, y: -3000 }),
            item({ kind: "walker", team: 1, x: 190, y: 3000 }),
        ];
        const strokes = laneStrokes(table([off(0, 0), off(200, 1), off(400, 2), off(600, 3)], rows), "hidden-king", R);
        expect(strokes).toHaveLength(2);
        expect(strokes.every((s) => s.markerSlot === 1)).toBe(true);
    });

    it("emits nothing for an empty table or a line with no known start team", () => {
        expect(laneStrokes(table([]), "hidden-king", R)).toEqual([]);
        expect(laneStrokes(table([line({ startTeam: null })]), "hidden-king", R)).toEqual([]);
    });

    it("scales with the art radius", () => {
        const nodes: Node[] = [
            [R, 0, 0],
            [R, 1, 0],
        ];
        const strokes = laneStrokes(table([line({ nodes, midIndex: 0 })]), "hidden-king", R * 2);
        expect(coords(strokes[0]!.points)[0]![0]).toBeCloseTo(75);
    });
});
