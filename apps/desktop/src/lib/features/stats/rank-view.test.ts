import { describe, expect, it } from "vitest";
import { badgeName, buildRankChart, partsName, tierName } from "./rank-view";
import type { ProgressPoint, RankTier } from "@deadlock-plus/stats/rank";

const ranks: RankTier[] = [
    { tier: 1, name: "Initiate", color: "#111", image: null },
    { tier: 2, name: "Seeker", color: "#222", image: null },
];

const point = (i: number, flat: number, over: Partial<ProgressPoint> = {}): ProgressPoint => ({
    matchId: i,
    heroId: 1,
    startTime: 1_700_000_000 + i * 3600,
    badge: 11,
    delta: 0,
    outcome: "win",
    demotionProtected: false,
    flat,
    ...over,
});

describe("names", () => {
    it("uses the tier name and subrank", () => {
        expect(tierName(ranks, 2)).toBe("Seeker");
        expect(partsName(ranks, { tier: 2, sub: 3 })).toBe("Seeker 3");
    });
    it("falls back for unknown tiers", () => {
        expect(partsName(ranks, { tier: 9, sub: 1 })).toBe("Tier 9 1");
    });
    it("names a badge, dash when unranked", () => {
        expect(badgeName(ranks, 12)).toBe("Initiate 2");
        expect(badgeName(ranks, 0)).toBe("-");
    });
});

describe("buildRankChart", () => {
    it("needs two points", () => {
        expect(buildRankChart([point(1, 500)], 50, ranks)).toBeNull();
        expect(buildRankChart([], 50, ranks)).toBeNull();
    });

    it("draws one dot per point inside the plot", () => {
        const chart = buildRankChart([point(1, 500), point(2, 1500), point(3, 2500)], 50, ranks)!;
        expect(chart.dots).toHaveLength(3);
        expect(chart.d.startsWith("M")).toBe(true);
        expect(chart.d.match(/L/g)).toHaveLength(2);
        expect(chart.dots[0].cx).toBeLessThan(chart.dots[2].cx);
        expect(chart.dots[0].cy).toBeGreaterThan(chart.dots[2].cy);
    });

    it("keeps only the last N points", () => {
        const pts = [point(1, 100), point(2, 200), point(3, 300), point(4, 400)];
        expect(buildRankChart(pts, 2, ranks)!.dots.map((d) => d.p.matchId)).toEqual([3, 4]);
    });

    it("labels subrank edges", () => {
        const chart = buildRankChart([point(1, 500), point(2, 2500)], 50, ranks)!;
        expect(chart.lines.map((l) => l.label)).toEqual(["Initiate 1", "Initiate 2", "Initiate 3", "Initiate 4"]);
    });

    it("still draws when rebuilt progress dips below zero", () => {
        const chart = buildRankChart([point(1, -500), point(2, 1500)], 50, ranks)!;
        expect(chart.dots).toHaveLength(2);
        expect(chart.lines.length).toBeGreaterThan(0);
    });
});

describe("buildRankChart marks", () => {
    const badges = (bs: number[]) => bs.map((badge, i) => point(i + 1, 1000 + i * 100, { badge }));

    it("marks each badge change on the dot of the match it happened in", () => {
        const chart = buildRankChart(badges([11, 11, 12, 12, 11]), 50, ranks)!;
        expect(chart.marks.map((m) => [m.matchId, m.promoted])).toEqual([
            [3, true],
            [5, false],
        ]);
        expect(chart.marks[0].cx).toBe(chart.dots[2].cx);
        expect(chart.marks[0].cy).toBe(chart.dots[2].cy);
        expect(chart.marks[1].cx).toBe(chart.dots[4].cx);
    });

    it("names the change in its label", () => {
        const chart = buildRankChart(badges([11, 12, 11]), 50, ranks)!;
        expect(chart.marks[0].label).toContain("Initiate 2");
        expect(chart.marks[0].label).toContain("Promoted from Initiate 1");
        expect(chart.marks[1].label).toContain("Demoted from Initiate 2");
    });

    it("marks a change on the first shown match against the match before the window", () => {
        const chart = buildRankChart(badges([11, 12, 12]), 2, ranks)!;
        expect(chart.marks.map((m) => m.matchId)).toEqual([2]);
        expect(chart.marks[0].cx).toBe(chart.dots[0].cx);
    });

    it("has no marks when the badge never changes", () => {
        expect(buildRankChart(badges([11, 11, 11]), 50, ranks)!.marks).toEqual([]);
    });
});
