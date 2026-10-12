import { describe, expect, it } from "vitest";
import type { MapItem } from "$lib/generated/types/MapItem";
import {
    CAMP_FIGHT_GAP_S,
    CAMP_MIN_FIGHT_S,
    CAMP_NEIGHBOUR_FRACTION,
    CAMP_RADIUS_CAP,
    CAMP_RESPAWN_S,
    CAMP_STACK_DISTANCE,
    campClears,
    campDownAt,
    type CampFightSample,
} from "./camp-clears";
import { CAMP_FIRST_SPAWN_S } from "./map-spawns";
import type { DecodedPaths } from "./paths";

const row = (kind: MapItem["kind"], x: number, y: number): MapItem => ({
    kind,
    team: null,
    laneSlot: null,
    objectiveId: null,
    x,
    y,
    z: 0,
    className: "",
    subclass: null,
    name: null,
    hasIcon: true,
});

interface Step {
    from: number;
    to: number;
    x: number;
    y: number;
    alive?: boolean;
    combatType?: number;
}

const FAR = 9000;
const LENGTH = 2000;

/** One sample per second, idle and far from every camp except inside the given steps. */
function player(steps: Step[], length = LENGTH): { samples: CampFightSample[] } {
    const samples: CampFightSample[] = Array.from({ length }, (_, t) => ({
        t,
        x: FAR,
        y: FAR,
        alive: true,
        combatType: 0,
    }));
    for (const s of steps) {
        for (let t = s.from; t <= s.to; t++) {
            samples[t] = { t, x: s.x, y: s.y, alive: s.alive ?? true, combatType: s.combatType ?? 3 };
        }
    }
    return { samples };
}

const paths = (...series: { samples: CampFightSample[] }[]) => ({ intervalS: 1, series });
const fight = (from: number, to: number, x = 100, y = 0): Step => ({ from, to, x, y });
const down = (clearedS: number, respawnS: number) => ({ clearedS, respawnS });

describe("campClears", () => {
    it("takes a camp down from the last second of a fight until its tier's respawn", () => {
        const rows = [row("camp_medium", 0, 0)];
        const out = campClears(rows, paths(player([fight(400, 404)])), LENGTH);
        expect(out.get(0)).toEqual([down(404, 404 + CAMP_RESPAWN_S.camp_medium)]);
    });

    it("uses each tier's own respawn interval", () => {
        const rows = [
            row("camp_weak", 0, 0),
            row("camp_medium", 5000, 0),
            row("camp_strong", 0, 5000),
            row("camp_vault", 5000, 5000),
        ];
        const out = campClears(
            rows,
            paths(
                player([fight(500, 504, 0, 0)]),
                player([fight(500, 504, 5000, 0)]),
                player([fight(500, 504, 0, 5000)]),
                player([fight(500, 504, 5000, 5000)]),
            ),
            LENGTH,
        );
        expect([0, 1, 2, 3].map((i) => out.get(i)![0]!.respawnS - 504)).toEqual([85, 290, 335, 300]);
    });

    it("keys the result by row index and gives every camp row an entry", () => {
        const rows = [row("guardian", 0, 0), row("camp_weak", 0, 0), row("shop", 50, 0), row("camp_strong", 5000, 0)];
        const out = campClears(rows, paths(player([fight(200, 204, 0, 0)])), LENGTH);
        expect([...out.keys()]).toEqual([1, 3]);
        expect(out.get(1)).toEqual([down(204, 204 + CAMP_RESPAWN_S.camp_weak)]);
        expect(out.get(3)).toEqual([]);
    });

    it("accepts the decoded match paths as they are", () => {
        const decoded: DecodedPaths = {
            intervalS: 1,
            durationS: 500,
            series: [
                {
                    slot: 2,
                    team: "hidden-king",
                    samples: player([fight(400, 404)], 500).samples.map((s) => ({ ...s, health: 80, moveType: 0 })),
                },
            ],
        };
        expect(campClears([row("camp_medium", 0, 0)], decoded, 500).get(0)).toEqual([
            down(404, 404 + CAMP_RESPAWN_S.camp_medium),
        ]);
    });

    describe("spawn state", () => {
        it("ignores fighting before the camp's first spawn", () => {
            const first = CAMP_FIRST_SPAWN_S.camp_medium;
            const rows = [row("camp_medium", 0, 0)];
            const early = campClears(rows, paths(player([fight(first - 20, first - 10)])), LENGTH);
            expect(early.get(0)).toEqual([]);
            const straddling = campClears(rows, paths(player([fight(first - 20, first + 5)])), LENGTH);
            expect(straddling.get(0)).toEqual([down(first + 5, first + 5 + CAMP_RESPAWN_S.camp_medium)]);
        });

        it("drops fighting at a camp that is down when no other camp is in range", () => {
            const rows = [row("camp_medium", 0, 0)];
            const respawn = 404 + CAMP_RESPAWN_S.camp_medium;
            const out = campClears(
                rows,
                paths(player([fight(400, 404), fight(500, 510), fight(respawn + 10, respawn + 14)])),
                LENGTH,
            );
            expect(out.get(0)).toEqual([
                down(404, respawn),
                down(respawn + 14, respawn + 14 + CAMP_RESPAWN_S.camp_medium),
            ]);
        });

        it("gives fighting at a down camp to the next nearest camp that is up", () => {
            const rows = [row("camp_medium", 0, 0), row("camp_medium", 400, 0)];
            const out = campClears(rows, paths(player([fight(400, 404), fight(500, 504)])), LENGTH);
            expect(out.get(0)).toEqual([down(404, 404 + CAMP_RESPAWN_S.camp_medium)]);
            expect(out.get(1)).toEqual([down(504, 504 + CAMP_RESPAWN_S.camp_medium)]);
        });

        it("drops fighting when the nearest camp is down and the next one has not spawned", () => {
            const rows = [row("camp_medium", 0, 0), row("camp_strong", 400, 0)];
            const out = campClears(rows, paths(player([fight(310, 314), fight(350, 354)])), LENGTH);
            expect(out.get(0)).toHaveLength(1);
            expect(out.get(1)).toEqual([]);
        });
    });

    describe("attribution", () => {
        it("goes to the nearest camp", () => {
            const rows = [row("camp_medium", 0, 0), row("camp_medium", 1200, 0)];
            const out = campClears(rows, paths(player([fight(400, 404, 500, 0)])), LENGTH);
            expect(out.get(0)).toHaveLength(1);
            expect(out.get(1)).toEqual([]);
        });

        it("caps the radius per tier, tighter for vaults", () => {
            const at = (kind: MapItem["kind"], distance: number) =>
                campClears([row(kind, 0, 0)], paths(player([fight(500, 504, distance, 0)])), LENGTH).get(0)!.length;
            expect(CAMP_RADIUS_CAP.camp_vault).toBeLessThan(CAMP_RADIUS_CAP.camp_medium);
            expect(at("camp_medium", CAMP_RADIUS_CAP.camp_medium)).toBe(1);
            expect(at("camp_medium", CAMP_RADIUS_CAP.camp_medium + 1)).toBe(0);
            expect(at("camp_vault", CAMP_RADIUS_CAP.camp_vault)).toBe(1);
            expect(at("camp_vault", CAMP_RADIUS_CAP.camp_vault + 1)).toBe(0);
        });

        it("shrinks the radius to a fraction of the distance to the nearest neighbour", () => {
            const gap = 800;
            const reach = gap * CAMP_NEIGHBOUR_FRACTION;
            expect(gap).toBeGreaterThanOrEqual(CAMP_STACK_DISTANCE);
            expect(reach).toBeLessThan(CAMP_RADIUS_CAP.camp_medium);
            const rows = [row("camp_medium", 0, 0), row("camp_medium", gap, 0)];
            const at = (x: number) => campClears(rows, paths(player([fight(400, 404, x, 0)])), LENGTH);
            expect(at(-reach).get(0)).toHaveLength(1);
            expect(at(-reach - 1).get(0)).toEqual([]);
            expect(at(-reach - 1).get(1)).toEqual([]);
        });

        it("does not shrink the radius for a stacked neighbour", () => {
            const gap = CAMP_STACK_DISTANCE - 1;
            const rows = [row("camp_medium", 0, 0), row("camp_medium", gap, 0)];
            const out = campClears(rows, paths(player([fight(400, 404, -gap, 0)])), LENGTH);
            expect(out.get(0)).toHaveLength(1);
        });

        it("prefers the nearer of two stacked camps that are both up, then the lower row", () => {
            const rows = [row("camp_medium", 0, 0), row("camp_medium", 400, 0)];
            const nearSecond = campClears(rows, paths(player([fight(400, 404, 250, 0)])), LENGTH);
            expect([nearSecond.get(0)!.length, nearSecond.get(1)!.length]).toEqual([0, 1]);
            const tie = campClears(rows, paths(player([fight(400, 404, 200, 0)])), LENGTH);
            expect([tie.get(0)!.length, tie.get(1)!.length]).toEqual([1, 0]);
        });
    });

    describe("fights", () => {
        const rows = [row("camp_medium", 0, 0)];
        const clears = (...steps: Step[]) => campClears(rows, paths(player(steps)), LENGTH).get(0)!;

        it("needs the minimum number of fighting seconds", () => {
            expect(clears(fight(400, 400 + CAMP_MIN_FIGHT_S - 1))).toHaveLength(1);
            expect(clears(fight(400, 400 + CAMP_MIN_FIGHT_S - 2))).toEqual([]);
        });

        it("does not count a dead player", () => {
            const end = 400 + CAMP_MIN_FIGHT_S - 1;
            expect(clears({ from: 400, to: end, x: 100, y: 0 })).toHaveLength(1);
            expect(clears({ from: 400, to: end, x: 100, y: 0, alive: false })).toEqual([]);
            expect(clears(fight(400, end - 1), { from: end, to: end + 5, x: 100, y: 0, alive: false })).toEqual([]);
        });

        it("counts only seconds in combat with neutrals", () => {
            for (const combatType of [0, 1, 2, 4]) {
                expect(clears({ from: 400, to: 420, x: 100, y: 0, combatType })).toEqual([]);
            }
            expect(clears({ from: 400, to: 420, x: 100, y: 0, combatType: 3 })).toHaveLength(1);
        });

        it("bridges a short gap inside one fight and splits on a longer one", () => {
            const resume = 401 + CAMP_FIGHT_GAP_S;
            expect(clears(fight(400, 401), fight(resume, resume))).toEqual([
                down(resume, resume + CAMP_RESPAWN_S.camp_medium),
            ]);
            expect(clears(fight(400, 401), fight(resume + 1, resume + 1))).toEqual([]);
        });

        it("merges several players on one camp into one clear", () => {
            const out = campClears(
                rows,
                paths(
                    player([fight(400, 404, 100, 0)]),
                    player([fight(402, 409, -150, 50)]),
                    player([fight(411, 412)]),
                ),
                LENGTH,
            );
            expect(out.get(0)).toEqual([down(412, 412 + CAMP_RESPAWN_S.camp_medium)]);
        });

        it("counts a second shared by two players once", () => {
            const out = campClears(rows, paths(player([fight(400, 401)]), player([fight(400, 401, -100, 0)])), LENGTH);
            expect(CAMP_MIN_FIGHT_S).toBeGreaterThan(2);
            expect(out.get(0)).toEqual([]);
        });
    });

    describe("intervals", () => {
        const rows = [row("camp_weak", 0, 0)];

        it("never overlap for one camp and stay sorted", () => {
            const steps = Array.from({ length: 60 }, (_, i) => fight(130 + i * 30, 130 + i * 30 + 6));
            const list = campClears(rows, paths(player(steps)), LENGTH).get(0)!;
            expect(list.length).toBeGreaterThan(5);
            for (let i = 1; i < list.length; i++) {
                expect(list[i]!.clearedS).toBeGreaterThanOrEqual(list[i - 1]!.respawnS);
            }
            for (const d of list) expect(d.respawnS).toBeGreaterThan(d.clearedS);
        });

        it("keep the tier's respawn when it falls after the match end", () => {
            const duration = 1000;
            const out = campClears(rows, paths(player([fight(980, 984)])), duration);
            expect(out.get(0)).toEqual([down(984, 984 + CAMP_RESPAWN_S.camp_weak)]);
        });

        it("leave a camp that is down at the match end down on the final frame", () => {
            const duration = 1000;
            const late = campClears(rows, paths(player([fight(980, 984)])), duration).get(0);
            expect(campDownAt(late, duration)).toBe(true);
            const back = duration - CAMP_RESPAWN_S.camp_weak;
            const respawned = campClears(rows, paths(player([fight(back - 4, back)])), duration).get(0);
            expect(respawned).toEqual([down(back, duration)]);
            expect(campDownAt(respawned, duration - 0.1)).toBe(true);
            expect(campDownAt(respawned, duration)).toBe(false);
        });

        it("never start after the match duration, and only the last one can end after it", () => {
            const duration = 1000;
            const steps = Array.from({ length: 40 }, (_, i) => fight(130 + i * 30, 130 + i * 30 + 6));
            const list = campClears(rows, paths(player(steps)), duration).get(0)!;
            expect(list.length).toBeGreaterThan(5);
            expect(list.at(-1)!.respawnS).toBeGreaterThan(duration);
            for (const d of list) expect(d.clearedS).toBeLessThanOrEqual(duration);
            for (const d of list.slice(0, -1)) expect(d.respawnS).toBeLessThanOrEqual(duration);
        });

        it("ignore samples recorded after the match duration", () => {
            const out = campClears(rows, paths(player([fight(998, 1010)])), 1000);
            expect(out.get(0)).toEqual([down(1000, 1000 + CAMP_RESPAWN_S.camp_weak)]);
            expect(campClears(rows, paths(player([fight(1001, 1010)])), 1000).get(0)).toEqual([]);
        });
    });
});

describe("campDownAt", () => {
    const list = [down(100, 200), down(300, 400)];

    it("is true from the clear up to the respawn", () => {
        expect(campDownAt(list, 99.9)).toBe(false);
        expect(campDownAt(list, 100)).toBe(true);
        expect(campDownAt(list, 199.9)).toBe(true);
        expect(campDownAt(list, 200)).toBe(false);
        expect(campDownAt(list, 250)).toBe(false);
        expect(campDownAt(list, 350)).toBe(true);
        expect(campDownAt(list, 400)).toBe(false);
    });

    it("is false for a camp with no clears", () => {
        expect(campDownAt([], 100)).toBe(false);
        expect(campDownAt(undefined, 100)).toBe(false);
    });
});
