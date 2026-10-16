import { describe, expect, it } from "vitest";
import {
    GRADED_STATS,
    displayValues,
    gradeMatch,
    letterFor,
    type CurvePoint,
    type GradedStat,
    type GradeInput,
    type StatMetrics,
} from "./grades";

const curve: CurvePoint[] = [
    { t: 180, avg: 6, std: 3 },
    { t: 360, avg: 12, std: 5 },
];

// q_p = percentile / avg: 0.2, 0.4, 0.5, 0.75, 1, 1.25, 1.5, 1.7, 2
const metrics: StatMetrics = {
    avg: 10,
    percentiles: { 1: 2, 5: 4, 10: 5, 25: 7.5, 50: 10, 75: 12.5, 90: 15, 95: 17, 99: 20 },
};

const perStat = <T>(value: T): Record<GradedStat, T> =>
    Object.fromEntries(GRADED_STATS.map((s) => [s, value])) as Record<GradedStat, T>;

const input = (over: {
    clockSecs?: number;
    values?: Partial<Record<GradedStat, number>>;
    curves?: Partial<Record<GradedStat, CurvePoint[]>>;
    metrics?: Partial<Record<GradedStat, StatMetrics>>;
}): GradeInput => ({
    clockSecs: over.clockSecs ?? 270,
    values: { ...perStat(9), ...over.values },
    targets: {
        curves: { ...perStat(curve), ...over.curves },
        metrics: { ...perStat(metrics), ...over.metrics },
    },
});

describe("letterFor", () => {
    it.each([
        [0, "E"],
        [9.99, "E"],
        [10, "D"],
        [24.99, "D"],
        [25, "C"],
        [49.99, "C"],
        [50, "B"],
        [74.99, "B"],
        [75, "A"],
        [89.99, "A"],
        [90, "S"],
        [100, "S"],
    ])("%s -> %s", (score, letter) => {
        expect(letterFor(score)).toBe(letter);
    });
});

describe("gradeMatch", () => {
    it("interpolates the curve between points", () => {
        const g = gradeMatch(input({ clockSecs: 270, values: { kills: 9 } }));
        expect(g.stats.kills.average).toBeCloseTo(9);
        expect(g.stats.kills.pct).toBeCloseTo(50);
        expect(g.stats.kills.letter).toBe("B");
        expect(g.frozen).toBe(false);
        expect(g.firstMinute).toBe(false);
    });

    it("interpolates from the prepended zero point before the first curve point", () => {
        const g = gradeMatch(input({ clockSecs: 90, values: { kills: 3 } }));
        expect(g.stats.kills.average).toBeCloseTo(3);
        expect(g.stats.kills.tooEarly).toBe(false);
        expect(g.stats.kills.pct).toBeCloseTo(50);
    });

    it("interpolates the percentile between shape points", () => {
        const g = gradeMatch(input({ clockSecs: 270, values: { kills: 9 * 0.875 } }));
        expect(g.stats.kills.pct).toBeCloseTo(37.5);
        expect(g.stats.kills.letter).toBe("C");
    });

    it("interpolates between the zero point and q1", () => {
        const g = gradeMatch(input({ clockSecs: 270, values: { kills: 9 * 0.1 } }));
        expect(g.stats.kills.pct).toBeCloseTo(0.5);
        expect(g.stats.kills.letter).toBe("E");
    });

    it("shows totals for K/D/A and healing, per minute for souls and damage", () => {
        const g = gradeMatch(
            input({
                clockSecs: 270,
                values: { assists: 9, healing: 900, souls: 9000, damage: 4500, objectiveDamage: 0 },
            }),
        );
        expect(g.stats.assists.value).toBe(9);
        expect(g.stats.assists.average).toBeCloseTo(9);
        expect(g.stats.healing.value).toBe(900);
        expect(g.stats.healing.average).toBeCloseTo(9);
        expect(g.stats.souls.value).toBeCloseTo(2000);
        expect(g.stats.souls.average).toBeCloseTo(2);
        expect(g.stats.damage.value).toBeCloseTo(1000);
        expect(g.stats.objectiveDamage.value).toBe(0);
    });

    it("keeps the per-minute rate past the last curve point and marks targets frozen", () => {
        const g = gradeMatch(input({ clockSecs: 720, values: { kills: 24 } }));
        expect(g.stats.kills.average).toBeCloseTo(24);
        expect(g.stats.kills.pct).toBeCloseTo(50);
        expect(g.frozen).toBe(true);
    });

    it("extrapolates the std dev too, so it can turn too early", () => {
        const g = gradeMatch(
            input({
                clockSecs: 720,
                curves: {
                    kills: [
                        { t: 180, avg: 6, std: 3 },
                        { t: 360, avg: 12, std: 13 },
                    ],
                },
            }),
        );
        expect(g.stats.kills.tooEarly).toBe(true);
    });

    it("is not frozen exactly at the last curve point", () => {
        expect(gradeMatch(input({ clockSecs: 360 })).frozen).toBe(false);
    });

    it("calls a stat too early when the std dev exceeds the average", () => {
        const g = gradeMatch(
            input({
                clockSecs: 270,
                curves: {
                    objectiveDamage: [
                        { t: 180, avg: 1, std: 4 },
                        { t: 360, avg: 3, std: 6 },
                    ],
                },
            }),
        );
        const obj = g.stats.objectiveDamage;
        expect(obj.tooEarly).toBe(true);
        expect(obj.pct).toBeNull();
        expect(obj.score).toBeNull();
        expect(obj.letter).toBeNull();
        expect(obj.value).toBeCloseTo(9 / 4.5);
        expect(obj.average).toBeCloseTo(2 / 4.5);
    });

    it("calls a stat too early when the average is zero", () => {
        const g = gradeMatch(
            input({
                clockSecs: 270,
                curves: {
                    healing: [
                        { t: 180, avg: 0, std: 0 },
                        { t: 360, avg: 0, std: 0 },
                    ],
                },
            }),
        );
        expect(g.stats.healing.tooEarly).toBe(true);
        expect(g.stats.healing.letter).toBeNull();
    });

    it("grades nothing before 60 s", () => {
        const g = gradeMatch(input({ clockSecs: 59, values: { kills: 1, souls: 590 } }));
        expect(g.firstMinute).toBe(true);
        expect(g.overall).toBeNull();
        for (const stat of GRADED_STATS) {
            expect(g.stats[stat].letter).toBeNull();
            expect(g.stats[stat].score).toBeNull();
            expect(g.stats[stat].tooEarly).toBe(false);
        }
        expect(g.stats.kills.value).toBe(1);
        expect(g.stats.souls.value).toBeCloseTo(600);
    });

    it("grades from 60 s on", () => {
        const g = gradeMatch(input({ clockSecs: 60, values: { kills: 2 } }));
        expect(g.firstMinute).toBe(false);
        expect(g.stats.kills.letter).toBe("B");
    });

    it("inverts deaths", () => {
        const g = gradeMatch(input({ clockSecs: 270, values: { deaths: 9 * 1.25 } }));
        expect(g.stats.deaths.pct).toBeCloseTo(75);
        expect(g.stats.deaths.score).toBeCloseTo(25);
        expect(g.stats.deaths.letter).toBe("C");
    });

    it("uses the middle of the p range where percentiles share one value", () => {
        const snapped: StatMetrics = {
            avg: 10,
            percentiles: { 1: 2, 5: 4, 10: 5, 25: 10, 50: 10, 75: 10, 90: 15, 95: 17, 99: 20 },
        };
        const g = gradeMatch(input({ clockSecs: 270, values: { kills: 9 }, metrics: { kills: snapped } }));
        expect(g.stats.kills.pct).toBeCloseTo(50);

        const low = gradeMatch(input({ clockSecs: 270, values: { kills: 9 * 0.75 }, metrics: { kills: snapped } }));
        expect(low.stats.kills.pct).toBeCloseTo(10 + (50 - 10) / 2);
    });

    it("includes the zero point in a run of zero percentiles", () => {
        const zeros: StatMetrics = {
            avg: 10,
            percentiles: { 1: 0, 5: 0, 10: 5, 25: 7.5, 50: 10, 75: 12.5, 90: 15, 95: 17, 99: 20 },
        };
        const g = gradeMatch(input({ clockSecs: 270, values: { deaths: 0 }, metrics: { deaths: zeros } }));
        expect(g.stats.deaths.pct).toBeCloseTo(2.5);
        expect(g.stats.deaths.score).toBeCloseTo(97.5);
    });

    it("gives 100 above q99", () => {
        const g = gradeMatch(input({ clockSecs: 270, values: { kills: 9 * 2.01 } }));
        expect(g.stats.kills.pct).toBe(100);
        expect(g.stats.kills.letter).toBe("S");
    });

    it("gives 99 exactly at q99", () => {
        const g = gradeMatch(input({ clockSecs: 270, values: { kills: 18 } }));
        expect(g.stats.kills.pct).toBeCloseTo(99);
    });

    it("averages the graded scores for the overall grade, leaving out too-early stats", () => {
        const g = gradeMatch(
            input({
                clockSecs: 270,
                values: {
                    kills: 18.09,
                    deaths: 9,
                    assists: 9,
                    souls: 9,
                    damage: 9,
                    objectiveDamage: 0,
                    healing: 9 * 0.875,
                },
                curves: {
                    objectiveDamage: [
                        { t: 180, avg: 1, std: 4 },
                        { t: 360, avg: 3, std: 6 },
                    ],
                },
            }),
        );
        // kills 100, deaths 50, assists 50, souls 50, damage 50, healing 37.5
        expect(g.overall?.score).toBeCloseTo(337.5 / 6);
        expect(g.overall?.letter).toBe("B");
    });

    it("has no overall grade when every stat is too early", () => {
        const empty = perStat<CurvePoint[]>([]);
        const g = gradeMatch(input({ clockSecs: 270, curves: empty }));
        expect(g.overall).toBeNull();
        expect(g.stats.kills.tooEarly).toBe(true);
    });
});

describe("displayValues", () => {
    it("keeps totals for K/D/A and healing, per minute for souls and damage", () => {
        const values = {
            kills: 3,
            deaths: 2,
            assists: 6,
            souls: 9000,
            damage: 6000,
            objectiveDamage: 1500,
            healing: 800,
        };
        expect(displayValues(values, 180)).toEqual({ ...values, souls: 3000, damage: 2000, objectiveDamage: 500 });
    });

    it("matches what gradeMatch shows", () => {
        const graded = gradeMatch(input({ clockSecs: 270, values: { souls: 4500, damage: 900 } }));
        const shown = Object.fromEntries(GRADED_STATS.map((s) => [s, graded.stats[s].value]));
        expect(displayValues({ ...perStat(9), souls: 4500, damage: 900 }, 270)).toEqual(shown);
    });

    it("shows 0 per minute at 0:00", () => {
        expect(displayValues(perStat(50), 0)).toMatchObject({ souls: 0, damage: 0, objectiveDamage: 0, kills: 50 });
    });
});
