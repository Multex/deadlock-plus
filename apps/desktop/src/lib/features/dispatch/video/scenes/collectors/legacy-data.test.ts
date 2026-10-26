import { describe, expect, it } from "vitest";
import type { Edition, RankPoint } from "@deadlock-plus/stats/dispatch/types";
import type { RankTier } from "@deadlock-plus/stats/rank";
import { collectorsView, type CollectorsDeps } from "../../../kinds/collectors/view";
import { climbAt, collectorsSceneData, fill, parseSteps } from "./legacy-data";

const DAY = 86_400;
const START = Date.UTC(2026, 6, 30) / 1000;
const END = Date.UTC(2026, 10, 5, 22) / 1000;
const TIERS: RankTier[] = [
    { tier: 6, name: "Emissary", color: "#6a8f5a", image: "emissary.png" },
    { tier: 8, name: "Oracle", color: "#8a6aa8", image: "oracle.png" },
    { tier: 9, name: "Phantom", color: "#4b3a7a", image: "phantom.png" },
];
const fmt = (key: string, params?: Record<string, string | number>) =>
    params ? `${key}${JSON.stringify(params).replace("\\u0000", "\u0000")}` : key;
const deps: CollectorsDeps = {
    t: fmt,
    tn: (key, count, params) => fmt(`${key}_${count === 1 ? "one" : "other"}`, { count, ...params }),
    number: String,
    percent: (share) => `${Math.round(share * 100)}%`,
    dayRange: () => "Jul 30 – Nov 5, 2026",
    day: (s) => `day:${s}`,
    month: (s) => new Date(s * 1000).toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
    tiers: TIERS,
    hero: (id) => (id === 7 ? { name: "Lash", art: "lash.png" } : undefined),
};
const point = (day: number, badge: number, outcome: RankPoint["outcome"]): RankPoint => ({
    startS: START + day * DAY,
    badge,
    outcome,
});
const SERIES = [
    point(0, 64, "win"),
    point(20, 66, "win"),
    point(30, 65, "loss"),
    point(50, 81, "win"),
    point(80, 93, "win"),
    point(90, 86, "loss"),
];

const edition = {
    schema: 1,
    id: "collectors-season_1",
    window: { kind: "collectors", id: "collectors-season_1", startS: START, endS: END, tz: "UTC" },
    accountId: 90000001,
    number: 4,
    volume: 2026,
    issuedAt: END + 60,
    stats: { matches: 114, wins: 66, losses: 48, winrate: 66 / 114 },
    heroes: [
        { heroId: 7, games: 33, wins: 17, playtimeS: 1 },
        { heroId: 2, games: 18, wins: 9, playtimeS: 1 },
    ],
    longestWin: 9,
    rank: { startBadge: 64, endBadge: 86, peakBadge: 93, delta: 0 },
    season: { id: "season_1", name: "Beta Season 1", startS: START, endS: END },
    playerName: "Lantern",
    rankSeries: SERIES,
} as unknown as Edition;

const v = collectorsView(edition, deps);
const chart = v.chart!;

describe("Collector's Copy climb steps", () => {
    it("reads one step per ranked match from the chart's line, ending where the chart ends", () => {
        const { start, steps } = parseSteps(chart.line);
        expect(steps).toHaveLength(SERIES.length);
        expect(start.x).toBeCloseTo(chart.start.x, 1);
        expect(start.y).toBeCloseTo(chart.start.y, 1);
        expect(steps[chart.peak.index].x).toBeCloseTo(chart.peak.x, 1);
        expect(steps[chart.peak.index].y).toBeCloseTo(chart.peak.y, 1);
        expect(steps.at(-1)!.x).toBeCloseTo(chart.end.x, 1);
        expect(steps.at(-1)!.y).toBeCloseTo(chart.end.y, 1);
    });

    it("draws nothing past the start before the first match, and the whole climb at the end", () => {
        const { start, steps } = parseSteps(chart.line);
        expect(climbAt(start, steps, 0).points).toEqual([start]);
        const all = climbAt(start, steps, steps.length);
        expect(all.points.at(-1)).toEqual(steps.at(-1));
        expect(all.ups).toBe(chart.ups);
        expect(all.downs).toBe(chart.downs);
        expect(all.matches).toBe(steps.length);
    });

    it("glides along a match's flat before its step, then takes the step when the match is done", () => {
        const { start, steps } = parseSteps(chart.line);
        const half = climbAt(start, steps, 1.5);
        expect(half.matches).toBe(1);
        const head = half.points.at(-1)!;
        expect(head.y).toBeCloseTo(steps[0].y, 5);
        expect(head.x).toBeGreaterThan(steps[0].x);
        expect(head.x).toBeLessThan(steps[1].x);
        expect(climbAt(start, steps, 2).points.at(-1)).toEqual(steps[1]);
    });
});

describe("Collector's Copy scene data", () => {
    const data = collectorsSceneData(edition, v, { t: fmt, locale: "en", site: "deadlockplus.app" });

    it("carries each match's outcome with its step", () => {
        expect(data.chart?.steps.map((s) => s.outcome)).toEqual(SERIES.map((p) => p.outcome));
        expect(data.chart?.peakIndex).toBe(4);
    });

    it("keeps the numbers raw for the count-ups and their templates open", () => {
        expect(data.record).toEqual({ wins: 66, losses: 48 });
        expect(data.winrate).toBeCloseTo(66 / 114, 10);
        expect(data.text.recordValue).toBe('dispatch.collectors.record_value{"wins":"{wins}","losses":"{losses}"}');
        expect(data.text.matchOf).toBe('dispatch.collectors.match_of{"n":"{n}","total":"{total}"}');
    });

    it("lists the top three heroes with their lines and the certificate around the player's name", () => {
        expect(data.heroes.map((h) => h.id)).toEqual([7, 2]);
        expect(data.certificate.name).toBe("Lantern");
    });

    it("names the art the scene needs: the three badges and each tier rule's badge", () => {
        expect(data.art).toMatchObject({
            "badge:peak": "phantom.png",
            "badge:start": "emissary.png",
            "badge:end": "oracle.png",
        });
        for (const row of chart.rows.filter((r) => r.major))
            expect(data.art[`tier:${row.tier}`]).toBe(v.tierArt[row.tier] ?? null);
    });
});

describe("Collector's Copy text fill", () => {
    it("fills the holes it is given and leaves the rest", () => {
        expect(fill("{wins}–{losses}", { wins: "66", losses: "48" })).toBe("66–48");
        expect(fill("Match {n} of {total}", { n: "7" })).toBe("Match 7 of {total}");
    });
});
