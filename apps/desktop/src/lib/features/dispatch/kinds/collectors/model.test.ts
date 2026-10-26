import { describe, expect, it } from "vitest";
import type { RankPoint } from "@deadlock-plus/stats/dispatch/types";
import {
    arcRepeats,
    barsOf,
    calloutBox,
    climbChart,
    climbSteps,
    peakOf,
    rankStep,
    seasonCode,
    serialOf,
    topHeroes,
} from "./model";

const DAY = 86_400;
// 2026-07-30 00:00Z to 2026-11-05 22:00Z, the demo's first ranked season.
const START = Date.UTC(2026, 6, 30) / 1000;
const END = Date.UTC(2026, 10, 5, 22) / 1000;
const TIERS: Record<number, string> = { 1: "Initiate", 6: "Emissary", 7: "Archon", 8: "Oracle", 9: "Phantom" };
const tierName = (tier: number) => TIERS[tier] ?? null;
const month = (s: number) => new Date(s * 1000).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
const point = (day: number, badge: number, outcome: RankPoint["outcome"] = "win"): RankPoint => ({
    startS: START + day * DAY,
    badge,
    outcome,
});

describe("serialOf", () => {
    it("is the same six digits for the same account and season", () => {
        expect(serialOf(90000001, "season_1")).toBe(serialOf(90000001, "season_1"));
        expect(serialOf(90000001, "season_1")).toMatch(/^\d{6}$/);
    });

    it("differs between accounts and between seasons", () => {
        expect(serialOf(90000001, "season_1")).not.toBe(serialOf(90000002, "season_1"));
        expect(serialOf(90000001, "season_1")).not.toBe(serialOf(90000001, "season_2"));
    });

    it("never prints below 001000", () => {
        for (let id = 1; id < 400; id++) expect(Number(serialOf(id, "s"))).toBeGreaterThanOrEqual(1000);
    });
});

describe("barsOf", () => {
    it("starts and ends with the guard bars and grows with the serial", () => {
        const bars = barsOf("239522");
        expect(bars.slice(0, 4)).toEqual([3, 1, 1, 1]);
        expect(bars.slice(-3)).toEqual([1, 1, 3]);
        expect(bars).toHaveLength(4 + 12 * 4 + 3);
        expect(barsOf("239522")).toEqual(bars);
        expect(barsOf("100000")).not.toEqual(bars);
    });
});

describe("rankStep and climbSteps", () => {
    it("counts six subranks a tier", () => {
        expect(rankStep(64)).toBe(6 * 6 + 3);
        expect(rankStep(81)).toBe(8 * 6);
        expect(rankStep(0)).toBe(0);
    });

    it("measures the climb from the first badge to the last", () => {
        expect(climbSteps({ startBadge: 64, endBadge: 86, peakBadge: 93, delta: 0 })).toBe(14);
        expect(climbSteps({ startBadge: 86, endBadge: 84, peakBadge: 86, delta: 0 })).toBe(-2);
        expect(climbSteps(null)).toBeNull();
    });
});

describe("seasonCode", () => {
    it("shortens the API's class name to S and its number", () => {
        expect(seasonCode("season_1")).toBe("S1");
        expect(seasonCode("season_12")).toBe("S12");
    });

    it("gives nothing for an id without a number", () => {
        expect(seasonCode("beta")).toBeNull();
        expect(seasonCode(undefined)).toBeNull();
    });
});

describe("peakOf", () => {
    it("finds the first match at the highest badge", () => {
        const series = [point(0, 64), point(3, 93), point(5, 91, "loss"), point(9, 93)];
        expect(peakOf(series)).toEqual({ index: 1, startS: START + 3 * DAY, badge: 93 });
    });

    it("has no peak without a series", () => {
        expect(peakOf(undefined)).toBeNull();
        expect(peakOf([])).toBeNull();
    });
});

describe("climbChart", () => {
    const series = [point(0, 64), point(10, 65), point(40, 81), point(60, 82), point(70, 81, "loss"), point(90, 86)];
    const chart = climbChart(series, START, END, { width: 624, height: 470, month, tierName })!;

    it("draws nothing for fewer than two points", () => {
        expect(climbChart([point(0, 64)], START, END, { width: 624, height: 470, month, tierName })).toBeNull();
        expect(climbChart(undefined, START, END, { width: 624, height: 470, month, tierName })).toBeNull();
    });

    it("steps the line along each match and starts at the season's first second", () => {
        expect(chart.line.startsWith(`M${chart.pad.l.toFixed(1)} `)).toBe(true);
        expect(chart.line.match(/V/g)).toHaveLength(5);
        expect(chart.area.endsWith("Z")).toBe(true);
    });

    it("keeps one row a subrank from one under the lowest to one over the highest", () => {
        const labels = chart.rows.map((r) => r.label);
        expect(labels).toHaveLength(17);
        expect(labels.slice(0, 5)).toEqual(["Emissary 3", "Emissary 4", "Emissary 5", "Emissary 6", "Archon 1"]);
        expect(labels.slice(-2)).toEqual(["Oracle 6", "Phantom 1"]);
        expect(chart.rows.filter((r) => r.major).map((r) => r.tier)).toEqual([7, 8, 9]);
        expect(chart.rows.every((r) => r.labelled)).toBe(true);
        expect(chart.rows[0].y).toBeGreaterThan(chart.rows.at(-1)!.y);
    });

    it("adds no edge row for a tier the API does not name", () => {
        const archonless = (tier: number) => (tier === 7 ? null : tierName(tier));
        const c = climbChart([point(0, 64), point(5, 66)], START, END, {
            width: 624,
            height: 470,
            month,
            tierName: archonless,
        })!;
        expect(c.rows.map((r) => r.label)).toEqual(["Emissary 3", "Emissary 4", "Emissary 5", "Emissary 6"]);
    });

    it("labels only the first subrank of each tier once rows would crowd", () => {
        const wide = climbChart([point(0, 11), point(5, 96)], START, END, {
            width: 624,
            height: 470,
            month,
            tierName,
        })!;
        expect(wide.rows.length).toBeGreaterThan(40);
        expect(wide.rows.filter((r) => r.labelled).every((r) => r.major)).toBe(true);
    });

    it("puts a month label at each month start inside the season, flipping the last one inward", () => {
        expect(chart.months.map((m) => m.label)).toEqual(["Aug", "Sep", "Oct", "Nov"]);
        expect(chart.months.at(-1)!.anchor).toBe("end");
        expect(chart.months[0].anchor).toBe("start");
        for (const m of chart.months) expect(m.textX).toBeLessThanOrEqual(624);
    });

    it("marks the peak at its first match and counts moves up and down", () => {
        expect(chart.peak.index).toBe(5);
        expect(chart.ups).toBe(4);
        expect(chart.downs).toBe(1);
        expect(chart.end.x).toBeCloseTo(chart.pad.l + ((90 * DAY) / (END - START)) * (624 - chart.pad.l - chart.pad.r));
    });
});

describe("calloutBox", () => {
    const bounds = { left: 118, right: 602, top: 26 };

    it("sits above and left of the peak", () => {
        expect(calloutBox({ x: 400, y: 200 }, "Phantom 3", bounds)).toEqual({ x: 330, y: 138, width: 150 });
    });

    it("stays inside the plot on the right and drops below a peak at the top", () => {
        const box = calloutBox({ x: 600, y: 30 }, "Phantom 3", bounds);
        expect(box.x + box.width).toBeLessThanOrEqual(602);
        expect(box.y).toBeGreaterThan(30);
    });

    it("widens for a long rank name", () => {
        expect(calloutBox({ x: 400, y: 200 }, "Ascendantissimus 6", bounds).width).toBeGreaterThan(150);
    });
});

describe("arcRepeats", () => {
    it("repeats a short line to go round the ring", () => {
        expect(arcRepeats(30)).toBe(3);
    });

    it("never repeats less than once", () => {
        expect(arcRepeats(200)).toBe(1);
    });
});

describe("topHeroes", () => {
    it("keeps the three most played, playtime then id breaking ties", () => {
        const h = (heroId: number, games: number, playtimeS = 0) => ({ heroId, games, wins: 0, playtimeS });
        expect(topHeroes([h(1, 5), h(2, 9), h(3, 5, 100), h(4, 7), h(5, 5, 100)]).map((x) => x.heroId)).toEqual([
            2, 4, 3,
        ]);
    });
});
