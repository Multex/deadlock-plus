import type { MatchPingSeries } from "@deadlock-plus/ipc-types/MatchPingSeries";
import { describe, expect, it } from "vitest";
import { buildFrontPage, type FrontPageInput } from "./front-page";
import { comebackGrading, comebackMatch, rankedMatch, stompMatch } from "./test-fixtures";

const COMEBACK_WINNER = 1200002544;
/** Slot 6 on The Hidden King, 12th in the grades. */
const COMEBACK_LOSER = 1051686201;
const RANKED_VIEWER = 1012030591;

function page(input: Partial<FrontPageInput> & Pick<FrontPageInput, "detail">) {
    return buildFrontPage({ viewerAccountId: null, grades: null, ping: null, ...input });
}

describe("dateline", () => {
    it("carries mode, duration, date, winner and the viewer's result", () => {
        expect(page({ detail: rankedMatch(), viewerAccountId: RANKED_VIEWER }).dateline).toEqual({
            mode: "ranked",
            durationS: 1570,
            startTime: 1791622051,
            winner: "archmother",
            result: "loss",
        });
    });

    it("leaves out the date when the source has none, and the result when the viewer did not play", () => {
        const d = page({ detail: comebackMatch() }).dateline;
        expect(d).not.toHaveProperty("startTime");
        expect(d).not.toHaveProperty("result");
    });
});

describe("story placement", () => {
    it("puts the top story in the banner, two to four in columns and the rest in briefs", () => {
        const fp = page({ detail: comebackMatch(), viewerAccountId: COMEBACK_WINNER, grades: comebackGrading() });
        expect(fp.banner?.kind).toBe("comeback");
        expect(fp.columns.map((s) => s.kind)).toEqual(["critics_top", "viewer_line", "mid_boss"]);
        expect(fp.briefs.map((s) => s.kind)).toEqual([
            "patron_fall",
            "first_blood",
            "top_damage",
            "base_guardian_fall",
        ]);
    });

    it("always fills two columns when there are stories for them", () => {
        const fp = page({ detail: rankedMatch() });
        expect(fp.columns).toHaveLength(2);
        expect(fp.columns.every((s) => s.score < 40)).toBe(true);
    });
});

describe("box score", () => {
    it("puts the viewer's team first with team kills and rows by net worth", () => {
        const fp = page({ detail: comebackMatch(), viewerAccountId: COMEBACK_WINNER, grades: comebackGrading() });
        expect(fp.viewerSlot).toBe(12);
        expect(fp.teams.map((t) => [t.team, t.kills, t.won])).toEqual([
            ["archmother", 52, true],
            ["hidden-king", 53, false],
        ]);
        const rows = fp.teams[0].rows;
        expect(rows.map((r) => r.netWorth)).toEqual([...rows.map((r) => r.netWorth)].sort((a, b) => b - a));
        expect(rows.find((r) => r.slot === 12)).toMatchObject({
            viewer: true,
            kills: 9,
            deaths: 6,
            assists: 29,
            netWorth: 57936,
            damage: 50891,
            grade: { letter: "S-", place: 1 },
        });
    });

    it("leaves out stats the source did not record", () => {
        const row = page({ detail: comebackMatch() }).teams[0].rows[0];
        expect(row).not.toHaveProperty("healing");
        expect(row).not.toHaveProperty("grade");
        const noSamples = stompMatch((i) => i.players.forEach((p: Record<string, unknown>) => (p.stats = [])));
        expect(page({ detail: noSamples }).teams[0].rows[0]).not.toHaveProperty("damage");
    });

    it("keeps a recorded zero when others recorded the stat", () => {
        const detail = rankedMatch((i) => {
            const slot11 = i.players.find((p: { player_slot: number }) => p.player_slot === 11);
            slot11.stats.forEach((s: Record<string, unknown>) => (s.player_healing = 0));
        });
        const rows = page({ detail }).teams.flatMap((t) => t.rows);
        expect(rows.find((r) => r.slot === 11)?.healing).toBe(0);
        expect(rows.find((r) => r.slot === 2)?.healing).toBe(7938);
    });
});

describe("critics' ratings", () => {
    it("lists the top three and appends the viewer below them", () => {
        const fp = page({ detail: comebackMatch(), viewerAccountId: COMEBACK_LOSER, grades: comebackGrading() });
        expect(fp.ratings.map((r) => [r.slot, r.letter, r.place, r.viewer])).toEqual([
            [12, "S-", 1, false],
            [11, "B+", 2, false],
            [5, "B", 3, false],
            [6, "E", 12, true],
        ]);
        expect(fp.gradedCount).toBe(12);
    });

    it("takes a custom limit", () => {
        const fp = page({ detail: comebackMatch(), grades: comebackGrading(), ratingsLimit: 5 });
        expect(fp.ratings.map((r) => r.place)).toEqual([1, 2, 3, 4, 5]);
    });

    it("is empty without grades", () => {
        const fp = page({ detail: comebackMatch() });
        expect(fp.ratings).toEqual([]);
        expect(fp.gradedCount).toBe(0);
    });
});

describe("lane report", () => {
    it("gives each lane's heroes and The Hidden King's net worth lead at 10:00", () => {
        expect(page({ detail: rankedMatch() }).lanes).toEqual([
            { laneId: 1, color: "yellow", slots: { "hidden-king": [], archmother: [11] }, leadAt10: -6916 },
            { laneId: 4, color: "blue", slots: { "hidden-king": [2], archmother: [8] }, leadAt10: 3 },
            { laneId: 6, color: "green", slots: { "hidden-king": [4], archmother: [] }, leadAt10: 6340 },
        ]);
    });

    it("is empty when players carry no lane", () => {
        expect(page({ detail: comebackMatch() }).lanes).toEqual([]);
    });

    it("leaves out the lead for a match shorter than ten minutes", () => {
        const detail = rankedMatch((i) => (i.duration_s = 540));
        expect(page({ detail }).lanes.every((l) => !("leadAt10" in l))).toBe(true);
    });
});

describe("objectives timeline", () => {
    it("lists falls and Mid Boss claims in time order with the team that took them", () => {
        expect(page({ detail: rankedMatch() }).objectives).toEqual([
            { timeS: 333, kind: "guardian", lane: 2, owner: "hidden-king", by: "archmother" },
            { timeS: 365, kind: "guardian", lane: 3, owner: "archmother", by: "hidden-king" },
            { timeS: 387, kind: "guardian", lane: 1, owner: "hidden-king", by: "archmother" },
            { timeS: 695, kind: "guardian", lane: 2, owner: "archmother", by: "hidden-king" },
            { timeS: 736, kind: "guardian", lane: 3, owner: "hidden-king", by: "archmother" },
            { timeS: 816, kind: "walker", lane: 2, owner: "hidden-king", by: "archmother" },
            { timeS: 1210, kind: "mid_boss", by: "archmother", killedBy: "archmother" },
        ]);
    });
});

describe("weather", () => {
    const start = 1791622051 * 1000;
    const series = (raws: (number | null)[]): MatchPingSeries => ({
        source: "engine",
        partial: false,
        points: raws.map((raw, i) => ({ t: start + i * 10_000, raw })),
    });

    it("summarises the ping series", () => {
        expect(page({ detail: rankedMatch(), ping: series([40, 50, null, 30, 60]) }).weather).toEqual({
            avg: 45,
            worst: 60,
            jitter: 20,
            samples: 4,
            partial: false,
            forecast: "clear",
        });
    });

    it("turns stormy as ping climbs", () => {
        const forecast = (ms: number) => page({ detail: rankedMatch(), ping: series([ms, ms]) }).weather?.forecast;
        expect([forecast(49), forecast(50), forecast(99), forecast(100), forecast(150)]).toEqual([
            "clear",
            "fair",
            "fair",
            "overcast",
            "storm",
        ]);
    });

    it("is absent without a series or a direct ping", () => {
        expect(page({ detail: rankedMatch() })).not.toHaveProperty("weather");
        expect(page({ detail: rankedMatch(), ping: series([null, null]) })).not.toHaveProperty("weather");
    });

    it("leaves out jitter with a single sample", () => {
        expect(page({ detail: rankedMatch(), ping: series([40]) }).weather).not.toHaveProperty("jitter");
    });
});
