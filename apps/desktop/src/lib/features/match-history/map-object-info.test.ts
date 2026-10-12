import { describe, expect, it } from "vitest";
import type { MapItem } from "$lib/generated/types/MapItem";
import { parseApiDetail } from "./api-detail";
import type { MatchDetail, MatchObjective } from "./detail";
import {
    OBJECTIVE_HIGHLIGHT_S,
    campInfo,
    damageSplit,
    highlightOpacity,
    midBossInfo,
    objectiveInfo,
    rowEntries,
    takesTab,
} from "./map-object-info";
import { buildTimeline } from "./timeline";
import paths from "./fixtures/api-paths.json";
import ranked from "./fixtures/api-ranked.json";

function detailOf(fixture: unknown): MatchDetail {
    const detail = parseApiDetail(structuredClone(fixture));
    if (!detail) throw new Error("fixture did not parse");
    return detail;
}

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

describe("highlightOpacity", () => {
    it("is full at the destroy time and fades to nothing over the window", () => {
        expect(highlightOpacity(300, 300)).toBe(1);
        expect(highlightOpacity(300, 300 + OBJECTIVE_HIGHLIGHT_S / 2)).toBeCloseTo(0.5);
        expect(highlightOpacity(300, 300 + OBJECTIVE_HIGHLIGHT_S)).toBe(0);
        expect(highlightOpacity(300, 900)).toBe(0);
    });

    it("is nothing before the destroy time, so scrubbing back clears it", () => {
        expect(highlightOpacity(300, 299.99)).toBe(0);
        expect(highlightOpacity(300, 0)).toBe(0);
    });

    it("fades over a longer window when given one", () => {
        expect(highlightOpacity(300, 310, 20)).toBeCloseTo(0.5);
        expect(highlightOpacity(300, 319, 20)).toBeCloseTo(0.05);
        expect(highlightOpacity(300, 320, 20)).toBe(0);
    });

    it("covers the time every timeline objective marker seeks to", () => {
        const events = buildTimeline(detailOf(paths)).filter((e) => e.kind === "objective");
        expect(events.length).toBeGreaterThan(0);
        for (const e of events) expect(highlightOpacity(e.timeS, e.timeS)).toBe(1);
    });
});

describe("damageSplit", () => {
    it("splits player damage into gun and spirit, with trooper damage beside them", () => {
        const split = damageSplit([objective({ playerDamage: 3514, spiritDamage: 123, creepDamage: 1998 })]);
        expect(split).toEqual({
            gun: 3391,
            spirit: 123,
            trooper: 1998,
            total: 5512,
            shares: { gun: 3391 / 5512, spirit: 123 / 5512, trooper: 1998 / 5512 },
        });
    });

    it("treats spirit damage as part of player damage: guardian totals in a real match agree", () => {
        const guardians = detailOf(ranked).objectives.filter((o) => o.objectiveId <= 4);
        expect(guardians.length).toBeGreaterThan(2);
        const totals = guardians.map((o) => damageSplit([o])!.total);
        const withSpiritOnTop = guardians.map((o) => o.playerDamage + o.creepDamage + o.spiritDamage);
        const spread = (v: number[]) => (Math.max(...v) - Math.min(...v)) / Math.min(...v);
        expect(spread(totals)).toBeLessThan(0.03);
        expect(spread(withSpiritOnTop)).toBeGreaterThan(0.15);
        for (const o of guardians) expect(o.spiritDamage).toBeLessThanOrEqual(o.playerDamage);
    });

    it("has shares that sum to one", () => {
        const { shares } = damageSplit([objective({ playerDamage: 700, spiritDamage: 200, creepDamage: 300 })])!;
        expect(shares.gun + shares.spirit + shares.trooper).toBeCloseTo(1);
    });

    it("sums several entries", () => {
        const split = damageSplit([
            objective({ playerDamage: 100, spiritDamage: 40, creepDamage: 10 }),
            objective({ playerDamage: 50, spiritDamage: 0, creepDamage: 30 }),
        ]);
        expect(split).toMatchObject({ gun: 110, spirit: 40, trooper: 40, total: 190 });
    });

    it("never reports negative gun damage", () => {
        expect(damageSplit([objective({ playerDamage: 10, spiritDamage: 25 })])).toMatchObject({
            gun: 0,
            spirit: 25,
            total: 25,
        });
    });

    it("is null when no damage was recorded", () => {
        expect(damageSplit([objective({})])).toBeNull();
        expect(damageSplit([])).toBeNull();
    });
});

describe("rowEntries", () => {
    it("matches by objective id and team and drops placeholder destroy times", () => {
        const found = rowEntries(row({}), [
            objective({ destroyedS: 1, playerDamage: 5 }),
            objective({ team: "archmother", destroyedS: 300 }),
            objective({ objectiveId: 4, destroyedS: 300 }),
        ]);
        expect(found).toEqual([objective({ playerDamage: 5 })]);
    });

    it("is empty for rows without an objective id", () => {
        expect(rowEntries(row({ kind: "shrine", objectiveId: null }), [objective({})])).toEqual([]);
    });
});

describe("objectiveInfo", () => {
    const objectives = [objective({ destroyedS: 300, playerDamage: 100, spiritDamage: 30, creepDamage: 50 })];

    it("names a lane objective with its lane and owner", () => {
        const info = objectiveInfo(row({ kind: "walker", team: 1, laneSlot: 4 }), [], 0);
        expect(info).toMatchObject({ type: "objective", kind: "walker", team: "archmother" });
        expect(info.lane?.color).toBe("green");
    });

    it("is standing before the destroy time and destroyed from it on", () => {
        expect(objectiveInfo(row({}), objectives, 299).destroyedS).toBeUndefined();
        expect(objectiveInfo(row({}), objectives, 300).destroyedS).toBe(300);
    });

    it("carries the damage split whatever the replay time", () => {
        expect(objectiveInfo(row({}), objectives, 0).damage).toMatchObject({ gun: 70, spirit: 30, trooper: 50 });
    });

    it("gives shrines and patrons a name and team only", () => {
        const shrine = objectiveInfo(row({ kind: "shrine", objectiveId: null, laneSlot: 1 }), objectives, 600);
        expect(shrine).toEqual({ type: "objective", kind: "shrine", team: "hidden-king", damage: null });
        expect(objectiveInfo(row({ kind: "patron", objectiveId: 9, laneSlot: 3 }), [], 0).lane).toBeUndefined();
    });

    it("counts a pair as destroyed only when both halves are", () => {
        const pair = [objective({ objectiveId: 12, destroyedS: 900 }), objective({ objectiveId: 12, destroyedS: 950 })];
        const r = row({ kind: "base_guardian", objectiveId: 12, laneSlot: 1 });
        expect(objectiveInfo(r, pair, 920, 2).destroyedS).toBeUndefined();
        expect(objectiveInfo(r, pair, 950, 2).destroyedS).toBe(950);
    });
});

describe("campInfo", () => {
    it("maps camp kinds to tiers and nothing else", () => {
        expect(campInfo("camp_weak")).toEqual({ type: "camp", tier: "weak" });
        expect(campInfo("camp_vault")).toEqual({ type: "camp", tier: "vault" });
        expect(campInfo("guardian")).toBeNull();
    });
});

describe("takesTab", () => {
    it("keeps objectives and the mid boss in the Tab order", () => {
        expect(takesTab(objectiveInfo(row({}), [], 0))).toBe(true);
        expect(takesTab(midBossInfo([], 0))).toBe(true);
    });

    it("skips camps, shops and teleporters, which only carry a name", () => {
        expect(takesTab({ type: "camp", tier: "weak" })).toBe(false);
        expect(takesTab({ type: "shop" })).toBe(false);
        expect(takesTab({ type: "teleporter" })).toBe(false);
    });
});

describe("midBossInfo", () => {
    const kills = detailOf(ranked).midBoss;

    it("has no last kill before the first one", () => {
        expect(midBossInfo(kills, 1209)).toEqual({ type: "mid-boss" });
    });

    it("reports the latest kill at or before the replay time", () => {
        expect(midBossInfo(kills, 1210)).toEqual({
            type: "mid-boss",
            lastKill: { destroyedS: 1210, killedBy: "archmother", claimedBy: "archmother" },
        });
        const two = [...kills, { destroyedS: 1700, killedBy: "hidden-king" as const }];
        expect(midBossInfo(two, 1800).lastKill?.destroyedS).toBe(1700);
        expect(midBossInfo(two, 1500).lastKill?.destroyedS).toBe(1210);
    });
});
