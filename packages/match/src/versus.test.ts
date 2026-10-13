import { describe, expect, it } from "vitest";
import type { MatchRow } from "./list";
import { MIN_VERSUS_SAMPLES, summarizeVersus, versusFor, type Own } from "./versus";

const row = (over: Partial<MatchRow> = {}): MatchRow => ({
    matchId: 1,
    heroId: 10,
    outcome: "win",
    mode: "ranked",
    kills: 10,
    deaths: 4,
    assists: 8,
    souls: 30000,
    durationS: 1800,
    startTime: 1000,
    rankBadge: 63,
    rankDelta: 12,
    calibration: false,
    source: "api",
    ...over,
});

const history = (n: number, over: Partial<MatchRow> = {}) =>
    Array.from({ length: n }, (_, i) => row({ matchId: 100 + i, ...over }));

const own = (over: Partial<Own> = {}): Own => ({
    heroId: 10,
    kills: 10,
    deaths: 4,
    assists: 8,
    souls: 30000,
    durationS: 1800,
    ...over,
});

describe("versusFor", () => {
    it("returns null below the sample threshold", () => {
        expect(versusFor(history(MIN_VERSUS_SAMPLES - 1), own(), 999)).toBeNull();
    });

    it("averages the same hero only and excludes the current match", () => {
        const rows = [
            ...history(2, { kills: 6 }),
            row({ matchId: 999, kills: 100 }),
            row({ matchId: 50, kills: 12 }),
            row({ matchId: 51, heroId: 77, kills: 50 }),
        ];
        const v = versusFor(rows, own({ kills: 9 }), 999);
        expect(v?.samples).toBe(3);
        expect(v?.stats.kills?.average).toBe(8);
    });

    it("marks above, below and equal with a tolerance", () => {
        const rows = history(3, { kills: 10, deaths: 4, assists: 8 });
        const v = versusFor(rows, own({ kills: 15, deaths: 2, assists: 8 }), 999);
        expect(v?.stats.kills?.mark).toBe("above");
        expect(v?.stats.deaths?.mark).toBe("below");
        expect(v?.stats.assists?.mark).toBe("equal");
    });

    it("treats a value within tolerance as equal", () => {
        const rows = history(3, { kills: 10 });
        expect(versusFor(rows, own({ kills: 10 }), 999)?.stats.kills?.mark).toBe("equal");
    });

    it("compares souls as a per-minute rate", () => {
        const rows = history(3, { souls: 30000, durationS: 1800 });
        const v = versusFor(rows, own({ souls: 30000, durationS: 900 }), 999);
        expect(v?.stats.souls?.average).toBeCloseTo(1000);
        expect(v?.stats.souls?.value).toBeCloseTo(2000);
        expect(v?.stats.souls?.mark).toBe("above");
    });

    it("skips souls when the current match has no duration", () => {
        const v = versusFor(history(3), own({ durationS: 0 }), 999);
        expect(v?.stats.souls).toBeNull();
        expect(v?.stats.kills).not.toBeNull();
    });

    it("ignores provisional, unscored, custom and bot rows", () => {
        const rows = [
            ...history(2),
            row({ matchId: 200, source: "provisional" }),
            row({ matchId: 201, outcome: "unscored" }),
            row({ matchId: 202, mode: "custom" }),
            row({ matchId: 203, mode: "bot" }),
        ];
        expect(versusFor(rows, own(), 999)).toBeNull();
    });

    it("works when the current match is not in the list", () => {
        expect(versusFor(history(3), own(), 424242)?.samples).toBe(3);
    });
});

describe("summarizeVersus", () => {
    it("counts better and worse, with fewer deaths as better", () => {
        const rows = history(3);
        const v = versusFor(rows, own({ kills: 20, deaths: 8, assists: 8 }), 999);
        expect(v && summarizeVersus(v)).toEqual({ better: 1, worse: 1, even: 2 });
    });
});
