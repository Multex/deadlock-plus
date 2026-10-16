export const GRADED_STATS = ["kills", "deaths", "assists", "souls", "damage", "objectiveDamage", "healing"] as const;
export type GradedStat = (typeof GRADED_STATS)[number];

export type Letter = "E" | "D" | "C" | "B" | "A" | "S";

export interface CurvePoint {
    t: number;
    avg: number;
    std: number;
}

export type PercentileKey = 1 | 5 | 10 | 25 | 50 | 75 | 90 | 95 | 99;

export interface StatMetrics {
    avg: number;
    percentiles: Record<PercentileKey, number>;
}

export interface GradeTargets {
    curves: Record<GradedStat, CurvePoint[]>;
    metrics: Record<GradedStat, StatMetrics>;
}

export interface GradeInput {
    clockSecs: number;
    values: Record<GradedStat, number>;
    targets: GradeTargets;
}

export interface StatGrade {
    value: number;
    average: number;
    pct: number | null;
    score: number | null;
    letter: Letter | null;
    tooEarly: boolean;
}

export interface MatchGrades {
    stats: Record<GradedStat, StatGrade>;
    overall: { score: number; letter: Letter } | null;
    frozen: boolean;
    firstMinute: boolean;
}

const PERCENTILES: PercentileKey[] = [1, 5, 10, 25, 50, 75, 90, 95, 99];
const PER_MINUTE: ReadonlySet<GradedStat> = new Set(["souls", "damage", "objectiveDamage"]);
const FIRST_GRADE_SECS = 60;

export function letterFor(score: number): Letter {
    if (score < 10) return "E";
    if (score < 25) return "D";
    if (score < 50) return "C";
    if (score < 75) return "B";
    if (score < 90) return "A";
    return "S";
}

function displayValue(stat: GradedStat, value: number, clockSecs: number): number {
    if (!PER_MINUTE.has(stat)) return value;
    return clockSecs > 0 ? value / (clockSecs / 60) : 0;
}

/** Values as the tiles show them: totals, except per minute for souls, damage and objective damage. */
export function displayValues(values: Record<GradedStat, number>, clockSecs: number): Record<GradedStat, number> {
    return Object.fromEntries(GRADED_STATS.map((s) => [s, displayValue(s, values[s], clockSecs)])) as Record<
        GradedStat,
        number
    >;
}

function curveAt(points: CurvePoint[], t: number): { avg: number; std: number; frozen: boolean } {
    const pts = [{ t: 0, avg: 0, std: 0 }, ...[...points].sort((a, b) => a.t - b.t)];
    const last = pts[pts.length - 1];
    if (t > last.t) {
        if (last.t <= 0) return { avg: 0, std: 0, frozen: false };
        return { avg: (last.avg * t) / last.t, std: (last.std * t) / last.t, frozen: true };
    }
    const i = pts.findIndex((p) => p.t >= t);
    const hi = pts[i];
    const lo = pts[Math.max(i - 1, 0)];
    const f = hi.t === lo.t ? 1 : (t - lo.t) / (hi.t - lo.t);
    return { avg: lo.avg + f * (hi.avg - lo.avg), std: lo.std + f * (hi.std - lo.std), frozen: false };
}

/** Shape points `(q, p)` with runs of equal q collapsed to the middle of their p range. */
function shape(metrics: StatMetrics): { q: number; p: number }[] {
    const raw = [{ q: 0, p: 0 }, ...PERCENTILES.map((p) => ({ q: metrics.percentiles[p] / metrics.avg, p }))];
    const out: { q: number; p: number }[] = [];
    let runStart = 0;
    for (let i = 1; i <= raw.length; i++) {
        if (i < raw.length && raw[i].q === raw[runStart].q) continue;
        out.push({ q: raw[runStart].q, p: (raw[runStart].p + raw[i - 1].p) / 2 });
        runStart = i;
    }
    return out;
}

function percentileOf(r: number, metrics: StatMetrics): number {
    const pts = shape(metrics);
    const top = pts[pts.length - 1];
    if (r > top.q) return 100;
    const i = pts.findIndex((pt) => pt.q >= r);
    const hi = pts[i];
    if (i === 0 || hi.q === r) return hi.p;
    const lo = pts[i - 1];
    return lo.p + ((r - lo.q) / (hi.q - lo.q)) * (hi.p - lo.p);
}

export function gradeMatch(input: GradeInput): MatchGrades {
    const t = input.clockSecs;
    const firstMinute = t < FIRST_GRADE_SECS;
    let frozen = false;
    const scores: number[] = [];

    const stats = {} as Record<GradedStat, StatGrade>;
    for (const stat of GRADED_STATS) {
        const v = input.values[stat];
        const curve = curveAt(input.targets.curves[stat], t);
        const display = (x: number) => displayValue(stat, x, t);
        const grade: StatGrade = {
            value: display(v),
            average: display(curve.avg),
            pct: null,
            score: null,
            letter: null,
            tooEarly: false,
        };
        stats[stat] = grade;
        if (firstMinute) continue;

        frozen ||= curve.frozen;
        if (curve.avg <= 0 || curve.std > curve.avg) {
            grade.tooEarly = true;
            continue;
        }
        const pct = percentileOf(v / curve.avg, input.targets.metrics[stat]);
        const score = stat === "deaths" ? 100 - pct : pct;
        grade.pct = pct;
        grade.score = score;
        grade.letter = letterFor(score);
        scores.push(score);
    }

    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const overall = scores.length > 0 ? { score: mean, letter: letterFor(mean) } : null;

    return { stats, overall, frozen, firstMinute };
}
