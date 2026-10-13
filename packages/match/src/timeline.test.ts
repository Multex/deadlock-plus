import { describe, expect, it } from "vitest";
import { parseApiDetail } from "./api-detail";
import type { MatchDetail } from "./detail";
import { SWING_THRESHOLD_SOULS, buildTimeline, filterTimeline, type TimelineEvent } from "./timeline";
import fixture from "./fixtures/api-paths.json";

type Json = Record<string, any>;

function detailOf(edit?: (info: Json) => void): MatchDetail {
    const root = structuredClone(fixture) as Json;
    edit?.(root.match_info);
    const detail = parseApiDetail(root);
    if (!detail) throw new Error("fixture did not parse");
    return detail;
}

const kind = <K extends TimelineEvent["kind"]>(events: TimelineEvent[], k: K) =>
    events.filter((e): e is Extract<TimelineEvent, { kind: K }> => e.kind === k);

function withNetWorth(bump: (team: number, n: number) => number) {
    return (i: Json) => {
        for (const p of i.players) {
            p.stats = p.stats.map((s: Json, n: number) => ({ ...s, net_worth: 10000 + bump(p.team, n) }));
        }
    };
}

describe("buildTimeline", () => {
    it("is sorted by time", () => {
        const times = buildTimeline(detailOf()).map((e) => e.timeS);
        expect(times).toEqual([...times].sort((a, b) => a - b));
    });

    it("lists every death at the recorded time with victim, killer and position", () => {
        const deaths = kind(buildTimeline(detailOf()), "death");
        const slot2 = deaths.filter((d) => d.victimSlot === 2);
        expect(slot2).toHaveLength(5);
        expect(slot2[0]).toMatchObject({
            timeS: 140,
            killerSlot: 7,
            victimTeam: "hidden-king",
            respawnS: 25,
            position: { x: 1146.3438, y: -67.5625, z: 384 },
        });
        expect(deaths).toHaveLength(9);
    });

    it("lists destroyed objectives and ignores placeholders at one second", () => {
        const objectives = kind(buildTimeline(detailOf()), "objective");
        expect(objectives.map((o) => [o.objectiveId, o.team, o.timeS])).toEqual([
            [3, "archmother", 324],
            [3, "hidden-king", 327],
            [1, "archmother", 445],
            [1, "hidden-king", 449],
            [7, "archmother", 734],
        ]);
    });

    it("skips objectives that were never destroyed", () => {
        const d = detailOf((i) => {
            i.objectives = [{ team_objective_id: 9, team: 0, destroyed_time_s: 0 }];
        });
        expect(kind(buildTimeline(d), "objective")).toEqual([]);
    });

    it("includes the mid boss", () => {
        const d = detailOf((i) => {
            i.mid_boss = [{ team_killed: 1, team_claimed: 0, destroyed_time_s: 900 }];
        });
        expect(kind(buildTimeline(d), "mid-boss")).toEqual([
            { kind: "mid-boss", timeS: 900, killedBy: "archmother", claimedBy: "hidden-king" },
        ]);
    });

    it("lists item buys with the buyer and sells when sold", () => {
        const d = detailOf((i) => {
            i.players[0].items[0].sold_time_s = 500;
        });
        const events = buildTimeline(d);
        const buys = kind(events, "item-buy").filter((e) => e.slot === 2);
        expect(buys).toHaveLength(fixture.match_info.players[0].items.length);
        expect(buys[0]).toMatchObject({ timeS: 12, itemId: 3077079169, team: "hidden-king" });
        expect(kind(events, "item-sell")).toEqual([
            { kind: "item-sell", timeS: 500, slot: 2, team: "hidden-king", itemId: 3077079169 },
        ]);
    });

    it("emits a swing when the lead moves by at least the threshold", () => {
        const d = detailOf(withNetWorth((team, n) => (team === 0 && n >= 1 ? SWING_THRESHOLD_SOULS : 0)));
        expect(kind(buildTimeline(d), "swing")).toEqual([
            {
                kind: "swing",
                timeS: 360,
                fromS: 180,
                team: "hidden-king",
                leadBefore: 0,
                leadAfter: SWING_THRESHOLD_SOULS,
            },
        ]);
    });

    it("emits no swing below the threshold", () => {
        const d = detailOf(withNetWorth((team, n) => (team === 0 && n >= 1 ? SWING_THRESHOLD_SOULS - 1 : 0)));
        expect(kind(buildTimeline(d), "swing")).toEqual([]);
    });

    it("attributes a lead flip to the side that gained", () => {
        const d = detailOf(
            withNetWorth((team, n) => (team === 0 ? (n === 0 ? SWING_THRESHOLD_SOULS : -SWING_THRESHOLD_SOULS) : 0)),
        );
        const swings = kind(buildTimeline(d), "swing");
        expect(swings).toHaveLength(1);
        expect(swings[0]).toMatchObject({ team: "archmother", leadBefore: SWING_THRESHOLD_SOULS });
    });

    it("builds with no stats at all", () => {
        const d = detailOf((i) => {
            for (const p of i.players) p.stats = [];
        });
        expect(kind(buildTimeline(d), "swing")).toEqual([]);
    });
});

describe("filterTimeline", () => {
    const events = buildTimeline(detailOf());

    it("keeps deaths where the player is the victim by default", () => {
        const out = filterTimeline(events, { kinds: ["death"], slot: 2 });
        expect(out).toHaveLength(5);
        expect(out.every((e) => e.kind === "death" && e.victimSlot === 2)).toBe(true);
    });

    it("can select deaths by killer", () => {
        const out = filterTimeline(events, { kinds: ["death"], slot: 7, role: "killer" });
        expect(out.length).toBeGreaterThan(0);
        expect(out.every((e) => e.kind === "death" && e.killerSlot === 7)).toBe(true);
    });

    it("filters by an inclusive time range", () => {
        const out = filterTimeline(events, { kinds: ["death"], fromS: 140, toS: 200 });
        expect(out.length).toBeGreaterThan(0);
        expect(out.every((e) => e.timeS >= 140 && e.timeS <= 200)).toBe(true);
        expect(out.some((e) => e.timeS === 140)).toBe(true);
    });

    it("drops team-level events when a slot is set", () => {
        const out = filterTimeline(events, { slot: 2 });
        expect(out.some((e) => e.kind === "objective" || e.kind === "swing" || e.kind === "mid-boss")).toBe(false);
    });

    it("returns everything with no options", () => {
        expect(filterTimeline(events, {})).toEqual(events);
    });
});
