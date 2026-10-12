import { describe, expect, it } from "vitest";
import { teleporterIconSvg } from "$lib/features/gamedata/map-icons";
import type { MapItem } from "$lib/generated/types/MapItem";
import type { MatchObjective } from "./detail";
import { ENEMY_LANE_COLOR, LANE_COLORS } from "./lane-lines";
import {
    MAP_OBJECT_SIZE,
    MAP_OBJECT_STEMS,
    MAP_OBJECT_Z,
    hitZ,
    isObjectiveDead,
    layerKey,
    layerScale,
    mapObjects,
    pairBaseGuardians,
    shopGuardians,
    teleporterDataUri,
    type MapObjectIcons,
    type MapObjectsInput,
} from "./map-objects";
import { OBJECTIVE_HIGHLIGHT_S } from "./map-object-info";
import { MID_BOSS_CLAIM_MARKER_S } from "./map-spawns";
import { mapPercent } from "./replay";
import { WORLD_RADIUS } from "./paths";

const row = (over: Partial<MapItem>): MapItem => ({
    kind: "guardian",
    team: 0,
    laneSlot: 3,
    objectiveId: 3,
    x: 0,
    y: -1792,
    z: 0,
    className: "",
    subclass: null,
    name: null,
    hasIcon: true,
    ...over,
});

const objective = (over: Partial<MatchObjective>): MatchObjective => ({
    objectiveId: 3,
    team: "hidden-king",
    creepDamage: 0,
    playerDamage: 0,
    spiritDamage: 0,
    ...over,
});

const ICONS: MapObjectIcons = Object.fromEntries(MAP_OBJECT_STEMS.map((s) => [s, `${s}.png`]));

const input = (over: Partial<MapObjectsInput> = {}): MapObjectsInput => ({
    rows: [],
    objectives: [],
    viewerTeam: "hidden-king",
    time: 600,
    radius: WORLD_RADIUS,
    icons: ICONS,
    showCamps: true,
    midBoss: [],
    ...over,
});

describe("isObjectiveDead", () => {
    it("is dead from the destroy time on, alive before", () => {
        const r = row({});
        const o = [objective({ destroyedS: 300 })];
        expect(isObjectiveDead(r, o, 299)).toBe(false);
        expect(isObjectiveDead(r, o, 300)).toBe(true);
        expect(isObjectiveDead(r, o, 900)).toBe(true);
    });

    it("matches on objective id and team", () => {
        const o = [objective({ objectiveId: 3, team: "archmother", destroyedS: 100 })];
        expect(isObjectiveDead(row({ team: 0 }), o, 500)).toBe(false);
        expect(isObjectiveDead(row({ team: 1 }), o, 500)).toBe(true);
        expect(isObjectiveDead(row({ team: 1, objectiveId: 4 }), o, 500)).toBe(false);
    });

    it("is alive when the row has no objective id (shrines)", () => {
        const o = [objective({ objectiveId: 10, destroyedS: 100 })];
        expect(isObjectiveDead(row({ kind: "shrine", objectiveId: null }), o, 500)).toBe(false);
    });

    it("is alive when the match has no entry or never destroyed it", () => {
        expect(isObjectiveDead(row({}), [], 500)).toBe(false);
        expect(isObjectiveDead(row({}), [objective({})], 500)).toBe(false);
    });

    it("ignores the one-second placeholder destroy time", () => {
        expect(isObjectiveDead(row({}), [objective({ destroyedS: 1 })], 500)).toBe(false);
    });
});

describe("mapObjects", () => {
    it("positions objects with the shared world to map transform", () => {
        const r = row({ x: 5628, y: -5060 });
        const [o] = mapObjects(input({ rows: [r], radius: 9000 }));
        const p = mapPercent(5628, -5060, 9000);
        expect(o!.left).toBe(p.left);
        expect(o!.top).toBe(p.top);
    });

    it("picks the icon stems per kind", () => {
        const parts = (r: Partial<MapItem>) => mapObjects(input({ rows: [row(r)] }))[0]!.parts.map((p) => p.src);
        expect(parts({ kind: "guardian" })).toEqual(["boss_health.png", "boss_health_fill.png"]);
        expect(parts({ kind: "base_guardian" })).toEqual(["boss_health.png", "boss_health_fill.png"]);
        expect(parts({ kind: "walker" })).toEqual(["boss_health_t2.png", "boss_health_fill_t2.png"]);
        expect(parts({ kind: "shrine", objectiveId: null })).toEqual(["boss_health_t2.png", "boss_health_fill_t2.png"]);
        expect(parts({ kind: "patron", objectiveId: 9 })).toEqual([
            "boss_health_final.png",
            "boss_health_final_fill.png",
        ]);
        expect(parts({ kind: "mid_boss", team: null, laneSlot: null, objectiveId: null })).toEqual([
            "super_neutral_marker.png",
        ]);
    });

    it("maps camp kinds to the game's camp icons without a tint", () => {
        const camp = (kind: MapItem["kind"]) =>
            mapObjects(input({ rows: [row({ kind, team: null, laneSlot: null, objectiveId: null })] }))[0]!;
        expect(camp("camp_weak").parts).toEqual([{ src: "neutral_small.png", tint: null }]);
        expect(camp("camp_medium").parts).toEqual([{ src: "neutral_medium.png", tint: null }]);
        expect(camp("camp_strong").parts).toEqual([{ src: "neutral_large.png", tint: null }]);
        expect(camp("camp_vault").parts).toEqual([{ src: "neutral_vault.png", tint: null }]);
    });

    it("leaves out kinds that are not drawn in this slice", () => {
        const kinds: MapItem["kind"][] = ["base_sentry", "souls_dealer", "urn_return", "buff_spawner"];
        expect(mapObjects(input({ rows: kinds.map((kind) => row({ kind })) }))).toEqual([]);
    });

    it("draws nothing for a row whose icons are not loaded", () => {
        expect(mapObjects(input({ rows: [row({})], icons: {} }))).toEqual([]);
        const noFill = { ...ICONS, boss_health_fill: undefined };
        expect(mapObjects(input({ rows: [row({})], icons: noFill }))).toEqual([]);
    });

    it("hides camps when the layer is off but keeps objectives and the mid boss", () => {
        const rows = [
            row({ kind: "camp_weak", team: null, laneSlot: null, objectiveId: null }),
            row({ kind: "mid_boss", team: null, laneSlot: null, objectiveId: null }),
            row({ kind: "walker", objectiveId: 7 }),
        ];
        const kinds = mapObjects(input({ rows, showCamps: false })).map((o) => o.kind);
        expect(kinds).toEqual(["mid_boss", "walker"]);
    });

    it("tints lane objectives by lane for the viewer's team and red for the other", () => {
        const rows = [
            row({ kind: "walker", team: 0, laneSlot: 1, objectiveId: 5 }),
            row({ kind: "walker", team: 1, laneSlot: 1, objectiveId: 5 }),
        ];
        const [mine, theirs] = mapObjects(input({ rows }));
        expect(mine!.parts[1]!.tint).toBe(LANE_COLORS[1]);
        expect(theirs!.parts[1]!.tint).toBe(ENEMY_LANE_COLOR);
        const flipped = mapObjects(input({ rows, viewerTeam: "archmother" }));
        expect(flipped[0]!.parts[1]!.tint).toBe(ENEMY_LANE_COLOR);
        expect(flipped[1]!.parts[1]!.tint).toBe(LANE_COLORS[1]);
    });

    it("tints patrons and shrines with the ally colour or the enemy colour", () => {
        const rows = [
            row({ kind: "patron", team: 0, objectiveId: 9 }),
            row({ kind: "patron", team: 1, objectiveId: 9 }),
            row({ kind: "shrine", team: 0, laneSlot: 1, objectiveId: null }),
        ];
        const out = mapObjects(input({ rows }));
        expect(out[0]!.parts[1]!.tint).toBe("#FFEFD7");
        expect(out[1]!.parts[1]!.tint).toBe(ENEMY_LANE_COLOR);
        expect(out[2]!.parts[1]!.tint).toBe("#FFEFD7");
    });

    it("treats the Hidden King as ally when the viewer is not in the match", () => {
        const rows = [
            row({ kind: "patron", team: 0, objectiveId: 9 }),
            row({ kind: "patron", team: 1, objectiveId: 9 }),
        ];
        const out = mapObjects(input({ rows, viewerTeam: null }));
        expect(out[0]!.parts[1]!.tint).toBe("#FFEFD7");
        expect(out[1]!.parts[1]!.tint).toBe(ENEMY_LANE_COLOR);
    });

    it("drops a destroyed objective once its highlight window is over", () => {
        const rows = [row({ kind: "walker", objectiveId: 7, laneSlot: 3 })];
        const objectives = [objective({ objectiveId: 7, destroyedS: 400 })];
        expect(mapObjects(input({ rows, objectives, time: 399 }))).toHaveLength(1);
        expect(mapObjects(input({ rows, objectives, time: 400 + OBJECTIVE_HIGHLIGHT_S }))).toEqual([]);
    });

    it("keeps shrines and rows without a match entry always drawn", () => {
        const rows = [row({ kind: "shrine", objectiveId: null }), row({ kind: "guardian", objectiveId: 8 })];
        const objectives = [objective({ objectiveId: 10, destroyedS: 5 })];
        expect(mapObjects(input({ rows, objectives, time: 900 }))).toHaveLength(2);
    });

    it("needs no dead marker icon", () => {
        expect(MAP_OBJECT_STEMS).not.toContain("boss_health_dead");
        const { boss_health_dead: _dead, ...icons } = ICONS;
        expect(mapObjects(input({ rows: [row({})], icons }))).toHaveLength(1);
    });

    it("sizes objects as a fraction of the map side", () => {
        const size = (kind: MapItem["kind"]) =>
            mapObjects(input({ rows: [row({ kind, team: 0, objectiveId: null })] }))[0]!.size;
        expect(size("guardian")).toBe(0.088);
        expect(size("base_guardian")).toBe(0.069);
        expect(size("walker")).toBe(0.138);
        expect(size("shrine")).toBe(0.09);
        expect(size("patron")).toBe(0.173);
        expect(size("mid_boss")).toBe(0.15);
        expect(size("camp_weak")).toBeCloseTo(30 / 560, 6);
        expect(size("camp_vault")).toBeCloseTo(30 / 560, 6);
    });

    it("flips the Hidden King patron vertically and nothing else", () => {
        const rows = [
            row({ kind: "patron", team: 0, objectiveId: 9 }),
            row({ kind: "patron", team: 1, objectiveId: 9 }),
            row({ kind: "walker", team: 0, objectiveId: 7 }),
            row({ kind: "mid_boss", team: null, laneSlot: null, objectiveId: null }),
        ];
        const out = mapObjects(input({ rows }));
        expect(out.map((o) => [o.kind, o.flipY])).toEqual([
            ["patron", true],
            ["patron", false],
            ["walker", false],
            ["mid_boss", false],
            ["guardian", false],
            ["guardian", false],
        ]);
    });

    it("draws a guardian diamond on each patron's flat edge with the guardian look and tint rule", () => {
        const rows = [
            row({ kind: "patron", team: 0, objectiveId: 9, x: -1280, y: -8034 }),
            row({ kind: "patron", team: 1, objectiveId: 9, x: 1280, y: 8048 }),
        ];
        const out = mapObjects(input({ rows }));
        const [mine, theirs] = out.filter((o) => o.kind === "guardian");
        const patron = mapPercent(-1280, -8034, WORLD_RADIUS);
        expect(mine!.left).toBe(patron.left);
        expect(mine!.top).toBe(patron.top);
        expect(mine!.size).toBe(MAP_OBJECT_SIZE.guardian);
        expect(mine!.parts.map((p) => p.src)).toEqual(["boss_health.png", "boss_health_fill.png"]);
        expect(mine!.parts[1]!.tint).toBe("#FFEFD7");
        expect(theirs!.parts[1]!.tint).toBe(ENEMY_LANE_COLOR);
        expect(mine!.z).toBeGreaterThanOrEqual(out[0]!.z);
    });

    it("drops the patron diamond with its patron", () => {
        const rows = [row({ kind: "patron", team: 1, objectiveId: 9 })];
        const objectives = [objective({ objectiveId: 9, team: "archmother", destroyedS: 500 })];
        expect(mapObjects(input({ rows, objectives, time: 499 }))).toHaveLength(2);
        expect(mapObjects(input({ rows, objectives, time: 500 })).map((o) => o.key)).toEqual(["0"]);
        expect(mapObjects(input({ rows, objectives, time: 500 + OBJECTIVE_HIGHLIGHT_S }))).toEqual([]);
    });

    it("orders the layers: camps under mid boss under dots under objectives", () => {
        expect(MAP_OBJECT_Z).not.toHaveProperty("deadObjective");
        const z = (kind: MapItem["kind"], team: number | null = null) =>
            mapObjects(input({ rows: [row({ kind, team, objectiveId: null })] }))[0]!.z;
        expect(z("camp_weak")).toBeLessThan(z("mid_boss"));
        expect(z("mid_boss")).toBeLessThan(MAP_OBJECT_Z.enemyDot);
        expect(MAP_OBJECT_Z.enemyDot).toBeLessThan(MAP_OBJECT_Z.friendlyDot);
        expect(z("guardian", 0)).toBeGreaterThan(MAP_OBJECT_Z.friendlyDot);
        expect(z("guardian", 0)).toBeLessThan(MAP_OBJECT_Z.localDot);
        expect(z("patron", 1)).toBe(z("guardian", 0));
    });
});

describe("spawn times", () => {
    const neutral = (kind: MapItem["kind"]) => row({ kind, team: null, laneSlot: null, objectiveId: null });
    const boss = neutral("mid_boss");
    const kill = { destroyedS: 900, killedBy: "hidden-king", claimedBy: "archmother" } as const;

    it("draws each camp from its tier's first spawn on", () => {
        const rows = [neutral("camp_weak"), neutral("camp_medium"), neutral("camp_strong"), neutral("camp_vault")];
        const kinds = (time: number) => mapObjects(input({ rows, time })).map((o) => o.kind);
        expect(kinds(119)).toEqual([]);
        expect(kinds(120)).toEqual(["camp_weak"]);
        expect(kinds(300)).toEqual(["camp_weak", "camp_medium"]);
        expect(kinds(480)).toEqual(["camp_weak", "camp_medium", "camp_strong", "camp_vault"]);
        expect(kinds(3000)).toHaveLength(4);
    });

    it("draws the mid boss from its first spawn on, flagged as an estimate", () => {
        expect(mapObjects(input({ rows: [boss], time: 599 }))).toEqual([]);
        const [o] = mapObjects(input({ rows: [boss], time: 600 }));
        expect(o!.opacity).toBeUndefined();
        expect(o!.estimated).toBe(true);
    });

    it("hides the mid boss from a kill until its estimated respawn and fades it in", () => {
        const at = (time: number) =>
            mapObjects(input({ rows: [boss], midBoss: [kill], time })).filter((o) => o.key === "0");
        expect(at(899)).toHaveLength(1);
        expect(at(900)).toEqual([]);
        expect(at(1200)).toEqual([]);
        expect(at(1317.5)[0]!.opacity).toBeCloseTo(0.5, 6);
        expect(at(1320)[0]!.opacity).toBeUndefined();
    });

    it("marks a kill at the mid boss position for a short window, tinted for the claiming team", () => {
        const at = (time: number, viewerTeam: MapObjectsInput["viewerTeam"] = "hidden-king") =>
            mapObjects(input({ rows: [boss], midBoss: [kill], time, viewerTeam }));
        expect(at(899).map((o) => o.key)).toEqual(["0"]);
        const [mark] = at(905);
        const p = mapPercent(boss.x, boss.y, WORLD_RADIUS);
        expect(at(905)).toHaveLength(1);
        expect(mark!.key).toBe("0-claim");
        expect([mark!.left, mark!.top]).toEqual([p.left, p.top]);
        expect(mark!.size).toBe(MAP_OBJECT_SIZE.midBossClaim);
        expect(mark!.size).toBeLessThan(MAP_OBJECT_SIZE.midBoss);
        expect(mark!.estimated).toBeUndefined();
        expect(mark!.parts).toEqual([{ src: "super_neutral_marker.png", tint: ENEMY_LANE_COLOR }]);
        expect(at(905, "archmother")[0]!.parts[0]!.tint).toBe("#FFEFD7");
        expect(at(905, null)[0]!.parts[0]!.tint).toBe(ENEMY_LANE_COLOR);
        expect(at(920)).toEqual([]);
    });

    it("draws the kill marker over every player dot, since the killers stand on the mid boss spot", () => {
        const [mark] = mapObjects(input({ rows: [boss], midBoss: [kill], time: 900 }));
        expect(mark!.key).toBe("0-claim");
        expect(mark!.z).toBeGreaterThan(MAP_OBJECT_Z.localDot);
        expect(mark!.z).toBeGreaterThan(MAP_OBJECT_Z.objective);
        expect(hitZ(mark!)).toBeLessThan(MAP_OBJECT_Z.enemyDot);
    });

    it("rings the kill marker in the claiming team's relation colour, fading over the marker window", () => {
        const at = (time: number, viewerTeam: MapObjectsInput["viewerTeam"] = "hidden-king") =>
            mapObjects(input({ rows: [boss], midBoss: [kill], time, viewerTeam }))[0]!;
        expect(at(900).highlight).toEqual({ opacity: 1, color: ENEMY_LANE_COLOR, solid: true });
        expect(at(900 + MID_BOSS_CLAIM_MARKER_S / 2).highlight!.opacity).toBeCloseTo(0.5);
        expect(at(900 + MID_BOSS_CLAIM_MARKER_S - 1).highlight!.opacity).toBeCloseTo(1 / MID_BOSS_CLAIM_MARKER_S);
        expect(at(905, "archmother").highlight!.color).toBe("#FFEFD7");
    });

    it("rings the marker of the latest kill only", () => {
        const midBoss = [kill, { destroyedS: 1400, killedBy: "hidden-king" } as const];
        const [mark] = mapObjects(input({ rows: [boss], midBoss, time: 1405 }));
        expect(mark!.highlight).toEqual({ opacity: 0.75, color: "#FFEFD7", solid: true });
    });

    it("tints the kill marker for the killing team when no team claimed it", () => {
        const midBoss = [{ destroyedS: 900, killedBy: "hidden-king" } as const];
        const [mark] = mapObjects(input({ rows: [boss], midBoss, time: 905 }));
        expect(mark!.parts[0]!.tint).toBe("#FFEFD7");
        expect(mapObjects(input({ rows: [boss], midBoss: [{ destroyedS: 900 }], time: 905 }))).toEqual([]);
    });
});

describe("shops", () => {
    const spots: [number | null, number, number][] = [
        [null, -3920, 1120],
        [null, 3920, -1120],
        [0, -8832, -1944],
        [0, 1024, -1248],
        [0, 6432, -1760],
        [1, 8832, 1944],
        [1, -910, 1248],
        [1, -6432, 1760],
    ];
    const shops = spots.map(([team, x, y]) => row({ kind: "shop", team, laneSlot: null, objectiveId: null, x, y }));

    it("loads the game's shop icon with the other object icons", () => {
        expect(MAP_OBJECT_STEMS).toContain("minimap_shop");
    });

    it("draws every shop at its table position with the game's art as it is", () => {
        const out = mapObjects(input({ rows: shops }));
        expect(out).toHaveLength(8);
        out.forEach((o, i) => {
            const p = mapPercent(spots[i]![1], spots[i]![2], WORLD_RADIUS);
            expect(o.kind).toBe("shop");
            expect([o.left, o.top]).toEqual([p.left, p.top]);
            expect(o.parts).toEqual([{ src: "minimap_shop.png", tint: null }]);
            expect(o.size).toBe(MAP_OBJECT_SIZE.shop);
            expect(o.flipY).toBe(false);
        });
        expect(MAP_OBJECT_SIZE.shop).toBe(0.035);
    });

    it("looks the same for either viewer, whichever team's side the shop is on", () => {
        const look = (viewerTeam: MapObjectsInput["viewerTeam"]) =>
            mapObjects(input({ rows: shops, viewerTeam })).map((o) => o.parts);
        expect(look("archmother")).toEqual(look("hidden-king"));
        expect(look(null)).toEqual(look("hidden-king"));
    });

    it("stays for the whole match, from the first second on", () => {
        for (const time of [0, 1, 119, 600, 3000]) {
            const out = mapObjects(input({ rows: shops, time }));
            expect(out).toHaveLength(8);
            for (const o of out) {
                expect(o.opacity).toBeUndefined();
                expect(o.highlight).toBeUndefined();
                expect(o.estimated).toBeUndefined();
            }
        }
    });

    it("stays when the camps layer is off", () => {
        const rows = [...shops, row({ kind: "camp_weak", team: null, laneSlot: null, objectiveId: null })];
        expect(mapObjects(input({ rows, showCamps: false })).map((o) => o.kind)).toEqual(Array(8).fill("shop"));
    });

    it("sits at the camp level, under the mid boss, objectives and every dot", () => {
        const [shop] = mapObjects(input({ rows: shops }));
        expect(shop!.z).toBe(MAP_OBJECT_Z.neutral);
        expect(shop!.z).toBeLessThan(MAP_OBJECT_Z.midBoss);
        expect(shop!.z).toBeLessThan(MAP_OBJECT_Z.enemyDot);
        expect(shop!.z).toBeLessThan(MAP_OBJECT_Z.objective);
    });

    it("carries a name-only tooltip", () => {
        expect(mapObjects(input({ rows: shops })).map((o) => o.info)).toEqual(Array(8).fill({ type: "shop" }));
    });

    it("draws nothing when the shop icon is not loaded", () => {
        const { minimap_shop: _shop, ...icons } = ICONS;
        expect(mapObjects(input({ rows: shops, icons }))).toEqual([]);
    });
});

describe("teleporters", () => {
    const spots: [number, number][] = [
        [-3904, 1792],
        [-3584, -2784],
        [3584, 2784],
        [3904, -1792],
    ];
    const teleporters = spots.map(([x, y]) =>
        row({ kind: "teleporter", team: null, laneSlot: null, objectiveId: null, x, y }),
    );

    it("draws all four at their table positions with the baked icon", () => {
        const out = mapObjects(input({ rows: teleporters }));
        expect(out).toHaveLength(4);
        out.forEach((o, i) => {
            const p = mapPercent(spots[i]![0], spots[i]![1], WORLD_RADIUS);
            expect(o.kind).toBe("teleporter");
            expect([o.left, o.top]).toEqual([p.left, p.top]);
            expect(o.parts).toEqual([{ src: teleporterDataUri(), tint: null }]);
            expect(o.flipY).toBe(false);
        });
    });

    it("carries the game's icon as an SVG data URL", () => {
        const uri = teleporterDataUri();
        expect(uri.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
        expect(decodeURIComponent(uri.slice(uri.indexOf(",") + 1))).toBe(teleporterIconSvg());
    });

    it("is two thirds of a camp icon, as the game's 16 px disc is to its 24 px camp box", () => {
        expect(MAP_OBJECT_SIZE.teleporter).toBe((MAP_OBJECT_SIZE.camp * 16) / 24);
        expect(MAP_OBJECT_SIZE.teleporter).toBeCloseTo(20 / 560, 10);
        for (const o of mapObjects(input({ rows: teleporters }))) expect(o.size).toBe(MAP_OBJECT_SIZE.teleporter);
    });

    it("mirrors the two on the right half so the figure runs toward its exit", () => {
        const out = mapObjects(input({ rows: teleporters }));
        expect(out.map((o) => o.flipX ?? false)).toEqual([false, false, true, true]);
    });

    it("draws without any icon loaded from an install", () => {
        expect(mapObjects(input({ rows: teleporters, icons: {} }))).toHaveLength(4);
    });

    it("stays for the whole match, from the first second on", () => {
        for (const time of [0, 1, 119, 600, 3000]) {
            const out = mapObjects(input({ rows: teleporters, time }));
            expect(out).toHaveLength(4);
            for (const o of out) {
                expect(o.opacity).toBeUndefined();
                expect(o.highlight).toBeUndefined();
                expect(o.estimated).toBeUndefined();
            }
        }
    });

    it("stays when the camps layer is off", () => {
        const rows = [...teleporters, row({ kind: "camp_weak", team: null, laneSlot: null, objectiveId: null })];
        expect(mapObjects(input({ rows, showCamps: false })).map((o) => o.kind)).toEqual(Array(4).fill("teleporter"));
    });

    it("looks the same for either viewer", () => {
        const look = (viewerTeam: MapObjectsInput["viewerTeam"]) =>
            mapObjects(input({ rows: teleporters, viewerTeam }));
        expect(look("archmother")).toEqual(look("hidden-king"));
        expect(look(null)).toEqual(look("hidden-king"));
    });

    it("sits under the camps, as in the game", () => {
        const [teleporter] = mapObjects(input({ rows: teleporters }));
        expect(MAP_OBJECT_Z.teleporter).toBe(1);
        expect(teleporter!.z).toBe(MAP_OBJECT_Z.teleporter);
        expect(teleporter!.z).toBeLessThan(MAP_OBJECT_Z.neutral);
        expect(hitZ(teleporter!)).toBe(1);
    });

    it("carries a name-only tooltip", () => {
        expect(mapObjects(input({ rows: teleporters })).map((o) => o.info)).toEqual(
            Array(4).fill({ type: "teleporter" }),
        );
    });
});

describe("layerScale", () => {
    it("leaves an object that is not mirrored without a scale", () => {
        expect(layerScale({ flipY: false })).toBeUndefined();
    });

    it("mirrors left to right and top to bottom on separate axes", () => {
        expect(layerScale({ flipY: false, flipX: true })).toBe("-1 1");
        expect(layerScale({ flipY: true })).toBe("1 -1");
        expect(layerScale({ flipY: true, flipX: true })).toBe("-1 -1");
    });

    it("mirrors only the Hidden King patron top to bottom and no other object left to right", () => {
        const rows = [
            row({ kind: "patron", team: 0, objectiveId: 9 }),
            row({ kind: "patron", team: 1, objectiveId: 9 }),
            row({ kind: "shop", team: null, laneSlot: null, objectiveId: null, x: 3920 }),
            row({ kind: "camp_weak", team: null, laneSlot: null, objectiveId: null, x: 3000 }),
        ];
        const scales = mapObjects(input({ rows })).map((o) => [o.key, layerScale(o)]);
        expect(scales).toEqual([
            ["0", "1 -1"],
            ["1", undefined],
            ["2", undefined],
            ["3", undefined],
            ["0-core", undefined],
            ["1-core", undefined],
        ]);
    });
});

describe("lane shops and their guardians", () => {
    const guardianSpots: [number, number, number, number][] = [
        [0, 1, -8192, -1856],
        [0, 3, 0, -1792],
        [0, 4, 7040, -1984],
        [1, 1, -7040, 1984],
        [1, 3, 0, 1792],
        [1, 4, 8128, 1856],
    ];
    const shopSpots: [number | null, number | null, number, number][] = [
        [null, null, -3920, 1120],
        [null, null, 3920, -1120],
        [0, 1, -8832, -1944],
        [0, 3, 1024, -1248],
        [0, 4, 6432, -1760],
        [1, 1, 8832, 1944],
        [1, 3, -910, 1248],
        [1, 4, -6432, 1760],
    ];
    const rows = [
        ...guardianSpots.map(([team, laneSlot, x, y]) => row({ team, laneSlot, objectiveId: laneSlot, x, y })),
        ...shopSpots.map(([team, laneSlot, x, y]) => row({ kind: "shop", team, laneSlot, objectiveId: null, x, y })),
    ];
    const SHOP = (n: number) => guardianSpots.length + n;
    const shopKeys = (objectives: MatchObjective[], time: number) =>
        mapObjects(input({ rows, objectives, time }))
            .filter((o) => o.kind === "shop")
            .map((o) => o.key);
    const allShops = shopSpots.map((_, n) => `${SHOP(n)}`);

    it("gives each team shop the nearest guardian of its own team, six different guardians", () => {
        const owners = shopGuardians(rows);
        expect([...owners.entries()]).toEqual([
            [SHOP(2), 0],
            [SHOP(3), 1],
            [SHOP(4), 2],
            [SHOP(5), 5],
            [SHOP(6), 4],
            [SHOP(7), 3],
        ]);
        expect(new Set(owners.values()).size).toBe(6);
        for (const [shop, guardian] of owners) expect(rows[shop]!.team).toBe(rows[guardian]!.team);
    });

    it("pairs within 1200 world units, with every other guardian of the team at least 4900 further", () => {
        const distance = (a: MapItem, b: MapItem) => Math.hypot(a.x - b.x, a.y - b.y);
        const near: number[] = [];
        for (const [shop, guardian] of shopGuardians(rows)) {
            const own = distance(rows[shop]!, rows[guardian]!);
            near.push(Math.round(own));
            rows.forEach((other, i) => {
                if (other.kind !== "guardian" || other.team !== rows[shop]!.team || i === guardian) return;
                expect(distance(rows[shop]!, other) - own).toBeGreaterThan(4900);
            });
        }
        expect(near).toEqual([646, 1160, 648, 709, 1060, 648]);
    });

    it("leaves the two teamless shops without a guardian, over 3000 world units from any", () => {
        const owners = shopGuardians(rows);
        for (const n of [0, 1]) {
            expect(owners.has(SHOP(n))).toBe(false);
            const nearest = Math.min(
                ...rows
                    .filter((r) => r.kind === "guardian")
                    .map((g) => Math.hypot(g.x - rows[SHOP(n)]!.x, g.y - rows[SHOP(n)]!.y)),
            );
            expect(Math.round(nearest)).toBe(3237);
        }
    });

    it("ignores guardians of the other team and rows that are not guardians", () => {
        const shop = row({ kind: "shop", team: 0, objectiveId: null, x: 0, y: 0 });
        const others = [row({ team: 1, x: 10, y: 0 }), row({ kind: "walker", team: 0, x: 20, y: 0 })];
        expect(shopGuardians([shop, ...others]).size).toBe(0);
        expect(shopGuardians([shop, ...others, row({ team: 0, x: 900, y: 0 })]).get(0)).toBe(3);
    });

    it("removes a lane shop at its guardian's destroy time, with no highlight window", () => {
        const objectives = [objective({ objectiveId: 4, team: "archmother", destroyedS: 400 })];
        const without = allShops.filter((k) => k !== `${SHOP(5)}`);
        expect(shopKeys(objectives, 399)).toEqual(allShops);
        expect(shopKeys(objectives, 400)).toEqual(without);
        expect(shopKeys(objectives, 3000)).toEqual(without);
        const guardian = mapObjects(input({ rows, objectives, time: 400 })).find((o) => o.key === "5");
        expect(guardian!.highlight).toBeDefined();
    });

    it("shows the shop again when the replay is rewound to before the destroy time", () => {
        const objectives = [objective({ objectiveId: 1, team: "hidden-king", destroyedS: 400 })];
        expect(shopKeys(objectives, 900)).not.toContain(`${SHOP(2)}`);
        expect(shopKeys(objectives, 399)).toEqual(allShops);
    });

    it("agrees with the guardian's own death rule at every time", () => {
        const objectives = [
            objective({ objectiveId: 1, team: "hidden-king", destroyedS: 300 }),
            objective({ objectiveId: 3, team: "archmother", destroyedS: 1 }),
            objective({ objectiveId: 4, team: "hidden-king" }),
        ];
        const owners = shopGuardians(rows);
        for (const time of [0, 1, 299, 300, 301, 2000]) {
            const drawn = shopKeys(objectives, time);
            for (const [shop, guardian] of owners) {
                expect(drawn.includes(`${shop}`)).toBe(!isObjectiveDead(rows[guardian]!, objectives, time));
            }
        }
    });

    it("keeps the shop of a guardian the match has no entry for, and the teamless shops", () => {
        const objectives = guardianSpots
            .filter(([team, lane]) => !(team === 0 && lane === 3))
            .map(([team, lane]) =>
                objective({ objectiveId: lane, team: team === 0 ? "hidden-king" : "archmother", destroyedS: 200 }),
            );
        expect(shopKeys(objectives, 3000)).toEqual([`${SHOP(0)}`, `${SHOP(1)}`, `${SHOP(3)}`]);
    });

    it("keeps the shop when only the other team's guardian in that lane died", () => {
        const objectives = [objective({ objectiveId: 3, team: "archmother", destroyedS: 200 })];
        expect(shopKeys(objectives, 900)).toEqual(allShops.filter((k) => k !== `${SHOP(6)}`));
    });
});

describe("base guardian pairs", () => {
    const pos: [number, number, number, number][] = [
        [0, 1, -3040, -6756],
        [0, 1, -3040, -6396],
        [0, 3, -1488, -5458.7],
        [0, 3, -1072, -5454.2],
        [0, 4, 480, -6756],
        [0, 4, 480, -6396],
        [1, 1, -480, 6396],
        [1, 1, -480, 6788],
        [1, 3, 1064, 5454],
        [1, 3, 1496, 5454],
        [1, 4, 3040, 6396],
        [1, 4, 3040, 6788],
    ];
    const bg = (team: number, laneSlot: number, x: number, y: number, objectiveId = 11 + laneSlot) =>
        row({ kind: "base_guardian", team, laneSlot, objectiveId, x, y });
    const rows = pos.map(([t, l, x, y]) => bg(t, l, x, y));

    it("pairs the twelve rows into three pairs per team by proximity", () => {
        const pairs = pairBaseGuardians([...rows].reverse());
        expect(pairs).toHaveLength(6);
        const reversed = [...rows].reverse();
        for (const [a, b] of pairs) {
            expect(reversed[a]!.team).toBe(reversed[b]!.team);
            expect(reversed[a]!.laneSlot).toBe(reversed[b]!.laneSlot);
        }
    });

    it("leaves an odd row unpaired and ignores other kinds", () => {
        const mixed = [rows[0]!, rows[1]!, rows[2]!, row({ kind: "walker" })];
        expect(pairBaseGuardians(mixed)).toEqual([[0, 1]]);
    });

    it("draws one diamond per pair at the midpoint with the base guardian size", () => {
        const out = mapObjects(input({ rows: rows.slice(2, 4) }));
        expect(out).toHaveLength(1);
        const mid = mapPercent((-1488 + -1072) / 2, (-5458.7 + -5454.2) / 2, WORLD_RADIUS);
        expect(out[0]!.left).toBeCloseTo(mid.left, 6);
        expect(out[0]!.top).toBeCloseTo(mid.top, 6);
        expect(out[0]!.size).toBe(MAP_OBJECT_SIZE.baseGuardian);
        expect(out[0]!.parts.map((p) => [p.src, p.clip ?? null])).toEqual([
            ["boss_health.png", null],
            ["boss_health_fill.png", "inset(0 50% 0 0)"],
            ["boss_health_fill.png", "inset(0 0 0 50%)"],
        ]);
    });

    it("empties the half of a destroyed guardian and drops the diamond when both are dead", () => {
        const pair = rows.slice(0, 2);
        const dead = (...times: number[]) =>
            times.map((destroyedS) => objective({ objectiveId: 12, team: "hidden-king", destroyedS }));
        const clips = (time: number, objectives: MatchObjective[]) =>
            mapObjects(input({ rows: pair, objectives, time }))[0]
                ?.parts.slice(1)
                .map((p) => p.clip);
        const left = "inset(0 50% 0 0)";
        const right = "inset(0 0 0 50%)";
        expect(clips(50, dead(100, 200))).toEqual([left, right]);
        expect(clips(150, dead(100, 200))).toEqual([right]);
        expect(clips(150, dead(200, 100))).toEqual([right]);
        expect(clips(200 + OBJECTIVE_HIGHLIGHT_S, dead(100, 200))).toBeUndefined();
        expect(clips(150, dead(100))).toEqual([right]);
    });

    it("tints the pair by lane for the viewer's team and red for the other", () => {
        const mine = mapObjects(input({ rows: rows.slice(0, 2) }))[0]!;
        const theirs = mapObjects(input({ rows: rows.slice(6, 8) }))[0]!;
        expect(mine.parts[1]!.tint).toBe(LANE_COLORS[1]);
        expect(theirs.parts[1]!.tint).toBe(ENEMY_LANE_COLOR);
    });
});

describe("destroyed highlight", () => {
    const rows = [row({ kind: "walker", objectiveId: 7, laneSlot: 3 })];
    const objectives = [objective({ objectiveId: 7, destroyedS: 400, playerDamage: 90, spiritDamage: 30 })];
    const at = (time: number, over: Partial<MapObjectsInput> = {}) =>
        mapObjects(input({ rows, objectives, time, ...over }));

    it("keeps the icon in place with a fading ring in the relation colour", () => {
        const alive = at(399)[0]!;
        const fresh = at(400)[0]!;
        expect(alive.highlight).toBeUndefined();
        expect(fresh).toMatchObject({ key: alive.key, left: alive.left, top: alive.top, size: alive.size });
        expect(fresh.parts).toEqual(alive.parts);
        expect(fresh.highlight).toEqual({ opacity: 1, color: LANE_COLORS[3] });
        expect(at(405)[0]!.highlight!.opacity).toBeCloseTo(0.5);
        expect(at(405, { viewerTeam: "archmother" })[0]!.highlight!.color).toBe(ENEMY_LANE_COLOR);
    });

    it("comes back when the replay is scrubbed back into the window", () => {
        expect(at(400 + OBJECTIVE_HIGHLIGHT_S)).toEqual([]);
        expect(at(403)[0]!.highlight).toBeDefined();
    });

    it("reports the destroy time and the damage split", () => {
        expect(at(402)[0]!.info).toMatchObject({
            type: "objective",
            kind: "walker",
            destroyedS: 400,
            damage: { gun: 60, spirit: 30, trooper: 0 },
        });
    });

    it("never highlights a placeholder destroy time", () => {
        const placeholder = [objective({ objectiveId: 7, destroyedS: 1 })];
        expect(at(1, { objectives: placeholder })[0]!.highlight).toBeUndefined();
    });

    it("highlights a base guardian pair after its second half falls", () => {
        const pair = [
            row({ kind: "base_guardian", objectiveId: 12, laneSlot: 1, x: -3040, y: -6756 }),
            row({ kind: "base_guardian", objectiveId: 12, laneSlot: 1, x: -3040, y: -6396 }),
        ];
        const dead = [100, 200].map((destroyedS) => objective({ objectiveId: 12, destroyedS }));
        const out = (time: number) => mapObjects(input({ rows: pair, objectives: dead, time }));
        expect(out(150)[0]!.highlight).toBeUndefined();
        expect(out(150)[0]!.info).not.toHaveProperty("destroyedS");
        expect(out(204)[0]!.highlight!.opacity).toBeCloseTo(0.6);
        expect(out(204)[0]!.info).toMatchObject({ kind: "base_guardian", destroyedS: 200 });
    });
});

describe("object info and hover targets", () => {
    const boss = row({ kind: "mid_boss", team: null, laneSlot: null, objectiveId: null });

    it("describes objectives, camps and the mid boss", () => {
        const rows = [
            row({ kind: "guardian", team: 1, laneSlot: 1, objectiveId: 1 }),
            row({ kind: "shrine", objectiveId: null }),
            row({ kind: "camp_strong", team: null, laneSlot: null, objectiveId: null }),
            boss,
        ];
        const info = mapObjects(input({ rows, time: 700 })).map((o) => o.info);
        expect(info[0]).toMatchObject({ type: "objective", kind: "guardian", team: "archmother" });
        expect(info[1]).toEqual({ type: "objective", kind: "shrine", team: "hidden-king", damage: null });
        expect(info[2]).toEqual({ type: "camp", tier: "strong" });
        expect(info[3]).toEqual({ type: "mid-boss" });
    });

    it("gives the claim marker the last mid boss kill", () => {
        const kill = { destroyedS: 900, killedBy: "hidden-king" as const, claimedBy: "archmother" as const };
        const out = mapObjects(input({ rows: [boss], midBoss: [kill], time: 905 }));
        expect(out.map((o) => o.info)).toEqual([{ type: "mid-boss", lastKill: kill }]);
    });

    it("leaves the patron diamond without info so the patron under it takes the hover", () => {
        const out = mapObjects(input({ rows: [row({ kind: "patron", team: 1, objectiveId: 9 })] }));
        expect(out.map((o) => [o.key, o.info?.type])).toEqual([
            ["0", "objective"],
            ["0-core", undefined],
        ]);
    });

    it("puts every hover target under every player dot, in the drawing order", () => {
        const z = (kind: MapItem["kind"], team: number | null = null) =>
            hitZ(mapObjects(input({ rows: [row({ kind, team, objectiveId: null })] }))[0]!);
        const lowestDot = Math.min(MAP_OBJECT_Z.enemyDot, MAP_OBJECT_Z.friendlyDot, MAP_OBJECT_Z.localDot);
        expect(z("guardian", 0)).toBeLessThan(lowestDot);
        expect(z("camp_weak")).toBeLessThan(z("mid_boss"));
        expect(z("mid_boss")).toBeLessThan(z("guardian", 0));
    });
});

describe("layerKey", () => {
    it("is unique across the layers of every object, including patron diamonds and half fills", () => {
        const rows = [
            row({ kind: "patron", team: 0, objectiveId: 9 }),
            row({ kind: "patron", team: 1, objectiveId: 9 }),
            row({ kind: "base_guardian", team: 0, laneSlot: 1, objectiveId: 12, x: -3040, y: -6756 }),
            row({ kind: "base_guardian", team: 0, laneSlot: 1, objectiveId: 12, x: -3040, y: -6396 }),
        ];
        for (const o of mapObjects(input({ rows }))) {
            const keys = o.parts.map(layerKey);
            expect(new Set(keys).size).toBe(keys.length);
        }
        const pair = mapObjects(input({ rows }))[2]!;
        expect(pair.parts).toHaveLength(3);
        expect(pair.parts[1]!.src).toBe(pair.parts[2]!.src);
    });
});
